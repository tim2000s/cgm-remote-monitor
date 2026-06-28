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
  , limbWindowMin: 20   // max gap to the neighbouring reading used to measure the limb
  , maxTroughMin: 45    // compression troughs are brief; sustained lows are left alone
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
        // Validate the V using the nearest reading on each side of the trough.
        // Measuring against the immediate neighbour (rather than requiring a
        // strictly monotonic limb) tolerates sensor noise and the small dropouts
        // that compression itself often causes, as long as that neighbour is
        // within the limb window.
        var before = start > 0 ? records[start - 1] : null;
        var after = end < records.length - 1 ? records[end + 1] : null;
        var dropMins = before ? minutesBetween(before.displayTime, records[start].displayTime) : 0;
        var recMins = after ? minutesBetween(records[end].displayTime, after.displayTime) : 0;
        var dropRate = (before && dropMins > 0 && dropMins <= cfg.limbWindowMin)
          ? (before.bgValue - records[start].bgValue) / dropMins : 0;
        var recRate = (after && recMins > 0 && recMins <= cfg.limbWindowMin)
          ? (after.bgValue - records[end].bgValue) / recMins : 0;

        // require evidence of BOTH a steep drop in and a steep recovery out
        if (dropRate >= cfg.rateMgdlPerMin && recRate >= cfg.rateMgdlPerMin) {
          // Exclude the whole V: the trough plus the falling/rising shoulders
          // (strictly monotonic, within the limb window). Falls back to just the
          // trough when there is no clean shoulder.
          var dStart = start;
          while (dStart - 1 >= 0
              && records[dStart - 1].bgValue > records[dStart].bgValue
              && minutesBetween(records[dStart - 1].displayTime, records[start].displayTime) <= cfg.limbWindowMin) {
            dStart--;
          }
          var rEnd = end;
          while (rEnd + 1 < records.length
              && records[rEnd + 1].bgValue > records[rEnd].bgValue
              && minutesBetween(records[end].displayTime, records[rEnd + 1].displayTime) <= cfg.limbWindowMin) {
            rEnd++;
          }
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
