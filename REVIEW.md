# Review checklist

Concerns that recur in this fork. Label findings important, nit or pre-existing.

- A display change must not alter what alarms, the main reading, the forecast, plugins, the REST
  and v3 APIs or websocket payloads see. Check that `client.entries`, `ddata` and server data
  paths are read rather than filtered or reordered.
- A new setting defaults off and is listed in `lib/settings.js` with a value mapper, so the
  `UPPER_SNAKE` environment variable maps to it.
- D3 joins on glucose readings: check the key. `mills` alone collapses readings that share a
  timestamp.
- Client history is capped in more than one place (`index.js` `tooOld`, `receiveddata.js`
  `maxAge`, server `dataloader.js`, websocket `history`). A change to one usually needs the others.
- The client bundle is built, not served from source: rebuild with
  `npx webpack --mode production --config webpack/webpack.config.js` before judging a UI change in
  a browser, and on the server after switching branch.
- The full suite shares one test database; a failure in the full run that passes alone is
  interference until a solo run shows otherwise (seen 18 Nov 2026 in api.shape-handling and
  uuid-handling).
