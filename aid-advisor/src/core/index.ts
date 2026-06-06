/**
 * Public API of the shared analysis core.
 *
 * This module is pure (only uses fetch) and is the single import surface for
 * both the CLI and the future React Native app.
 */
export type {
  Dataset,
  DeviceStatus,
  Entry,
  GlucoseUnit,
  ProfileBlock,
  ProfileSegment,
  Treatment,
} from './types.ts';
export type { Finding, FindingsReport, Domain, Severity } from './findings.ts';
export { sortFindings, makeFinding } from './findings.ts';

export {
  NightscoutClient,
  parseEntries,
  parseTreatments,
  parseProfileDoc,
  parseDeviceStatus,
} from './nightscout.ts';
export type { NightscoutAuth, NightscoutClientOptions } from './nightscout.ts';

export { buildReport, ALL_SECTIONS } from './report.ts';
export type { Section } from './report.ts';

export { TemplateNarrator, LlmNarrator } from './narrate.ts';
export type { Narrator, CompleteFn } from './narrate.ts';

export { timeInRange } from './analysis/glucoseStats.ts';
export { RANGE, mgdlToMmol, mmolToMgdl, gmi } from './util/glucose.ts';
