/**
 * The Finding is the single output type of every analysis module.
 *
 * Design intent (read before adding fields): a Finding describes *what was
 * observed in the data*, with the supporting numbers attached. It deliberately
 * does NOT carry a recommended therapy action. Keeping dosing decisions out of
 * this layer is what makes the engine an information tool rather than a
 * decision-support medical device — and it keeps every output auditable back
 * to the metrics that produced it.
 *
 * Narration (turning findings into friendly prose, optionally via an LLM)
 * happens downstream in narrate.ts and may only reference these numbers.
 */

export type Domain =
  | 'data-quality'
  | 'glucose'
  | 'basal'
  | 'bolus'
  | 'exercise'
  | 'readiness';

/**
 * Severity is about how strongly the *data* stands out, not about urgency of
 * any action. 'attention' means "this pattern is pronounced and worth a human
 * looking at it", never "do X".
 */
export type Severity = 'info' | 'observation' | 'attention';

export interface Finding {
  /** Stable machine code, e.g. "cgm.coverage.low". Useful for filtering/tests. */
  id: string;
  domain: Domain;
  severity: Severity;
  /** Neutral, factual one-line observation. No imperatives. */
  title: string;
  /** Longer factual description of what the data shows. */
  detail: string;
  /** The auditable numbers behind the finding. */
  metrics: Record<string, number | string>;
  /** Optional time window the finding pertains to (epoch ms). */
  window?: { startMs: number; endMs: number };
}

export interface FindingsReport {
  generatedAt: number;
  window: { startMs: number; endMs: number };
  /** How many distinct local days of data were available. */
  daysAnalysed: number;
  findings: Finding[];
}

/** Small helper so modules construct findings consistently. */
export function makeFinding(f: Finding): Finding {
  return f;
}

const SEVERITY_RANK: Record<Severity, number> = {
  attention: 0,
  observation: 1,
  info: 2,
};

/** Sort most-noteworthy first, then by domain for stable grouping. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return a.domain.localeCompare(b.domain);
  });
}
