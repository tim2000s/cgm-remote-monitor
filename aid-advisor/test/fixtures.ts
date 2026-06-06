/** Synthetic data builders for offline tests. tz offset is 0 (local = UTC). */
import type { Dataset, Entry, ProfileBlock, Treatment } from '../src/core/types.ts';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../src/core/util/time.ts';

export const BASE = Date.UTC(2026, 0, 1, 0, 0, 0);

export function at(day: number, hour: number, minute = 0): number {
  return BASE + day * DAY_MS + hour * HOUR_MS + minute * MINUTE_MS;
}

/** Generate entries every 5 minutes between two local times of a day. */
export function ramp(
  day: number,
  startHour: number,
  endHour: number,
  startSgv: number,
  endSgv: number,
): Entry[] {
  const out: Entry[] = [];
  const startMs = at(day, startHour);
  const endMs = at(day, endHour);
  const span = endMs - startMs;
  for (let ms = startMs; ms < endMs; ms += 5 * MINUTE_MS) {
    const frac = span > 0 ? (ms - startMs) / span : 0;
    out.push({ sgv: Math.round(startSgv + (endSgv - startSgv) * frac), date: ms, type: 'sgv' });
  }
  return out;
}

export function bolus(day: number, hour: number, minute: number, insulin: number): Treatment {
  return { mills: at(day, hour, minute), eventType: 'Bolus', insulin };
}

export function meal(day: number, hour: number, minute: number, carbs: number): Treatment {
  return { mills: at(day, hour, minute), eventType: 'Meal Bolus', carbs };
}

export function exercise(day: number, hour: number, duration: number): Treatment {
  return { mills: at(day, hour), eventType: 'Exercise', duration };
}

export function sampleProfile(): ProfileBlock {
  return {
    dia: 6,
    units: 'mg/dl',
    basal: [
      { timeAsSeconds: 0, time: '00:00', value: 0.8 },
      { timeAsSeconds: 21600, time: '06:00', value: 1.0 },
    ],
    sens: [{ timeAsSeconds: 0, time: '00:00', value: 50 }],
    carbratio: [{ timeAsSeconds: 0, time: '00:00', value: 10 }],
    targetLow: [{ timeAsSeconds: 0, time: '00:00', value: 100 }],
    targetHigh: [{ timeAsSeconds: 0, time: '00:00', value: 120 }],
  };
}

export function makeDataset(over: Partial<Dataset> & { days: number }): Dataset {
  return {
    entries: over.entries ?? [],
    treatments: over.treatments ?? [],
    profile: over.profile ?? null,
    deviceStatus: over.deviceStatus ?? [],
    window: over.window ?? { startMs: BASE, endMs: BASE + over.days * DAY_MS },
    tzOffsetMinutes: over.tzOffsetMinutes ?? 0,
    displayUnit: over.displayUnit ?? 'mg/dl',
  };
}
