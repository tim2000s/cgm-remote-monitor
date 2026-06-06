/**
 * Thin CLI to prove the analysis core end-to-end against a live Nightscout
 * instance. Node-only (uses node:crypto, node:util, process). The pure core
 * under src/core is what the React Native app will import.
 *
 * Usage:
 *   node src/cli.ts --url https://my-site --token ro-xxxxxxxx --days 14
 *   node src/cli.ts --url https://my-site --secret 'MY API SECRET' --json
 *   node src/cli.ts --url https://my-site --token t --section readiness
 */
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { NightscoutClient } from './core/nightscout.ts';
import { ALL_SECTIONS, buildReport } from './core/report.ts';
import type { Section } from './core/report.ts';
import { TemplateNarrator } from './core/narrate.ts';
import type { GlucoseUnit } from './core/types.ts';
import { DAY_MS } from './core/util/time.ts';

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    token: { type: 'string' },
    secret: { type: 'string' },
    days: { type: 'string', default: '14' },
    tz: { type: 'string', default: String(-new Date().getTimezoneOffset()) },
    unit: { type: 'string', default: 'mg/dl' },
    section: { type: 'string', multiple: true },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (values.help || !values.url) {
  console.log(
    [
      'AID Advisor CLI — reviews Nightscout data and prints observation-only findings.',
      '',
      'Required:',
      '  --url <baseUrl>        Nightscout base URL, e.g. https://my-site',
      '',
      'Auth (one of):',
      '  --token <accessToken>  Nightscout access token (recommended, read-only ok)',
      '  --secret <apiSecret>   Raw API secret (hashed locally to SHA-1)',
      '',
      'Options:',
      '  --days <n>             Days of history to review (default 14)',
      '  --tz <minutes>         Local UTC offset in minutes (default: this machine)',
      '  --unit <mg/dl|mmol>    Display unit (default mg/dl)',
      '  --section <name>       Limit to a section (repeatable): ' + ALL_SECTIONS.join(', '),
      '  --json                 Print raw findings JSON instead of narrated text',
    ].join('\n'),
  );
  process.exit(values.url ? 0 : 1);
}

const days = Number(values.days);
if (!Number.isFinite(days) || days <= 0) fail('--days must be a positive number');
const tzOffsetMinutes = Number(values.tz);
if (!Number.isFinite(tzOffsetMinutes)) fail('--tz must be a number of minutes');
const displayUnit: GlucoseUnit = values.unit === 'mmol' ? 'mmol' : 'mg/dl';

let sections: Section[] = ALL_SECTIONS;
if (values.section && values.section.length > 0) {
  const invalid = values.section.filter((s) => !ALL_SECTIONS.includes(s as Section));
  if (invalid.length) fail(`unknown section(s): ${invalid.join(', ')}`);
  sections = values.section as Section[];
}

const auth = values.token
  ? { token: values.token }
  : values.secret
    ? { apiSecretHash: createHash('sha1').update(values.secret).digest('hex') }
    : fail('provide --token or --secret for authentication');

const endMs = Date.now();
const startMs = endMs - days * DAY_MS;

const client = new NightscoutClient({ baseUrl: values.url, auth });

try {
  const dataset = await client.fetchDataset({ startMs, endMs, tzOffsetMinutes, displayUnit });
  const report = buildReport(dataset, sections);
  if (values.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(new TemplateNarrator().narrate(report));
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
