# AID Advisor — shared analysis core

Reads a [Nightscout](https://nightscout.github.io/) instance and surfaces
**auditable, observation-framed insights** about glucose patterns, overnight
(basal) behaviour, meal/bolus timing, exercise impact, and readiness to set up
an [oref](https://openaps.readthedocs.io/)-based automated insulin delivery
(AID) system.

This package is the **shared analysis core** that a React Native app will
import. It ships with a thin CLI so the whole pipeline can be exercised today.

## Design boundary (read this first)

This is an **information tool, not a dosing advisor.** It deliberately does not
recommend insulin doses, basal rates, ratios, timings, or settings, and it does
not "clear" anyone to start AID. It describes *what the data shows* and leaves
every therapy decision to the person and their healthcare team.

That boundary is enforced structurally, not just by wording:

- The deterministic engine emits **`Finding`** objects — each is a neutral
  observation with the **supporting numbers attached** (`metrics`). There is no
  "recommended action" field by design (`src/core/findings.ts`).
- Narration (turning findings into friendly prose) is a separate layer. An
  optional LLM narrator may **only restate the already-computed findings** — it
  never sees raw glucose/treatment data and never invents numbers or advice
  (`src/core/narrate.ts`).
- Every finding traces back to reproducible math. `buildReport` is pure: same
  input → same output.

> This software is not a medical device and provides no medical advice.

## Architecture

```
src/core/                pure, React-Native-importable (only uses fetch)
  types.ts               normalised domain models
  nightscout.ts          REST client (v1) + offline-testable parsers
  util/{time,glucose,stats}.ts
  findings.ts            the observation-only Finding model
  analysis/
    dataQuality.ts       CGM coverage, gaps, logging completeness
    glucoseStats.ts      time-in-range, GMI, CV, day/night split
    basalPatterns.ts     overnight fasting drift (carb-free nights)
    bolusAnalysis.ts     meal-bolus timing + post-meal excursions
    exerciseImpact.ts    activity vs glucose, delayed lows
    aidReadiness.ts      prerequisite checklist for an oref setup
  report.ts              orchestrator → deterministic FindingsReport
  narrate.ts             TemplateNarrator (offline) + LlmNarrator (injected)
  index.ts               public API surface
src/cli.ts               Node-only CLI (fetch + run + print)
test/                    offline tests on synthetic fixtures
```

No runtime dependencies. Runs on Node ≥ 22.18 via built-in TypeScript
type-stripping (no build step); the same source compiles into React Native.

## CLI usage

```bash
# Narrated, observation-only summary of the last 14 days
node src/cli.ts --url https://my-site --token ro-xxxxxxxx --days 14

# Just the AID-readiness checklist, as raw findings JSON
node src/cli.ts --url https://my-site --token ro-xxxxxxxx --section readiness --json

# Authenticate with a raw API secret (hashed locally to SHA-1)
node src/cli.ts --url https://my-site --secret 'MY API SECRET' --unit mmol
```

A read-only access token is recommended. Flags: `--days`, `--tz <minutes>`,
`--unit mg/dl|mmol`, `--section <name>` (repeatable), `--json`.

## Tests

```bash
node --test test/core.test.ts
```

Tests run fully offline against synthetic fixtures (`test/fixtures.ts`).

## React Native test app

An Expo app that runs this engine on a phone lives in [`app/`](./app). It
imports `src/core` directly, so it exercises the real pipeline. See
[`app/README.md`](./app/README.md) to run it via Expo Go.

## Roadmap

1. **Shared analysis core + CLI** ✅
2. **React Native (Expo) test app consuming `src/core`** ✅ (`app/`)
3. Daily background refresh + local notifications; optional Claude narration via
   an injected `CompleteFn`
4. Trend-over-time tracking (week-over-week change in the same findings)
