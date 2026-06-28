'use strict';

// Compression-low detection.
//
// CGMs report false lows when the sensor is compressed (e.g. lying on it
// overnight). These are not flagged in the data, so we detect them by their
// characteristic shape: a brief overnight dip below threshold with a steep drop
// in and a steep recovery out (a tight "V"). When enabled we drop the whole V
// (drop + trough + recovery) from the stats.
//
// Operates on a single day's time-ordered statsrecords:
//   { sgv: <display value>, bgValue: <mg/dL int>, displayTime: <Date> }
// Detection is per-day so each series is contiguous; this misses Vs that
// straddle local midnight, which is an accepted limitation.

// Fixed, sensible defaults (mg/dL and minutes).
var DEFAULTS = {
  lowMgdl: 70           // only readings below this can be part of a compression low
  , rateMgdlPerMin: 1.5 // minimum steepness of both the drop-in and the recovery-out
  , limbWindowMin: 20   // how far before/after the trough to look for the steep limb
  , maxTroughMin: 30    // compression troughs are brief; sustained lows are left alone
  , nightStartHour: 22  // night window start (inclusive)
  , nightEndHour: 8     // night window end (exclusive)
};

function isNight (date, cfg) {
  var h = date.getHours();
  return h >= cfg.nightStartHour || h < cfg.nightEndHour;
}

function minutesBetween (a, b) {
  return Math.abs(b.getTime() - a.getTime()) / 60000;
}

// Returns the indices of records that belong to a suspected compression-low V.
function detectIndexes (records, options) {
  var cfg = Object.assign({}, DEFAULTS, options || {});
  var flagged = [];
  if (!records || records.length < 3) { return flagged; }

  var i = 0;
  while (i < records.length) {
    if (records[i].bgValue < cfg.lowMgdl) {
      // maximal run of consecutive readings below threshold (the trough)
      var start = i;
      var end = i;
      while (end + 1 < records.length && records[end + 1].bgValue < cfg.lowMgdl) {
        end++;
      }

      var troughMins = minutesBetween(records[start].displayTime, records[end].displayTime);
      var atNight = isNight(records[start].displayTime, cfg) || isNight(records[end].displayTime, cfg);

      if (atNight && troughMins <= cfg.maxTroughMin) {
        // walk back along a strictly-falling limb into the trough
        var dStart = start;
        while (dStart - 1 >= 0
            && records[dStart - 1].bgValue > records[dStart].bgValue
            && minutesBetween(records[dStart - 1].displayTime, records[start].displayTime) <= cfg.limbWindowMin) {
          dStart--;
        }
        // walk forward along a strictly-rising limb out of the trough
        var rEnd = end;
        while (rEnd + 1 < records.length
            && records[rEnd + 1].bgValue > records[rEnd].bgValue
            && minutesBetween(records[end].displayTime, records[rEnd + 1].displayTime) <= cfg.limbWindowMin) {
          rEnd++;
        }

        var dropMins = minutesBetween(records[dStart].displayTime, records[start].displayTime);
        var recMins = minutesBetween(records[end].displayTime, records[rEnd].displayTime);
        var dropRate = dropMins > 0 ? (records[dStart].bgValue - records[start].bgValue) / dropMins : 0;
        var recRate = recMins > 0 ? (records[rEnd].bgValue - records[end].bgValue) / recMins : 0;

        // require evidence of BOTH a steep drop in and a steep recovery out
        if (dropRate >= cfg.rateMgdlPerMin && recRate >= cfg.rateMgdlPerMin) {
          for (var k = dStart; k <= rEnd; k++) { flagged.push(k); }
        }
      }

      i = end + 1;
    } else {
      i++;
    }
  }

  return flagged;
}

// Returns a copy of the day's records with suspected compression-low Vs removed.
// Non-mutating, so toggling the option off restores the original records.
function filterCompressionLows (records, options) {
  if (!records || records.length < 3) { return records; }
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
