'use strict';

// Compression-low detection (dropout-centric).
//
// On this data a compression artifact shows up as an overnight SENSOR DROPOUT:
// pressure on the sensor makes it lose signal, so the true low nadir is hidden
// inside a data gap, with low "shoulder" readings on either side and a recovery
// back to normal afterwards. A clean, well-sampled V with no dropout is treated
// as a real hypo, NOT compression (those plunge-and-recover traces are genuine
// lows here). So the signal we key on is: an overnight gap bracketing a low that
// recovers.
//
// Operates on a day's time-ordered statsrecords:
//   { sgv: <display value>, bgValue: <mg/dL int>, displayTime: <Date> }
// Detection is per-day so each series is contiguous; an event straddling local
// midnight can be split (accepted limitation).

// Fixed, sensible defaults (mg/dL and minutes-of-day).
var DEFAULTS = {
  nightStartMin: 23 * 60 + 30 // 23:30 window start (inclusive)
  , nightEndMin: 7 * 60       // 07:00 window end (exclusive)
  , gapMin: 15                // a gap longer than this is a sensor dropout
  , shoulderMgdl: 75          // a reading bracketing the gap below this = low at the dropout
  , recoverMgdl: 90           // must climb back to this (within recoverWindowMin) - rules out sustained lows
  , recoverWindowMin: 30
  , removeBelowMgdl: 80       // readings below this adjacent to the gap are the artifact shoulders to drop
  , removeSpanMin: 45         // do not walk the removal span further than this from a gap edge
};

function minuteOfDay (date) {
  return date.getHours() * 60 + date.getMinutes();
}

function isNight (date, cfg) {
  var m = minuteOfDay(date);
  return m >= cfg.nightStartMin || m < cfg.nightEndMin;
}

function minutesBetween (a, b) {
  return Math.abs(b.getTime() - a.getTime()) / 60000;
}

// Returns the indices of readings belonging to a suspected dropout-bracketed
// overnight compression low (the low shoulders around the sensor gap).
function detectIndexes (records, options) {
  var cfg = Object.assign({}, DEFAULTS, options || {});
  var flagged = {};
  if (!records || records.length < 2) { return []; }

  for (var i = 0; i < records.length - 1; i++) {
    var left = records[i];
    var right = records[i + 1];

    // a sensor dropout in the night window
    if (minutesBetween(left.displayTime, right.displayTime) <= cfg.gapMin) { continue; }
    if (!(isNight(left.displayTime, cfg) || isNight(right.displayTime, cfg))) { continue; }

    // glucose must be low at the dropout (the true nadir is hidden in the gap)
    if (Math.min(left.bgValue, right.bgValue) >= cfg.shoulderMgdl) { continue; }

    // and it must climb back to normal within recoverWindowMin on at least one
    // side - otherwise it is a sustained low that merely contains a gap
    var recovers = false;
    for (var r = i + 1; r < records.length
        && minutesBetween(right.displayTime, records[r].displayTime) <= cfg.recoverWindowMin; r++) {
      if (records[r].bgValue >= cfg.recoverMgdl) { recovers = true; break; }
    }
    if (!recovers) {
      for (var l = i; l >= 0
          && minutesBetween(left.displayTime, records[l].displayTime) <= cfg.recoverWindowMin; l--) {
        if (records[l].bgValue >= cfg.recoverMgdl) { recovers = true; break; }
      }
    }
    if (!recovers) { continue; }

    // remove the artifact shoulders: the contiguous low readings adjacent to
    // each side of the gap, bounded by removeSpanMin
    for (var a = i; a >= 0 && records[a].bgValue < cfg.removeBelowMgdl
        && minutesBetween(records[a].displayTime, left.displayTime) <= cfg.removeSpanMin; a--) {
      flagged[a] = true;
    }
    for (var b = i + 1; b < records.length && records[b].bgValue < cfg.removeBelowMgdl
        && minutesBetween(right.displayTime, records[b].displayTime) <= cfg.removeSpanMin; b++) {
      flagged[b] = true;
    }
  }

  return Object.keys(flagged).map(Number).sort(function (x, y) { return x - y; });
}

// Returns a copy of the day's records with suspected compression-low readings
// removed. Non-mutating, so toggling the option off restores the original.
function filterCompressionLows (records, options) {
  if (!records || records.length < 2) { return records ? records.slice() : records; }
  var drop = detectIndexes(records, options);
  if (!drop.length) { return records.slice(); }
  var exclude = {};
  for (var i = 0; i < drop.length; i++) { exclude[drop[i]] = true; }
  return records.filter(function notExcluded (r, idx) { return !exclude[idx]; });
}

module.exports = {
  DEFAULTS: DEFAULTS
  , detectIndexes: detectIndexes
  , filterCompressionLows: filterCompressionLows
};
