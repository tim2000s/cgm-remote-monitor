import type { Finding, FindingsReport } from './findings.ts';

/**
 * Turns a computed FindingsReport into readable prose.
 *
 * Critical boundary: a narrator may ONLY rephrase findings that the
 * deterministic engine already produced. It never sees raw glucose/treatment
 * data and never invents new conclusions or numbers. This is what lets us add
 * an optional LLM for nicer language without the LLM becoming the thing making
 * health claims — it is a presentation layer over audited numbers.
 */
export interface Narrator {
  narrate(report: FindingsReport): Promise<string> | string;
}

const DISCLAIMER =
  'This is an informational summary of patterns observed in your data. It is not medical advice and does not recommend therapy changes. Discuss any changes to insulin, settings, or an automated system with your healthcare team.';

const DOMAIN_TITLES: Record<Finding['domain'], string> = {
  'data-quality': 'Data quality',
  glucose: 'Glucose overview',
  basal: 'Overnight / basal patterns',
  bolus: 'Meal & bolus patterns',
  exercise: 'Activity & glucose',
  readiness: 'AID setup readiness',
};

function groupByDomain(findings: Finding[]): Map<Finding['domain'], Finding[]> {
  const map = new Map<Finding['domain'], Finding[]>();
  for (const f of findings) {
    const arr = map.get(f.domain) ?? [];
    arr.push(f);
    map.set(f.domain, arr);
  }
  return map;
}

/**
 * Zero-dependency narrator: templates the findings into Markdown. Always
 * available, fully offline, and the default in the CLI.
 */
export class TemplateNarrator implements Narrator {
  narrate(report: FindingsReport): string {
    const lines: string[] = [];
    lines.push(`# Nightscout data review (${report.daysAnalysed} day(s))`);
    lines.push('');
    lines.push(`_${DISCLAIMER}_`);
    lines.push('');
    const groups = groupByDomain(report.findings);
    for (const [domain, title] of Object.entries(DOMAIN_TITLES) as [
      Finding['domain'],
      string,
    ][]) {
      const items = groups.get(domain);
      if (!items || items.length === 0) continue;
      lines.push(`## ${title}`);
      for (const f of items) {
        const mark = f.severity === 'attention' ? '⚠️ ' : f.severity === 'observation' ? '• ' : '· ';
        lines.push(`${mark}**${f.title}**`);
        lines.push(`  ${f.detail}`);
      }
      lines.push('');
    }
    return lines.join('\n').trimEnd() + '\n';
  }
}

/** A function that completes a text prompt — wired by the host (e.g. Claude). */
export type CompleteFn = (input: {
  system: string;
  user: string;
}) => Promise<string>;

const LLM_SYSTEM =
  'You are a narration layer for a diabetes-data information tool. You will be given a JSON list of findings that a deterministic engine already computed from a person\'s Nightscout data. Rewrite them as a clear, friendly, plain-language summary. STRICT RULES: (1) Only restate what is in the findings and their metrics — never add new numbers, conclusions, or causes. (2) Do NOT give medical advice, and do NOT recommend any change to insulin doses, basal rates, ratios, timing, or settings. Describe observations only. (3) Keep an encouraging, non-alarming tone. (4) Always end with a reminder to discuss any changes with their healthcare team.';

/**
 * Optional LLM narrator. The core does not depend on any AI SDK; the host
 * injects a CompleteFn (e.g. a Claude API call). The model is given ONLY the
 * pre-computed findings JSON plus a tightly-scoped system prompt, never raw
 * patient data — preserving the information-tool boundary.
 */
export class LlmNarrator implements Narrator {
  private readonly complete: CompleteFn;

  constructor(complete: CompleteFn) {
    this.complete = complete;
  }

  async narrate(report: FindingsReport): Promise<string> {
    const payload = report.findings.map((f) => ({
      domain: f.domain,
      severity: f.severity,
      title: f.title,
      detail: f.detail,
      metrics: f.metrics,
    }));
    const text = await this.complete({
      system: LLM_SYSTEM,
      user: `Findings JSON (${report.daysAnalysed} days):\n${JSON.stringify(payload, null, 2)}`,
    });
    return text.includes('healthcare team') ? text : `${text}\n\n_${DISCLAIMER}_\n`;
  }
}
