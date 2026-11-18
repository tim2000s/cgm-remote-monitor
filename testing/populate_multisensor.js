'use strict';

// Seed a disposable Nightscout with three synthetic GS3 sensor feeds for
// MULTI_SENSOR_DISPLAY testing. Never point this at a site anyone relies on.
//
//   node testing/populate_multisensor.js http://127.0.0.1:1340 <API_SECRET>
//
// Last 6 h at 1-minute cadence through API v1, as Juggluco uploads. Each sensor
// reads at its own second offset; sensor B drops out for 30 min; three
// readings share one exact millisecond to exercise the v1 sysTime+type upsert.
// Values are synthetic, not real readings.

var crypto = require('crypto');

var base = process.argv[2];
var secret = process.argv[3];
if (!base || !secret) {
  console.error('usage: node testing/populate_multisensor.js <base-url> <api-secret>');
  process.exit(1);
}

var MIN = 60000;
var now = Math.floor(Date.now() / MIN) * MIN;
var sensors = [
  { device: 'GS3-serial-A', offset: 7000, bias: 0 }
  , { device: 'GS3-serial-B', offset: 23000, bias: 12 }
  , { device: 'GS3-serial-C', offset: 41000, bias: -8 }
];

function glucose (t, s) {
  var h = t / 3600000;
  return Math.round(130 + 45 * Math.sin(h / 1.3) + 15 * Math.sin(h * 2.1 + s.bias) + s.bias);
}

var entries = [];
for (var t = now - 6 * 60 * MIN; t < now; t += MIN) {
  sensors.forEach(function (s) {
    var gap = s.device === 'GS3-serial-B' && t > now - 150 * MIN && t <= now - 120 * MIN;
    if (gap) return;
    var date = t + s.offset;
    entries.push({ type: 'sgv', date: date, dateString: new Date(date).toISOString(), sgv: glucose(t, s), direction: 'Flat', device: s.device });
  });
}

var collide = now - 60 * MIN;
sensors.forEach(function (s) {
  entries.push({ type: 'sgv', date: collide, dateString: new Date(collide).toISOString(), sgv: glucose(collide, s) + 3, direction: 'Flat', device: s.device });
});

var root = base.replace(/\/$/, '');
var headers = { 'Content-Type': 'application/json', 'api-secret': crypto.createHash('sha1').update(secret).digest('hex') };

function post (path, body) {
  return fetch(root + path, { method: 'POST', headers: headers, body: JSON.stringify(body) }).then(function (res) {
    console.log('POST', path, Array.isArray(body) ? body.length : 1, '->', res.status);
  });
}

// The main view blocks on an alert without a profile, so a fresh site gets a minimal one.
var profile = {
  defaultProfile: 'Default', startDate: new Date(0).toISOString(), mills: 0, units: 'mg/dl'
  , store: { Default: { dia: 6, timezone: 'UTC', units: 'mg/dl', carbratio: [{ time: '00:00', value: 10 }], sens: [{ time: '00:00', value: 50 }]
    , basal: [{ time: '00:00', value: 0.8 }], target_low: [{ time: '00:00', value: 100 }], target_high: [{ time: '00:00', value: 100 }] } }
};

fetch(root + '/api/v1/profile.json', { headers: headers }).then(function (res) { return res.json(); }).then(function (profiles) {
  return profiles.length ? null : post('/api/v1/profile', profile);
}).then(function () {
  return post('/api/v1/entries', entries);
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
