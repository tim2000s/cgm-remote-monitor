import type { Dataset, Entry } from '../types.ts';
import type { Finding } from '../findings.ts';
import { makeFinding } from '../findings.ts';
import { formatGlucose } from '../util/glucose.ts';
import { linearSlope, median, round } from '../util/stats.ts';
import { HOUR_MS, inHourWindow, localDayKey, localHour } from '../util/time.ts';

/** Overnight fasting window used to observe basal-driven drift. */
const NIGHT_START = 0;
const NIGHT_END = 6;
/** A nightly slope this steep (mg/dL per hour) is treated as a clear trend. */
const DRIFT_SLOPE = 8;

interface NightSlope {
  day: string;
  slopePerHour: number;
  startSgv: number;
  endSgv: number;
}

/**
 * Looks at fasting overnight windows (no carbs logged) and measures the
 * direction glucose tends to drift. A consistent overnight rise or fall is
 * the classic signature of an overnight basal mismatch — but this layer only
 * reports the observed pattern and its consistency; it does not propose a
 * basal change. That decision stays with the person and their clinician.
 */
export function analyseBasalPatterns(ds: Dataset): Finding[] {
  const findings: Finding[] = [];

  // Identify days where carbs were logged overnight; exclude those nights so
  // we observe basal behaviour rather than meal responses.
  const carbNights = new Set<string>();
  for (const t of ds.treatments) {
    if ((t.carbs ?? 0) > 0) {
      const h = localHour(t.mills, ds.tzOffsetMinutes);
      if (inHourWindow(h, NIGHT_START, NIGHT_END)) {
        carbNights.add(localDayKey(t.mills, ds.tzOffsetMinutes));
      }
    }
  }

  // Bucket overnight entries by local day.
  const byNight = new Map<string, Entry[]>();
  for (const e of ds.entries) {
    const h = localHour(e.date, ds.tzOffsetMinutes);
    if (!inHourWindow(h, NIGHT_START, NIGHT_END)) continue;
    const key = localDayKey(e.date, ds.tzOffsetMinutes);
    if (carbNights.has(key)) continue;
    (byNight.get(key) ?? byNight.set(key, []).get(key)!).push(e);
  }

  const slopes: NightSlope[] = [];
  for (const [day, entries] of byNight) {
    if (entries.length < 12) continue; // need ~1h+ of data to trust a slope
    entries.sort((a, b) => a.date - b.date);
    const xs = entries.map((e) => e.date / HOUR_MS);
    const ys = entries.map((e) => e.sgv);
    const slope = linearSlope(xs, ys);
    if (!isFinite(slope)) continue;
    slopes.push({
      day,
      slopePerHour: slope,
      startSgv: entries[0]!.sgv,
      endSgv: entries[entries.length - 1]!.sgv,
    });
  }

  if (slopes.length < 3) {
    findings.push(
      makeFinding({
        id: 'basal.overnight.insufficient',
        domain: 'basal',
        severity: 'info',
        title: 'Not enough fasting overnight windows to assess basal drift',
        detail: `Only ${slopes.length} carb-free overnight window(s) with sufficient sensor data were available. More nights improve confidence in overnight pattern observations.`,
        metrics: { usableNights: slopes.length },
        window: ds.window,
      }),
    );
    return findings;
  }

  const slopeValues = slopes.map((s) => s.slopePerHour);
  const medianSlope = median(slopeValues);
  const risingNights = slopes.filter((s) => s.slopePerHour >= DRIFT_SLOPE).length;
  const fallingNights = slopes.filter((s) => s.slopePerHour <= -DRIFT_SLOPE).length;
  const unit = ds.displayUnit;

  let direction: 'rising' | 'falling' | 'stable';
  if (medianSlope >= DRIFT_SLOPE / 2) direction = 'rising';
  else if (medianSlope <= -DRIFT_SLOPE / 2) direction = 'falling';
  else direction = 'stable';

  const severity = direction === 'stable' ? 'info' : 'observation';
  const verb = direction === 'rising' ? 'rise' : 'fall';
  const consistency =
    direction === 'rising' ? risingNights : direction === 'falling' ? fallingNights : 0;

  findings.push(
    makeFinding({
      id: `basal.overnight.${direction}`,
      domain: 'basal',
      severity,
      title:
        direction === 'stable'
          ? 'Overnight fasting glucose tended to hold steady'
          : `Overnight fasting glucose tended to ${verb} (~${round(Math.abs(medianSlope))} mg/dL per hour)`,
      detail:
        direction === 'stable'
          ? `Across ${slopes.length} fasting nights the median overnight slope was near flat (${round(medianSlope)} mg/dL per hour).`
          : `Across ${slopes.length} fasting nights the median overnight slope was ${round(medianSlope)} mg/dL per hour, ${direction} on ${consistency} of them. Median start ${formatGlucose(median(slopes.map((s) => s.startSgv)), unit)}, end ${formatGlucose(median(slopes.map((s) => s.endSgv)), unit)}.`,
      metrics: {
        nights: slopes.length,
        medianSlopePerHour: round(medianSlope),
        risingNights,
        fallingNights,
      },
      window: ds.window,
    }),
  );

  return findings;
}
