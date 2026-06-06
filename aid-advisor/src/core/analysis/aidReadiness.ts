import type { Dataset, ProfileBlock } from '../types.ts';
import type { Finding, Severity } from '../findings.ts';
import { makeFinding } from '../findings.ts';
import { normaliseSensValue } from '../util/glucose.ts';
import { round } from '../util/stats.ts';
import { dayCount } from '../util/time.ts';
import { READINGS_PER_DAY } from './dataQuality.ts';

type CheckStatus = 'pass' | 'review' | 'gap';

const STATUS_SEVERITY: Record<CheckStatus, Severity> = {
  pass: 'info',
  review: 'observation',
  gap: 'attention',
};

interface Check {
  id: string;
  status: CheckStatus;
  title: string;
  detail: string;
  metrics: Record<string, number | string>;
}

function totalDailyBasal(profile: ProfileBlock): number {
  // Integrate the step schedule across 24h.
  const segs = [...profile.basal].sort((a, b) => a.timeAsSeconds - b.timeAsSeconds);
  let total = 0;
  for (let i = 0; i < segs.length; i++) {
    const start = segs[i]!.timeAsSeconds;
    const end = i + 1 < segs.length ? segs[i + 1]!.timeAsSeconds : 24 * 3600;
    total += segs[i]!.value * ((end - start) / 3600);
  }
  return total;
}

function profileChecks(profile: ProfileBlock | null): Check[] {
  if (!profile) {
    return [
      {
        id: 'readiness.profile.missing',
        status: 'gap',
        title: 'No therapy profile was found in Nightscout',
        detail:
          'An AID setup is seeded from an existing basal schedule, insulin sensitivity, and carb ratios. None were readable from the profile store.',
        metrics: {},
      },
    ];
  }
  const checks: Check[] = [];

  // Basal schedule.
  const tdb = totalDailyBasal(profile);
  const basalSane = profile.basal.every((s) => s.value >= 0.0 && s.value <= 5) && tdb > 0.1;
  checks.push({
    id: 'readiness.basal',
    status: basalSane ? 'pass' : 'review',
    title: basalSane
      ? `A 24-hour basal schedule is present (~${round(tdb)} U/day)`
      : 'The basal schedule has values outside the usual range',
    detail: `${profile.basal.length} basal segment(s) totalling about ${round(tdb)} U per day. AID needs a complete, plausible 24-hour basal pattern as a starting point.`,
    metrics: { segments: profile.basal.length, totalDailyBasalU: round(tdb) },
  });

  // Insulin sensitivity.
  const sensVals = profile.sens.map((s) => normaliseSensValue(s.value, profile.units));
  const sensSane = sensVals.length > 0 && sensVals.every((v) => v >= 10 && v <= 400);
  checks.push({
    id: 'readiness.isf',
    status: sensVals.length === 0 ? 'gap' : sensSane ? 'pass' : 'review',
    title:
      sensVals.length === 0
        ? 'No insulin sensitivity schedule was found'
        : 'Insulin sensitivity schedule is present',
    detail: `${sensVals.length} sensitivity segment(s). AID uses sensitivity to translate glucose differences into insulin adjustments.`,
    metrics: { segments: sensVals.length },
  });

  // Carb ratio.
  const crSane = profile.carbratio.length > 0 && profile.carbratio.every((s) => s.value >= 2 && s.value <= 50);
  checks.push({
    id: 'readiness.carbratio',
    status: profile.carbratio.length === 0 ? 'gap' : crSane ? 'pass' : 'review',
    title:
      profile.carbratio.length === 0
        ? 'No carb ratio schedule was found'
        : 'Carb ratio schedule is present',
    detail: `${profile.carbratio.length} carb-ratio segment(s). Needed for meal-related calculations.`,
    metrics: { segments: profile.carbratio.length },
  });

  // DIA — oref expects a longer DIA than many pump defaults.
  const dia = profile.dia ?? 0;
  checks.push({
    id: 'readiness.dia',
    status: dia >= 5 ? 'pass' : dia > 0 ? 'review' : 'gap',
    title:
      dia >= 5
        ? `Insulin action duration is set to ${dia} hours`
        : `Insulin action duration is ${dia || 'unset'} (shorter than AID typically expects)`,
    detail:
      'oref-based systems commonly assume an insulin action duration of around 5–7 hours; shorter values are worth reviewing before starting.',
    metrics: { diaHours: dia },
  });

  // Targets.
  checks.push({
    id: 'readiness.targets',
    status: profile.targetLow.length > 0 && profile.targetHigh.length > 0 ? 'pass' : 'review',
    title:
      profile.targetLow.length > 0 && profile.targetHigh.length > 0
        ? 'Glucose targets are defined'
        : 'Glucose target range is incomplete',
    detail: 'AID steers toward a target range; both low and high target schedules should be present.',
    metrics: { lowSegments: profile.targetLow.length, highSegments: profile.targetHigh.length },
  });

  return checks;
}

/**
 * Assesses whether the Nightscout data and profile provide a sound starting
 * point for setting up an oref-based system. It reports the state of each
 * prerequisite as an observation/checklist. It explicitly does not clear
 * anyone to start AID or suggest specific settings — that is a clinical
 * decision made with a healthcare team.
 */
export function analyseAidReadiness(ds: Dataset): Finding[] {
  const findings: Finding[] = [];
  const days = dayCount(ds.window.startMs, ds.window.endMs);

  // Is an AID loop already reporting?
  const looping = ds.deviceStatus.some((d) => d.hasOpenAps || d.hasLoop);
  if (looping) {
    findings.push(
      makeFinding({
        id: 'readiness.alreadyLooping',
        domain: 'readiness',
        severity: 'info',
        title: 'An automated insulin delivery loop already appears active',
        detail:
          'Device status records include loop output (OpenAPS/oref or Loop). Readiness checks below describe the data foundations regardless.',
        metrics: { deviceStatusRecords: ds.deviceStatus.length },
        window: ds.window,
      }),
    );
  }

  // Data sufficiency for seeding settings.
  const expected = days * READINGS_PER_DAY;
  const coverage = expected > 0 ? Math.min(100, (ds.entries.length / expected) * 100) : 0;
  const dataStatus: CheckStatus = days < 7 ? 'review' : coverage >= 70 ? 'pass' : 'gap';
  findings.push(
    makeFinding({
      id: 'readiness.dataWindow',
      domain: 'readiness',
      severity: STATUS_SEVERITY[dataStatus],
      title: `Reviewed ${days} day(s) of data at ${round(coverage)}% CGM coverage`,
      detail:
        'Seeding AID settings is more reliable with at least one to two weeks of well-covered CGM data alongside logged carbs and boluses.',
      metrics: { days, coveragePct: round(coverage) },
      window: ds.window,
    }),
  );

  // Profile prerequisite checks.
  const checks = profileChecks(ds.profile);
  for (const c of checks) {
    findings.push(
      makeFinding({
        id: c.id,
        domain: 'readiness',
        severity: STATUS_SEVERITY[c.status],
        title: c.title,
        detail: c.detail,
        metrics: { ...c.metrics, status: c.status },
        window: ds.window,
      }),
    );
  }

  // Overall summary.
  const allStatuses: CheckStatus[] = [dataStatus, ...checks.map((c) => c.status)];
  const gaps = allStatuses.filter((s) => s === 'gap').length;
  const reviews = allStatuses.filter((s) => s === 'review').length;
  const overall: CheckStatus = gaps > 0 ? 'gap' : reviews > 0 ? 'review' : 'pass';
  findings.push(
    makeFinding({
      id: 'readiness.summary',
      domain: 'readiness',
      severity: STATUS_SEVERITY[overall],
      title:
        overall === 'pass'
          ? 'Data foundations for an oref setup appear to be in place'
          : overall === 'review'
            ? `Foundations are largely present, with ${reviews} item(s) worth reviewing`
            : `${gaps} prerequisite gap(s) to address before an oref setup`,
      detail:
        'This checklist describes the state of the data and profile only. Whether and how to start automated insulin delivery is a decision to make with your healthcare team.',
      metrics: { checks: allStatuses.length, gaps, toReview: reviews },
      window: ds.window,
    }),
  );

  return findings;
}
