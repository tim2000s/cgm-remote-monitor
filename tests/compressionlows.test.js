'use strict';

require('should');

var cl = require('../lib/report/compressionlows');

// Helper: build a day's time-ordered statsrecords from a list of mg/dL values
// starting at a given hour, spaced 5 minutes apart.
function series (startHour, mgdlValues) {
  var base = new Date(2024, 0, 15, startHour, 0, 0, 0); // local time
  return mgdlValues.map(function (v, i) {
    var t = new Date(base.getTime() + i * 5 * 60000);
    return { sgv: v / 18, bgValue: v, displayTime: t };
  });
}

describe('compression lows', function () {

  it('flags a sharp overnight V (steep drop + steep recovery)', function () {
    // 02:00, drops 120 -> 55 in 15 min and recovers back in 15 min
    var recs = series(2, [120, 95, 70, 55, 70, 95, 120, 120]);
    var idx = cl.detectIndexes(recs);
    idx.length.should.be.greaterThan(0);
    // the trough (index 3, value 55) must be excluded
    idx.indexOf(3).should.not.equal(-1);
    // recovery limb up to first non-rising point is excluded (the whole V)
    var filtered = cl.filterCompressionLows(recs);
    filtered.length.should.be.lessThan(recs.length);
    filtered.some(function (r) { return r.bgValue === 55; }).should.equal(false);
  });

  it('leaves a sustained overnight low untouched (real hypo, no fast recovery)', function () {
    // a genuine slow low that lingers and recovers slowly
    var recs = series(3, [90, 80, 70, 65, 63, 62, 64, 66, 68, 70, 72]);
    var idx = cl.detectIndexes(recs);
    idx.length.should.equal(0);
    cl.filterCompressionLows(recs).length.should.equal(recs.length);
  });

  it('does not flag a daytime sharp V (outside the night window)', function () {
    var recs = series(14, [120, 95, 70, 55, 70, 95, 120, 120]); // 14:00
    cl.detectIndexes(recs).length.should.equal(0);
  });

  it('does not flag a sharp V that never dips below threshold', function () {
    var recs = series(2, [120, 100, 85, 80, 85, 100, 120]); // trough 80 >= 70
    cl.detectIndexes(recs).length.should.equal(0);
  });

  it('requires both a steep drop AND a steep recovery', function () {
    // steep drop into the low but only a very slow drift back up
    var recs = series(2, [120, 95, 70, 55, 57, 59, 61, 63, 65]);
    cl.detectIndexes(recs).length.should.equal(0);
  });

  it('returns the input unchanged for tiny arrays', function () {
    cl.filterCompressionLows([]).should.eql([]);
    var two = series(2, [55, 60]);
    cl.filterCompressionLows(two).length.should.equal(2);
  });

  it('respects custom thresholds', function () {
    var recs = series(2, [120, 95, 70, 55, 70, 95, 120, 120]);
    // raise the required steepness so the same V no longer qualifies
    cl.detectIndexes(recs, { rateMgdlPerMin: 100 }).length.should.equal(0);
  });

  it('still flags a V whose descent has noise (nearest-neighbour validation)', function () {
    // small upward wiggle in the descent (90 -> 95) would break a strict
    // monotonic limb, but the nearest-neighbour rate still validates the V
    var recs = series(2, [120, 90, 95, 60, 95, 120, 120]);
    cl.detectIndexes(recs).length.should.be.greaterThan(0);
    cl.filterCompressionLows(recs).some(function (r) { return r.bgValue === 60; }).should.equal(false);
  });

  it('flags a ~35 min symmetric overnight U (within the 45 min cap)', function () {
    var recs = series(1, [110, 90, 65, 60, 55, 52, 55, 60, 65, 68, 90, 110]); // trough ~35 min
    cl.detectIndexes(recs).length.should.be.greaterThan(0);
  });

  it('flags a threshold-edge V by measuring against the trough minimum', function () {
    // crosses 70 slowly (72 -> 69) then plunges to 50: the drop into the
    // minimum and the recovery are both steep even though the first
    // sub-threshold sample (69) is near the threshold
    var recs = series(2, [120, 90, 72, 69, 50, 90, 110]);
    cl.detectIndexes(recs).length.should.be.greaterThan(0);
    cl.filterCompressionLows(recs).some(function (r) { return r.bgValue === 50; }).should.equal(false);
  });

  it('rejects a trough that contains a long sensor gap', function () {
    // 55 then a 45-min dropout then 50: endpoints look like a steep V but the
    // trough is a dropout-bounded ambiguous low, not a sampled compression low
    var base = new Date(2024, 0, 15, 5, 0, 0, 0);
    var t = function (mins) { return new Date(base.getTime() + mins * 60000); };
    var recs = [
      { sgv: 5.5, bgValue: 100, displayTime: t(0) }   // 05:00
      , { sgv: 3.0, bgValue: 55, displayTime: t(5) }   // 05:05
      , { sgv: 2.7, bgValue: 50, displayTime: t(50) }  // 05:50 (45-min gap inside trough)
      , { sgv: 5.5, bgValue: 100, displayTime: t(55) } // 05:55
    ];
    cl.detectIndexes(recs).length.should.equal(0);
  });

  it('does not flag a low preceded by a long sensor gap (ambiguous)', function () {
    // 90, then a 30-min dropout, then a sudden deep low: neighbour is too far
    // away to evidence a steep drop, so we leave it alone
    var base = new Date(2024, 0, 15, 5, 0, 0, 0);
    var t = function (mins) { return new Date(base.getTime() + mins * 60000); };
    var recs = [
      { sgv: 5, bgValue: 90, displayTime: t(0) }    // 05:00
      , { sgv: 2.7, bgValue: 48, displayTime: t(30) } // 05:30 (30-min gap)
      , { sgv: 2.3, bgValue: 42, displayTime: t(35) }
      , { sgv: 2.5, bgValue: 45, displayTime: t(40) }
      , { sgv: 5, bgValue: 90, displayTime: t(45) }
    ];
    cl.detectIndexes(recs).length.should.equal(0);
  });

});
