# AID Advisor — React Native test app (Expo)

A small Expo app for testing the shared analysis core on a real phone. It
connects to your Nightscout site, runs the deterministic engine, and shows the
observation-only findings grouped by topic.

It imports the engine directly from `../src/core`, so you are testing the real
analysis pipeline — not a reimplementation.

## Run it on your phone

1. Install the **Expo Go** app on your phone (App Store / Play Store).
2. From this directory:
   ```bash
   npm install
   npm start
   ```
3. Scan the QR code with Expo Go (Android) or the Camera app (iOS).
4. Enter your Nightscout URL and an **access token** (a read-only token is
   ideal), choose how many days to review, and tap **Review my data**.

Your phone and computer need to be on the same network. If they aren't, run
`npx expo start --tunnel`.

> Note: `npm start` / `npx expo install` reach Expo's servers. If you add
> packages in a restricted-network setup, install them with plain
> `npm install <pkg>@<version>` instead of `npx expo install`.

## What it does

- **Connect screen** — Nightscout URL, access token *or* API secret (the
  secret is SHA-1 hashed on-device and never sent in plain text), review
  window, and display unit. Settings are saved in the device keychain
  (`expo-secure-store`) so daily use doesn't require re-entry.
- **Report screen** — findings grouped by topic (readiness, glucose, overnight,
  meals, activity, data quality), each with a severity dot and the supporting
  numbers. Pull to refresh re-reads Nightscout. A persistent banner states this
  is informational only.

## Design notes

- The app never makes therapy recommendations — it renders the same
  observation-framed `Finding`s the core produces. Severity reflects how much
  the data stands out, not urgency of any action.
- Only `src/core` is imported (never the Node CLI). `metro.config.js` widens
  Metro's watch scope to the `aid-advisor` root so the out-of-app core resolves.
- Verified here via `tsc --noEmit` and a full `expo export` Metro bundle.

## Next

A daily background refresh + local notification, and optional Claude narration
by injecting a `CompleteFn` into the core's `LlmNarrator` (it only ever sees the
already-computed findings).
