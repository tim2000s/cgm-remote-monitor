import type { Dataset } from '../types.ts';
import type { Finding } from '../findings.ts';
import { makeFinding } from '../findings.ts';
import { RANGE, formatGlucose, gmi } from '../util/glucose.ts';
import { coefficientOfVariation, mean, round } from '../util/stats.ts';
import { localHour } from '../util/time.ts';

export interface TimeInRange {
  veryLowPct: number;
  lowPct: number;
  inRangePct: number;
  highPct: number;
  veryHighPct: number;
}

export function timeInRange(sgvs: number[]): TimeInRange {
  const n = sgvs.length || 1;
  let vl = 0;
  let lo = 0;
  let ir = 0;
  let hi = 0;
  let vh = 0;
  for (const v of sgvs) {
    if (v < RANGE.veryLow) vl++;
    else if (v < RANGE.low) lo++;
    else if (v <= RANGE.high) ir++;
    else if (v <= RANGE.veryHigh) hi++;
    else vh++;
  }
  return {
    veryLowPct: (vl / n) * 100,
    lowPct: (lo / n) * 100,
    inRangePct: (ir / n) * 100,
    highPct: (hi / n) * 100,
    veryHighPct: (vh / n) * 100,
  };
}

/**
 * Core glucose summary: time-in-range, average glucose, estimated A1c (GMI),
 * and glucose variability (CV). These are the standard consensus metrics and
 * are reported as plain information.
 */
export function analyseGlucoseStats(ds: Dataset): Finding[] {
  const findings: Finding[] = [];
  const sgvs = ds.entries.map((e) => e.sgv);
  if (sgvs.length < 12) return findings;

  const avg = mean(sgvs);
  const tir = timeInRange(sgvs);
  const cv = coefficientOfVariation(sgvs);
  const unit = ds.displayUnit;

  findings.push(
    makeFinding({
      id: 'glucose.summary',
      domain: 'glucose',
      severity: 'info',
      title: `Time in range was ${round(tir.inRangePct)}%, average glucose ${formatGlucose(avg, unit)}`,
      detail: `Below range ${round(tir.lowPct + tir.veryLowPct)}% (of which very low ${round(tir.veryLowPct)}%), in range ${round(tir.inRangePct)}%, above range ${round(tir.highPct + tir.veryHighPct)}%. Estimated glucose management indicator ~${round(gmi(avg))}%.`,
      metrics: {
        inRangePct: round(tir.inRangePct),
        belowRangePct: round(tir.lowPct + tir.veryLowPct),
        veryLowPct: round(tir.veryLowPct),
        aboveRangePct: round(tir.highPct + tir.veryHighPct),
        veryHighPct: round(tir.veryHighPct),
        meanMgdl: round(avg),
        gmiPct: round(gmi(avg)),
      },
      window: ds.window,
    }),
  );

  // Variability. CV >= 36% is the widely-cited threshold for "unstable".
  if (isFinite(cv)) {
    findings.push(
      makeFinding({
        id: 'glucose.variability',
        domain: 'glucose',
        severity: cv >= 36 ? 'attention' : 'info',
        title: `Glucose variability (CV) was ${round(cv)}%`,
        detail:
          cv >= 36
            ? 'This is above the commonly-referenced 36% stability threshold, indicating pronounced swings between high and low readings.'
            : 'This sits within the commonly-referenced stability threshold of 36%.',
        metrics: { cvPct: round(cv) },
        window: ds.window,
      }),
    );
  }

  // Time-below-range is the safety-relevant metric; surface it distinctly.
  const belowPct = tir.lowPct + tir.veryLowPct;
  if (belowPct >= 4 || tir.veryLowPct >= 1) {
    findings.push(
      makeFinding({
        id: 'glucose.timeBelow',
        domain: 'glucose',
        severity: 'attention',
        title: `Time below range was ${round(belowPct)}%`,
        detail: `Consensus targets aim for under 4% below ${formatGlucose(RANGE.low, unit)} and under 1% below ${formatGlucose(RANGE.veryLow, unit)}. Observed very-low time was ${round(tir.veryLowPct)}%.`,
        metrics: { belowRangePct: round(belowPct), veryLowPct: round(tir.veryLowPct) },
        window: ds.window,
      }),
    );
  }

  // Day vs night averages give a first hint at where patterns differ.
  const nightSgvs: number[] = [];
  const daySgvs: number[] = [];
  for (const e of ds.entries) {
    const h = localHour(e.date, ds.tzOffsetMinutes);
    if (h >= 0 && h < 6) nightSgvs.push(e.sgv);
    else daySgvs.push(e.sgv);
  }
  if (nightSgvs.length > 12 && daySgvs.length > 12) {
    const nAvg = mean(nightSgvs);
    const dAvg = mean(daySgvs);
    findings.push(
      makeFinding({
        id: 'glucose.dayNight',
        domain: 'glucose',
        severity: 'observation',
        title: `Overnight average ${formatGlucose(nAvg, unit)} vs daytime ${formatGlucose(dAvg, unit)}`,
        detail: `Comparing 00:00–06:00 against the rest of the day highlights whether overnight settings track differently from daytime.`,
        metrics: { overnightMeanMgdl: round(nAvg), daytimeMeanMgdl: round(dAvg) },
        window: ds.window,
      }),
    );
  }

  return findings;
}
