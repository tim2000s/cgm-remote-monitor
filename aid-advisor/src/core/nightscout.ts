import type {
  Dataset,
  DeviceStatus,
  Entry,
  GlucoseUnit,
  ProfileBlock,
  ProfileSegment,
  Treatment,
} from './types.ts';

/**
 * Minimal Nightscout REST (API v1) client plus pure parsers.
 *
 * The parse* functions are exported and network-free so analyses can be
 * tested against fixtures offline. Authentication is supplied pre-prepared
 * (an access token for the query string, or an already-hashed api-secret for
 * the header) so the core never needs a crypto dependency — the CLI computes
 * the SHA-1 hash and hands it in. This keeps the module importable as-is in
 * React Native.
 */

export interface NightscoutAuth {
  /** Access token, sent as ?token=. Preferred for v1. */
  token?: string;
  /** SHA-1 hash of the API secret, sent as the api-secret header. */
  apiSecretHash?: string;
}

export interface NightscoutClientOptions {
  /** e.g. https://my-site.up.railway.app (no trailing slash needed). */
  baseUrl: string;
  auth?: NightscoutAuth;
  /** Injected for testing; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const MAX_COUNT = 250_000;

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && isFinite(n) ? n : undefined;
}

/** Resolve an epoch-ms timestamp from the several fields Nightscout uses. */
function resolveMills(doc: Record<string, unknown>): number | undefined {
  return (
    num(doc.mills) ??
    num(doc.date) ??
    (typeof doc.created_at === 'string' ? Date.parse(doc.created_at) : undefined) ??
    (typeof doc.dateString === 'string' ? Date.parse(doc.dateString) : undefined)
  );
}

export function parseEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  const out: Entry[] = [];
  for (const item of raw) {
    const doc = toRecord(item);
    const type = typeof doc.type === 'string' ? doc.type : 'sgv';
    if (type !== 'sgv') continue;
    const sgv = num(doc.sgv);
    const date = resolveMills(doc);
    if (sgv === undefined || date === undefined) continue;
    // CGMs report 39 (LOW) / 401 (HIGH) sentinels; drop the obviously invalid.
    if (sgv < 20 || sgv > 600) continue;
    out.push({
      date,
      sgv,
      direction: typeof doc.direction === 'string' ? doc.direction : undefined,
      type,
      device: typeof doc.device === 'string' ? doc.device : undefined,
    });
  }
  return out.sort((a, b) => a.date - b.date);
}

export function parseTreatments(raw: unknown): Treatment[] {
  if (!Array.isArray(raw)) return [];
  const out: Treatment[] = [];
  for (const item of raw) {
    const doc = toRecord(item);
    const mills = resolveMills(doc);
    if (mills === undefined) continue;
    out.push({
      mills,
      eventType: typeof doc.eventType === 'string' ? doc.eventType : 'Unknown',
      insulin: num(doc.insulin),
      carbs: num(doc.carbs),
      duration: num(doc.duration),
      absolute: num(doc.absolute),
      percent: num(doc.percent),
      notes: typeof doc.notes === 'string' ? doc.notes : undefined,
      device: typeof doc.device === 'string' ? doc.device : undefined,
    });
  }
  return out.sort((a, b) => a.mills - b.mills);
}

function parseSchedule(raw: unknown): ProfileSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileSegment[] = [];
  for (const item of raw) {
    const doc = toRecord(item);
    const value = num(doc.value);
    if (value === undefined) continue;
    const timeAsSeconds = num(doc.timeAsSeconds) ?? 0;
    out.push({
      timeAsSeconds,
      time: typeof doc.time === 'string' ? doc.time : undefined,
      value,
    });
  }
  return out.sort((a, b) => a.timeAsSeconds - b.timeAsSeconds);
}

/** Extract the active settings block from a /profile document list. */
export function parseProfileDoc(raw: unknown): ProfileBlock | null {
  const list = Array.isArray(raw) ? raw : [raw];
  const doc = toRecord(list[0]);
  const store = toRecord(doc.store);
  const defaultName = typeof doc.defaultProfile === 'string' ? doc.defaultProfile : undefined;
  const blockRaw =
    (defaultName && store[defaultName]) ?? Object.values(store)[0] ?? doc;
  const block = toRecord(blockRaw);
  const units = (block.units ?? doc.units) === 'mmol' ? 'mmol' : 'mg/dl';
  const basal = parseSchedule(block.basal);
  if (basal.length === 0) return null;
  return {
    dia: num(block.dia),
    units: units as GlucoseUnit,
    timezone: typeof block.timezone === 'string' ? block.timezone : undefined,
    basal,
    sens: parseSchedule(block.sens),
    carbratio: parseSchedule(block.carbratio),
    targetLow: parseSchedule(block.target_low),
    targetHigh: parseSchedule(block.target_high),
  };
}

export function parseDeviceStatus(raw: unknown): DeviceStatus[] {
  if (!Array.isArray(raw)) return [];
  const out: DeviceStatus[] = [];
  for (const item of raw) {
    const doc = toRecord(item);
    const mills = resolveMills(doc);
    if (mills === undefined) continue;
    const openaps = toRecord(doc.openaps);
    const loop = toRecord(doc.loop);
    const pump = toRecord(doc.pump);
    const hasOpenAps = doc.openaps != null && Object.keys(openaps).length > 0;
    const hasLoop = doc.loop != null && Object.keys(loop).length > 0;
    const iob =
      num(toRecord(openaps.iob).iob) ??
      num(toRecord(loop.iob).iob) ??
      num(toRecord(pump.iob).iob);
    out.push({
      mills,
      device: typeof doc.device === 'string' ? doc.device : undefined,
      hasOpenAps,
      hasLoop,
      iob,
    });
  }
  return out.sort((a, b) => a.mills - b.mills);
}

export class NightscoutClient {
  private readonly baseUrl: string;
  private readonly auth: NightscoutAuth;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NightscoutClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.auth = options.auth ?? {};
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async getJson(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (this.auth.token) url.searchParams.set('token', this.auth.token);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.auth.apiSecretHash) headers['api-secret'] = this.auth.apiSecretHash;
    const res = await this.fetchImpl(url.toString(), { headers });
    if (!res.ok) {
      throw new Error(`Nightscout ${path} responded ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async fetchEntries(startMs: number, endMs: number): Promise<Entry[]> {
    return parseEntries(
      await this.getJson('/api/v1/entries/sgv.json', {
        'find[date][$gte]': String(startMs),
        'find[date][$lte]': String(endMs),
        count: String(MAX_COUNT),
      }),
    );
  }

  async fetchTreatments(startMs: number, endMs: number): Promise<Treatment[]> {
    return parseTreatments(
      await this.getJson('/api/v1/treatments.json', {
        'find[created_at][$gte]': new Date(startMs).toISOString(),
        'find[created_at][$lte]': new Date(endMs).toISOString(),
        count: String(MAX_COUNT),
      }),
    );
  }

  async fetchProfile(): Promise<ProfileBlock | null> {
    return parseProfileDoc(await this.getJson('/api/v1/profile.json', {}));
  }

  async fetchDeviceStatus(startMs: number, endMs: number): Promise<DeviceStatus[]> {
    return parseDeviceStatus(
      await this.getJson('/api/v1/devicestatus.json', {
        'find[created_at][$gte]': new Date(startMs).toISOString(),
        'find[created_at][$lte]': new Date(endMs).toISOString(),
        count: String(MAX_COUNT),
      }),
    );
  }

  /** Fetch everything needed for a report over a window in one call. */
  async fetchDataset(opts: {
    startMs: number;
    endMs: number;
    tzOffsetMinutes: number;
    displayUnit: GlucoseUnit;
  }): Promise<Dataset> {
    const [entries, treatments, profile, deviceStatus] = await Promise.all([
      this.fetchEntries(opts.startMs, opts.endMs),
      this.fetchTreatments(opts.startMs, opts.endMs),
      this.fetchProfile(),
      this.fetchDeviceStatus(opts.startMs, opts.endMs),
    ]);
    return {
      entries,
      treatments,
      profile,
      deviceStatus,
      window: { startMs: opts.startMs, endMs: opts.endMs },
      tzOffsetMinutes: opts.tzOffsetMinutes,
      displayUnit: opts.displayUnit,
    };
  }
}
