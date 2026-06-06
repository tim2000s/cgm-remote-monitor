/** Small, dependency-free statistics helpers used across analyses. */

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  let sumSq = 0;
  for (const v of values) sumSq += (v - m) * (v - m);
  return Math.sqrt(sumSq / (values.length - 1));
}

/** Coefficient of variation as a percentage (stdDev / mean * 100). */
export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  if (!isFinite(m) || m === 0) return NaN;
  return (stdDev(values) / m) * 100;
}

/** Linear-interpolated percentile (p in [0,100]) over a copy of the values. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const frac = rank - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

export function median(values: number[]): number {
  return percentile(values, 50);
}

/** Round to a fixed number of decimal places, returning a number. */
export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Ordinary-least-squares slope of y over x. Used to detect drift/trends
 * (e.g. overnight glucose rising or falling). Returns slope per unit x.
 */
export function linearSlope(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    num += dx * (ys[i]! - my);
    den += dx * dx;
  }
  if (den === 0) return NaN;
  return num / den;
}
