import type { GlucoseUnit } from '../types.ts';

/** Conversion factor between mg/dL and mmol/L. */
export const MGDL_PER_MMOL = 18.018;

/** Standard time-in-range thresholds in mg/dL (consensus ranges). */
export const RANGE = {
  veryLow: 54,
  low: 70,
  high: 180,
  veryHigh: 250,
} as const;

export function mgdlToMmol(mgdl: number): number {
  return Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10;
}

export function mmolToMgdl(mmol: number): number {
  return Math.round(mmol * MGDL_PER_MMOL);
}

/** Format an internal mg/dL value for display in the chosen unit. */
export function formatGlucose(mgdl: number, unit: GlucoseUnit): string {
  if (unit === 'mmol') return `${mgdlToMmol(mgdl).toFixed(1)} mmol/L`;
  return `${Math.round(mgdl)} mg/dL`;
}

/**
 * Glucose Management Indicator (estimated A1c) from mean glucose in mg/dL.
 * GMI(%) = 3.31 + 0.02392 * mean_mgdl  (Bergenstal et al., 2018).
 */
export function gmi(meanMgdl: number): number {
  return 3.31 + 0.02392 * meanMgdl;
}

/** A profile schedule may store sensitivity in mmol; normalise to mg/dL. */
export function normaliseSensValue(value: number, unit: GlucoseUnit | undefined): number {
  return unit === 'mmol' ? value * MGDL_PER_MMOL : value;
}
