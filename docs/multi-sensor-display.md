# Multi-sensor comparison display

`MULTI_SENSOR_DISPLAY=true` draws each CGM feed on a site as its own series, keyed by the
`device` field each uploader writes (Juggluco writes the sensor's short name there). It is off
by default and exists for research sites carrying several concurrent sensors. A site with this
setting on must not be used as the glucose source for automated insulin delivery.

## What changes when it is on

- Main chart: dots are coloured by sensor, and each sensor gets a line in its own colour and dash
  pattern. A line breaks where a sensor's spacing exceeds three times its median cadence, with a
  floor of 2 minutes (15 min for 5-minute data, 3 min for 1-minute data). One sensor's gap is never
  filled from another.
- Dots are keyed by `device:mills:_id`, so readings at the same millisecond from different
  sensors are drawn separately. The legacy key is `mills` alone.
- Context (lower) chart: dots coloured by sensor. It has no lines, which is a v1 limitation.
- Tooltip: adds the device and, where present, the direction.
- Legend (bottom right): one button per sensor with its latest value and age, plus a notice that
  the site holds several feeds. Pressing a button hides that sensor's marks. Hiding is
  per browser tab and is not stored, so a reload shows every sensor again.
- Websocket deltas are merged into the client cache by `mills|device` instead of `mills`, so a
  new reading from one sensor cannot replace another sensor's reading at the same time.

Colours come from a hash of the device string into seven Okabe-Ito colours. A device keeps its
colour when other sensors appear or disappear, unless two device names hash to the same slot, in
which case the later one in name order moves to the next free slot.

## What does not change

The main reading, delta, direction, alarms, AR2 forecast, plugins, reports, the REST and v3 APIs,
websocket payloads and stored records are untouched. They still see all feeds merged in time
order, so the big number and the forecast follow whichever sensor uploaded last. The legend
toggles do not filter any of them.

## Known limits

- API v1 deduplicates on `sysTime` + `type` (`lib/server/entries.js`, `upsertQueryFor`). Two
  sensors uploading a reading with the same millisecond timestamp through v1 keep only the last
  one. On a local test, 1,053 posted readings including three at one shared millisecond stored
  1,051. Sensors reading at their own second offsets, as Juggluco's do, are unaffected. Changing
  the upsert identity is a server change and is left for a separate review.
- The server delta (`lib/data/calcdelta.js`) keys on `mills` + glucose, so two sensors with the
  same millisecond and the same value would send one of them in a live update until the next full
  load.
- `OBSCURE_DEVICE_PROVENANCE` replaces every device name and so collapses all feeds into one series.
- Entries without `device` are grouped as "Unknown sensor".

## Testing

`tests/multisensor.test.js` covers the setting default, grouping, same-timestamp keys, gaps,
backfill order, invalid entries and the delta merge in both modes.
`testing/populate_multisensor.js <url> <api-secret>` seeds a disposable site with three synthetic
sensors at 1-minute cadence, a 30-minute dropout on one, and one shared-millisecond triple.

## Turning it off

Remove `MULTI_SENSOR_DISPLAY` (or set it to `false`) and restart. Nothing is stored by this mode,
so there is nothing to migrate back.
