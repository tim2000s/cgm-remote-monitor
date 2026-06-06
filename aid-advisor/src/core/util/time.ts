/**
 * Time helpers. All timestamps in the dataset are epoch milliseconds (UTC).
 * The user's local wall-clock is derived by adding a fixed offset; we avoid
 * pulling in a timezone library to keep the core dependency-free and
 * RN-friendly. DST transitions are not modelled (acceptable for daily
 * pattern bucketing).
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** Hour-of-day (0-23) in local wall-clock for a UTC millisecond timestamp. */
export function localHour(ms: number, tzOffsetMinutes: number): number {
  const local = ms + tzOffsetMinutes * MINUTE_MS;
  return Math.floor((local % DAY_MS) / HOUR_MS + 24) % 24;
}

/** Minutes since local midnight (0-1439) for a UTC millisecond timestamp. */
export function localMinutesSinceMidnight(ms: number, tzOffsetMinutes: number): number {
  const local = ms + tzOffsetMinutes * MINUTE_MS;
  return Math.floor((local % DAY_MS) / MINUTE_MS + 1440) % 1440;
}

/** Local-date key "YYYY-MM-DD" used to group readings into days. */
export function localDayKey(ms: number, tzOffsetMinutes: number): string {
  const local = new Date(ms + tzOffsetMinutes * MINUTE_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True when the local hour falls in [startHour, endHour) with wraparound. */
export function inHourWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour <= endHour) return hour >= startHour && hour < endHour;
  // Wraps past midnight, e.g. 22 -> 6.
  return hour >= startHour || hour < endHour;
}

/** Number of distinct local days spanned by a window, minimum 1. */
export function dayCount(startMs: number, endMs: number): number {
  return Math.max(1, Math.round((endMs - startMs) / DAY_MS));
}
