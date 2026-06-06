import type { Domain, Severity } from './core';

export const colors = {
  bg: '#0F172A',
  surface: '#1E293B',
  surfaceAlt: '#334155',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  border: '#334155',
  accent: '#38BDF8',
  accentText: '#0F172A',
};

/** Severity drives a small colour accent. It signals how strongly the data
 *  stands out — never urgency of any action. */
export const severityStyle: Record<Severity, { dot: string; label: string }> = {
  attention: { dot: '#F59E0B', label: 'Worth a look' },
  observation: { dot: '#38BDF8', label: 'Observation' },
  info: { dot: '#64748B', label: 'Info' },
};

export const domainTitle: Record<Domain, string> = {
  'data-quality': 'Data quality',
  glucose: 'Glucose overview',
  basal: 'Overnight / basal patterns',
  bolus: 'Meal & bolus patterns',
  exercise: 'Activity & glucose',
  readiness: 'AID setup readiness',
};

/** Stable display order for the domains. */
export const domainOrder: Domain[] = [
  'readiness',
  'glucose',
  'basal',
  'bolus',
  'exercise',
  'data-quality',
];
