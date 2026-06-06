import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEntries,
  parseTreatments,
  parseProfileDoc,
  parseDeviceStatus,
} from '../src/core/nightscout.ts';
import { timeInRange, analyseGlucoseStats } from '../src/core/analysis/glucoseStats.ts';
import { analyseBasalPatterns } from '../src/core/analysis/basalPatterns.ts';
import { analyseBolusTiming } from '../src/core/analysis/bolusAnalysis.ts';
import { analyseExerciseImpact } from '../src/core/analysis/exerciseImpact.ts';
import { analyseAidReadiness } from '../src/core/analysis/aidReadiness.ts';
import { analyseDataQuality } from '../src/core/analysis/dataQuality.ts';
import { buildReport } from '../src/core/report.ts';
import { TemplateNarrator } from '../src/core/narrate.ts';
import {
  at,
  bolus,
  exercise,
  makeDataset,
  meal,
  ramp,
  sampleProfile,
} from './fixtures.ts';

function find(findings: { id: string }[], id: string) {
  return findings.find((f) => f.id === id);
}

test('parseEntries keeps sgv, drops non-sgv and out-of-range sentinels', () => {
  const parsed = parseEntries([
    { type: 'sgv', sgv: 120, date: 1000 },
    { type: 'mbg', sgv: 100, date: 2000 },
    { type: 'sgv', sgv: 5, date: 3000 }, // below physiologic bound, dropped
    { type: 'sgv', sgv: 650, date: 4000 }, // above physiologic bound, dropped
    { sgv: 95, date: 500 }, // defaults to sgv
  ]);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map((e) => e.sgv), [95, 120]); // sorted by date
});

test('parseTreatments and resolveMills handle created_at and mills', () => {
  const parsed = parseTreatments([
    { eventType: 'Bolus', insulin: 2, mills: 5000 },
    { eventType: 'Carb Correction', carbs: 15, created_at: '2026-01-01T00:00:00.000Z' },
  ]);
  assert.equal(parsed.length, 2);
  const carb = parsed.find((t) => t.eventType === 'Carb Correction');
  assert.equal(carb!.mills, Date.parse('2026-01-01T00:00:00.000Z'));
  assert.equal(carb!.carbs, 15);
});

test('parseProfileDoc extracts the default profile block', () => {
  const block = parseProfileDoc([
    {
      defaultProfile: 'Default',
      store: {
        Default: {
          dia: 6,
          units: 'mg/dl',
          basal: [{ time: '00:00', timeAsSeconds: 0, value: 0.9 }],
          sens: [{ time: '00:00', timeAsSeconds: 0, value: 45 }],
          carbratio: [{ time: '00:00', timeAsSeconds: 0, value: 9 }],
          target_low: [{ time: '00:00', timeAsSeconds: 0, value: 100 }],
          target_high: [{ time: '00:00', timeAsSeconds: 0, value: 120 }],
        },
      },
    },
  ]);
  assert.ok(block);
  assert.equal(block!.dia, 6);
  assert.equal(block!.basal[0]!.value, 0.9);
});

test('parseDeviceStatus detects an active loop', () => {
  const parsed = parseDeviceStatus([
    { created_at: '2026-01-01T00:00:00Z', openaps: { iob: { iob: 1.2 } } },
    { created_at: '2026-01-01T00:05:00Z', pump: {} },
  ]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]!.hasOpenAps, true);
  assert.equal(parsed[0]!.iob, 1.2);
});

test('timeInRange buckets correctly', () => {
  const tir = timeInRange([40, 65, 120, 200, 300]);
  assert.equal(Math.round(tir.veryLowPct), 20);
  assert.equal(Math.round(tir.lowPct), 20);
  assert.equal(Math.round(tir.inRangePct), 20);
  assert.equal(Math.round(tir.highPct), 20);
  assert.equal(Math.round(tir.veryHighPct), 20);
});

test('glucose summary reports in-range and flags high time-below', () => {
  // Half the readings in range, half very low.
  const entries = [
    ...ramp(0, 0, 6, 120, 120),
    ...ramp(0, 6, 12, 50, 50),
  ];
  const ds = makeDataset({ days: 1, entries });
  const findings = analyseGlucoseStats(ds);
  assert.ok(find(findings, 'glucose.summary'));
  const below = find(findings, 'glucose.timeBelow');
  assert.ok(below, 'expected a time-below-range finding');
  assert.equal(below!.severity, 'attention');
});

test('basal analysis detects a consistent overnight rise', () => {
  const entries = [];
  for (let d = 0; d < 5; d++) entries.push(...ramp(d, 0, 6, 110, 170));
  const ds = makeDataset({ days: 5, entries });
  const findings = analyseBasalPatterns(ds);
  const rising = find(findings, 'basal.overnight.rising');
  assert.ok(rising, 'expected overnight rising finding');
  assert.ok(Number(rising!.metrics.medianSlopePerHour) > 5);
});

test('basal analysis excludes nights with overnight carbs', () => {
  const entries = [];
  const treatments = [];
  for (let d = 0; d < 4; d++) {
    entries.push(...ramp(d, 0, 6, 110, 170));
    treatments.push(meal(d, 3, 0, 20)); // overnight carbs every night
  }
  const ds = makeDataset({ days: 4, entries, treatments });
  const findings = analyseBasalPatterns(ds);
  assert.ok(find(findings, 'basal.overnight.insufficient'));
});

test('bolus analysis reports pre-bolus timing and excursions', () => {
  const entries = [];
  const treatments = [];
  for (let d = 0; d < 4; d++) {
    // baseline ~120 then a post-meal spike to 280.
    entries.push(...ramp(d, 11, 12, 120, 120));
    entries.push(...ramp(d, 12, 14, 130, 280));
    treatments.push(meal(d, 12, 0, 50));
    treatments.push(bolus(d, 11, 45, 5)); // 15 min pre-bolus
  }
  const ds = makeDataset({ days: 4, entries, treatments });
  const findings = analyseBolusTiming(ds);
  const timing = find(findings, 'bolus.timing');
  assert.ok(timing);
  assert.equal(Math.round(Number(timing!.metrics.medianPreBolusMin)), 15);
  const post = find(findings, 'bolus.postmeal');
  assert.ok(post);
  assert.equal(post!.severity, 'attention'); // all meals peak >250
});

test('exercise analysis flags following lows', () => {
  const entries = [];
  const treatments = [];
  for (let d = 0; d < 3; d++) {
    entries.push(...ramp(d, 16, 17, 140, 140)); // baseline
    entries.push(...ramp(d, 17, 21, 130, 60)); // drop then low after
    treatments.push(exercise(d, 17, 45));
  }
  const ds = makeDataset({ days: 3, entries, treatments });
  const findings = analyseExerciseImpact(ds);
  assert.ok(find(findings, 'exercise.glucoseChange'));
  const lows = find(findings, 'exercise.delayedLows');
  assert.ok(lows);
  assert.equal(Number(lows!.metrics.eventsWithFollowingLow), 3);
});

test('aid readiness summarises profile prerequisites', () => {
  const entries = [];
  for (let d = 0; d < 14; d++) entries.push(...ramp(d, 0, 24, 120, 140));
  const ds = makeDataset({ days: 14, entries, profile: sampleProfile() });
  const findings = analyseAidReadiness(ds);
  const summary = find(findings, 'readiness.summary');
  assert.ok(summary);
  assert.equal(Number(summary!.metrics.gaps), 0);
  assert.ok(find(findings, 'readiness.basal'));
  assert.ok(find(findings, 'readiness.dia'));
});

test('aid readiness flags a missing profile as a gap', () => {
  const ds = makeDataset({ days: 14, entries: ramp(0, 0, 24, 120, 130) });
  const findings = analyseAidReadiness(ds);
  const missing = find(findings, 'readiness.profile.missing');
  assert.ok(missing);
  assert.equal(missing!.severity, 'attention');
});

test('data quality flags low coverage and sparse logging', () => {
  const ds = makeDataset({ days: 14, entries: ramp(0, 0, 6, 120, 120) });
  const findings = analyseDataQuality(ds);
  const coverage = find(findings, 'cgm.coverage');
  assert.ok(coverage);
  assert.equal(coverage!.severity, 'attention'); // far below 70%
  const logging = find(findings, 'logging.treatments');
  assert.equal(logging!.severity, 'attention');
});

test('buildReport is deterministic and narratable', () => {
  const entries = [];
  for (let d = 0; d < 7; d++) entries.push(...ramp(d, 0, 24, 110, 160));
  const ds = makeDataset({ days: 7, entries, profile: sampleProfile() });
  const a = buildReport(ds);
  const b = buildReport(ds);
  assert.deepEqual(
    a.findings.map((f) => f.id),
    b.findings.map((f) => f.id),
  );
  const prose = new TemplateNarrator().narrate(a);
  assert.match(prose, /healthcare team/);
  assert.match(prose, /Nightscout data review/);
});
