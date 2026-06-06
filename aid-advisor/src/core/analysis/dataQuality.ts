import type { Dataset } from '../types.ts';
import type { Finding } from '../findings.ts';
import { makeFinding } from '../findings.ts';
import { DAY_MS, MINUTE_MS, dayCount } from '../util/time.ts';
import { round } from '../util/stats.ts';

/** Nominal CGM cadence; both Dexcom and Libre report ~every 5 minutes. */
const CADENCE_MIN = 5;
const READINGS_PER_DAY = (24 * 60) / CADENCE_MIN; // 288
const GAP_THRESHOLD_MIN = 30;

/**
 * Assesses how complete and trustworthy the dataset is. This is foundational:
 * every downstream observation is only as good as the coverage it rests on,
 * and AID readiness depends heavily on consistent CGM data plus logged carbs
 * and boluses.
 */
export function analyseDataQuality(ds: Dataset): Finding[] {
  const findings: Finding[] = [];
  const days = dayCount(ds.window.startMs, ds.window.endMs);
  const expected = days * READINGS_PER_DAY;
  const actual = ds.entries.length;
  const coverage = expected > 0 ? Math.min(100, (actual / expected) * 100) : 0;

  // CGM coverage.
  findings.push(
    makeFinding({
      id: 'cgm.coverage',
      domain: 'data-quality',
      severity: coverage >= 70 ? 'info' : 'attention',
      title:
        coverage >= 70
          ? `CGM coverage was ${round(coverage)}% over ${days} day(s)`
          : `CGM coverage was limited at ${round(coverage)}% over ${days} day(s)`,
      detail: `${actual} sensor readings were available against roughly ${expected} expected at a 5-minute cadence. Pattern analyses are most reliable above about 70% coverage.`,
      metrics: { coveragePct: round(coverage), readings: actual, expected, days },
      window: ds.window,
    }),
  );

  // Gaps in sensor data.
  let longestGapMin = 0;
  let gapCount = 0;
  for (let i = 1; i < ds.entries.length; i++) {
    const gapMin = (ds.entries[i]!.date - ds.entries[i - 1]!.date) / MINUTE_MS;
    if (gapMin > GAP_THRESHOLD_MIN) {
      gapCount++;
      longestGapMin = Math.max(longestGapMin, gapMin);
    }
  }
  if (gapCount > 0) {
    findings.push(
      makeFinding({
        id: 'cgm.gaps',
        domain: 'data-quality',
        severity: longestGapMin > 6 * 60 ? 'attention' : 'observation',
        title: `${gapCount} sensor gap(s) over 30 minutes were present`,
        detail: `The longest single gap was about ${round(longestGapMin / 60)} hour(s). Extended gaps reduce confidence in overnight and post-meal pattern detection.`,
        metrics: { gaps: gapCount, longestGapHours: round(longestGapMin / 60) },
        window: ds.window,
      }),
    );
  }

  // Treatment logging completeness — needed for bolus/meal analysis and AID.
  const bolusEvents = ds.treatments.filter((t) => (t.insulin ?? 0) > 0).length;
  const carbEvents = ds.treatments.filter((t) => (t.carbs ?? 0) > 0).length;
  const bolusesPerDay = bolusEvents / days;
  const carbsPerDay = carbEvents / days;
  const sparselyLogged = bolusesPerDay < 2 || carbsPerDay < 1.5;
  findings.push(
    makeFinding({
      id: 'logging.treatments',
      domain: 'data-quality',
      severity: sparselyLogged ? 'attention' : 'info',
      title: sparselyLogged
        ? 'Bolus and/or carb logging looks sparse'
        : 'Bolus and carb events are being logged regularly',
      detail: `Averaged ${round(bolusesPerDay)} bolus events and ${round(carbsPerDay)} carb entries per day. Meal-timing and AID-readiness observations rely on these being captured consistently.`,
      metrics: {
        bolusEvents,
        carbEvents,
        bolusesPerDay: round(bolusesPerDay),
        carbsPerDay: round(carbsPerDay),
      },
      window: ds.window,
    }),
  );

  return findings;
}

export { READINGS_PER_DAY, DAY_MS };
