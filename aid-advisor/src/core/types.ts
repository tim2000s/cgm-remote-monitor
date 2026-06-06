/**
 * Domain models for the Nightscout data this app reads.
 *
 * These mirror the shapes returned by the Nightscout REST API (entries,
 * treatments, profile, devicestatus). Fields are intentionally permissive
 * because real-world Nightscout instances vary by uploader/firmware.
 *
 * All glucose values are normalised to mg/dL internally; conversion for
 * display happens at the edges (see util/glucose.ts).
 */

/** Glucose unit used for display. Internal math is always mg/dL. */
export type GlucoseUnit = 'mg/dl' | 'mmol';

/** A single CGM sensor glucose value. */
export interface Entry {
  /** Epoch milliseconds of the reading. */
  date: number;
  /** Sensor glucose value in mg/dL. */
  sgv: number;
  /** Trend direction string, e.g. "Flat", "FortyFiveUp". */
  direction?: string;
  type?: string;
  device?: string;
}

/**
 * A logged therapy event. Nightscout overloads one collection for boluses,
 * carbs, temp basals, notes, exercise, etc., distinguished by eventType.
 */
export interface Treatment {
  /** Epoch milliseconds of the event. */
  mills: number;
  eventType: string;
  /** Units of insulin delivered (bolus). */
  insulin?: number;
  /** Grams of carbohydrate. */
  carbs?: number;
  /** Duration in minutes (temp basal, exercise, notes). */
  duration?: number;
  /** Absolute temp basal rate in U/hr. */
  absolute?: number;
  /** Percentage temp basal. */
  percent?: number;
  notes?: string;
  device?: string;
}

/** One time-of-day segment within a profile schedule, e.g. basal at 00:00. */
export interface ProfileSegment {
  /** Seconds since midnight at which this segment starts. */
  timeAsSeconds: number;
  /** "HH:MM" label as stored by Nightscout. */
  time?: string;
  value: number;
}

/** The active settings block extracted from a Nightscout profile document. */
export interface ProfileBlock {
  /** Duration of insulin action, hours. */
  dia?: number;
  units?: GlucoseUnit;
  timezone?: string;
  /** Basal rate schedule, U/hr. */
  basal: ProfileSegment[];
  /** Insulin sensitivity factor schedule (mg/dL or mmol per unit). */
  sens: ProfileSegment[];
  /** Carb ratio schedule (g per unit). */
  carbratio: ProfileSegment[];
  targetLow: ProfileSegment[];
  targetHigh: ProfileSegment[];
}

/** Device status snapshot; we mainly care whether an AID loop is reporting. */
export interface DeviceStatus {
  mills: number;
  device?: string;
  /** Present when an OpenAPS/oref loop is reporting (AndroidAPS, OpenAPS). */
  hasOpenAps?: boolean;
  /** Present when Loop (Swift) is reporting. */
  hasLoop?: boolean;
  /** Insulin-on-board in units, if reported. */
  iob?: number;
}

/** The full dataset a report is computed from, already normalised. */
export interface Dataset {
  entries: Entry[];
  treatments: Treatment[];
  profile: ProfileBlock | null;
  deviceStatus: DeviceStatus[];
  /** Inclusive window the data was requested for. */
  window: { startMs: number; endMs: number };
  /** Minutes to add to UTC to get the user's local wall-clock time. */
  tzOffsetMinutes: number;
  /** Unit preference for display. */
  displayUnit: GlucoseUnit;
}
