import type { Dataset, Entry, Treatment } from '../types.ts';
import type { Finding } from '../findings.ts';
import { makeFinding } from '../findings.ts';
import { RANGE, formatGlucose } from '../util/glucose.ts';
import { mean, median, round } from '../util/stats.ts';
import { MINUTE_MS } from '../util/time.ts';

const BASELINE_MIN = 60;
/** Hours after exercise to watch for delayed lows. */
const FOLLOW_HOURS = 4;
const EXERCISE_RE = /exercise|activity|workout|run|walk|cycl|gym|sport/i;

function isExercise(t: Treatment): boolean {
  if (EXERCISE_RE.test(t.eventType)) return true;
  if (t.notes && EXERCISE_RE.test(t.notes)) return true;
  return false;
}

function meanInWindow(entries: Entry[], startMs: number, endMs: number): number | null {
  const vals = entries.filter((e) => e.date >= startMs && e.date < endMs).map((e) => e.sgv);
  return vals.length ? mean(vals) : null;
}

function minInWindow(entries: Entry[], startMs: number, endMs: number): number | null {
  let min: number | null = null;
  for (const e of entries) {
    if (e.date >= startMs && e.date < endMs && (min === null || e.sgv < min)) min = e.sgv;
  }
  return min;
}

interface ExerciseResult {
  baseline: number;
  change: number;
  followLow: number | null;
}

/**
 * Observes how logged activity associates with glucose: the change from a
 * pre-activity baseline and whether lows tend to follow in the hours after.
 * This is descriptive only — it characterises the observed relationship
 * between activity and glucose, not what to do about it.
 */
export function analyseExerciseImpact(ds: Dataset): Finding[] {
  const findings: Finding[] = [];
  const events = ds.treatments.filter(isExercise);
  if (events.length < 2) {
    if (events.length === 0) return findings;
    findings.push(
      makeFinding({
        id: 'exercise.insufficient',
        domain: 'exercise',
        severity: 'info',
        title: 'Only isolated activity events were logged',
        detail: `${events.length} activity event(s) were found. Logging activity consistently (type/duration) enables clearer observations of how it associates with glucose.`,
        metrics: { events: events.length },
        window: ds.window,
      }),
    );
    return findings;
  }

  const results: ExerciseResult[] = [];
  for (const ev of events) {
    const durMs = (ev.duration ?? 45) * MINUTE_MS;
    const baseline = meanInWindow(ds.entries, ev.mills - BASELINE_MIN * MINUTE_MS, ev.mills);
    const during = meanInWindow(ds.entries, ev.mills, ev.mills + durMs);
    if (baseline === null || during === null) continue;
    const followLow = minInWindow(
      ds.entries,
      ev.mills,
      ev.mills + FOLLOW_HOURS * 60 * MINUTE_MS,
    );
    results.push({ baseline, change: during - baseline, followLow });
  }

  if (results.length < 2) return findings;

  const changes = results.map((r) => r.change);
  const medChange = median(changes);
  const lowsAfter = results.filter(
    (r) => r.followLow !== null && r.followLow < RANGE.low,
  ).length;
  const lowPct = (lowsAfter / results.length) * 100;
  const unit = ds.displayUnit;

  findings.push(
    makeFinding({
      id: 'exercise.glucoseChange',
      domain: 'exercise',
      severity: 'observation',
      title:
        medChange < 0
          ? `Activity was associated with a median drop of ${round(-medChange)} mg/dL`
          : `Activity was associated with a median change of +${round(medChange)} mg/dL`,
      detail: `Across ${results.length} logged activity events, glucose moved by a median of ${round(medChange)} mg/dL from a ${BASELINE_MIN}-minute pre-activity baseline. Direction and size vary with activity type and intensity.`,
      metrics: { events: results.length, medianChangeMgdl: round(medChange) },
      window: ds.window,
    }),
  );

  if (lowsAfter > 0) {
    findings.push(
      makeFinding({
        id: 'exercise.delayedLows',
        domain: 'exercise',
        severity: lowPct >= 40 ? 'attention' : 'observation',
        title: `Lows followed ${round(lowPct)}% of activity events within ${FOLLOW_HOURS}h`,
        detail: `${lowsAfter} of ${results.length} activity events were followed by a reading below ${formatGlucose(RANGE.low, unit)} within ${FOLLOW_HOURS} hours, consistent with a delayed glucose-lowering effect of activity.`,
        metrics: {
          events: results.length,
          eventsWithFollowingLow: lowsAfter,
          followingLowPct: round(lowPct),
        },
        window: ds.window,
      }),
    );
  }

  return findings;
}
