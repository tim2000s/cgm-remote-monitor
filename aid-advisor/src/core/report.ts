import type { Dataset } from './types.ts';
import type { Finding, FindingsReport } from './findings.ts';
import { sortFindings } from './findings.ts';
import { dayCount } from './util/time.ts';
import { analyseDataQuality } from './analysis/dataQuality.ts';
import { analyseGlucoseStats } from './analysis/glucoseStats.ts';
import { analyseBasalPatterns } from './analysis/basalPatterns.ts';
import { analyseBolusTiming } from './analysis/bolusAnalysis.ts';
import { analyseExerciseImpact } from './analysis/exerciseImpact.ts';
import { analyseAidReadiness } from './analysis/aidReadiness.ts';

export type Section =
  | 'data-quality'
  | 'glucose'
  | 'basal'
  | 'bolus'
  | 'exercise'
  | 'readiness';

const RUNNERS: Record<Section, (ds: Dataset) => Finding[]> = {
  'data-quality': analyseDataQuality,
  glucose: analyseGlucoseStats,
  basal: analyseBasalPatterns,
  bolus: analyseBolusTiming,
  exercise: analyseExerciseImpact,
  readiness: analyseAidReadiness,
};

export const ALL_SECTIONS: Section[] = [
  'data-quality',
  'glucose',
  'basal',
  'bolus',
  'exercise',
  'readiness',
];

/**
 * Runs the requested analysis sections over a dataset and returns a single,
 * deterministic findings report. Given the same input it always produces the
 * same output, which is what makes the whole engine auditable.
 */
export function buildReport(ds: Dataset, sections: Section[] = ALL_SECTIONS): FindingsReport {
  const findings: Finding[] = [];
  for (const section of sections) {
    findings.push(...RUNNERS[section](ds));
  }
  return {
    generatedAt: Date.now(),
    window: ds.window,
    daysAnalysed: dayCount(ds.window.startMs, ds.window.endMs),
    findings: sortFindings(findings),
  };
}
