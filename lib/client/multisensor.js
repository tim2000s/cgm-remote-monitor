'use strict';

// Multi-sensor comparison mode (MULTI_SENSOR_DISPLAY). Display-only helpers:
// nothing here changes client.entries, ddata, alarms, predictions or the API.
// Sensor identity is the entry's exact `device` string, as uploaded.

var UNKNOWN_DEVICE = 'Unknown sensor';

// Okabe-Ito colours, ordered for contrast on the dark chart surface.
var PALETTE = ['#56B4E9', '#E69F00', '#CC79A7', '#F0E442', '#009E73', '#D55E00', '#0072B2'];
// One dash pattern per palette slot, so identity is not carried by colour alone.
var DASHES = ['', '6 3', '2 3', '8 3 2 3', '4 4', '1 2', '10 4'];

var MIN_GAP_MS = 2 * 60 * 1000;

function isEnabled (settings) {
  return !!(settings && settings.multiSensorDisplay);
}

function deviceOf (entry) {
  var d = entry && entry.device;
  return (typeof d === 'string' && d.trim() !== '') ? d : UNKNOWN_DEVICE;
}

// Per-reading chart identity. mills alone collides when sensors share a timestamp.
function entryKey (entry, index) {
  var id = entry._id || entry.identifier;
  return deviceOf(entry) + ':' + entry.mills + ':' + (id ? String(id) : 'i' + index);
}

// Identity used to merge websocket deltas into cached sgvs.
function mergeKey (entry) {
  return entry.mills + '|' + deviceOf(entry);
}

function hash (str) {
  // FNV-1a, so a device keeps its colour whatever other devices are present.
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// device -> { color, dash, slot }. Collisions probe to the next free slot in
// device-name order, so only colliding devices can move when the set changes.
function assignStyles (devices) {
  var sorted = devices.slice().sort();
  var used = {};
  var styles = {};
  sorted.forEach(function (device) {
    var slot = hash(device) % PALETTE.length;
    for (var n = 0; n < PALETTE.length && used[slot]; n++) {
      slot = (slot + 1) % PALETTE.length;
    }
    // shortcut: past 7 devices slots repeat, which is beyond the 3-sensor use case.
    used[slot] = true;
    styles[device] = { color: PALETTE[slot], dash: DASHES[slot], slot: slot };
  });
  return styles;
}

function isSensorReading (entry) {
  return entry && entry.type === 'sgv' && isFinite(entry.mgdl) && entry.mgdl >= 39 && isFinite(entry.mills);
}

function median (values) {
  if (!values.length) return 0;
  var s = values.slice().sort(function (a, b) { return a - b; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Lines break where a sensor's own spacing exceeds 3x its median cadence
// (at least 2 min): 15 min for 5-minute data, 3 min for 1-minute data.
function gapThreshold (readings) {
  var steps = [];
  for (var i = 1; i < readings.length; i++) {
    var dt = readings[i].mills - readings[i - 1].mills;
    if (dt > 0) steps.push(dt);
  }
  return Math.max(3 * median(steps), MIN_GAP_MS);
}

// entries -> [{ device, color, dash, latest, segments: [[entry, ...], ...] }]
// sorted by device. Input is not mutated.
function buildSeries (entries) {
  var byDevice = {};
  (entries || []).forEach(function (e, index) {
    if (!isSensorReading(e)) return;
    var device = deviceOf(e);
    (byDevice[device] = byDevice[device] || []).push({ entry: e, key: entryKey(e, index) });
  });

  var devices = Object.keys(byDevice).sort();
  var styles = assignStyles(devices);

  return devices.map(function (device) {
    var readings = byDevice[device].sort(function (a, b) {
      return a.entry.mills - b.entry.mills || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    }).map(function (r) { return r.entry; });

    var limit = gapThreshold(readings);
    var segments = [];
    var current = [];
    readings.forEach(function (r, i) {
      if (i > 0 && r.mills - readings[i - 1].mills > limit) {
        segments.push(current);
        current = [];
      }
      current.push(r);
    });
    if (current.length) segments.push(current);

    return {
      device: device
      , color: styles[device].color
      , dash: styles[device].dash
      , latest: readings[readings.length - 1]
      , segments: segments
    };
  });
}

module.exports = {
  UNKNOWN_DEVICE: UNKNOWN_DEVICE
  , PALETTE: PALETTE
  , isEnabled: isEnabled
  , deviceOf: deviceOf
  , entryKey: entryKey
  , mergeKey: mergeKey
  , assignStyles: assignStyles
  , buildSeries: buildSeries
};
