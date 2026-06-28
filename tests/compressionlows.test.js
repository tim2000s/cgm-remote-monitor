'use strict';

require('should');

var cl = require('../lib/report/compressionlows');

// Build a day's time-ordered statsrecords from [ ['HH:MM', mgdl], ... ].
function recs (day, arr) {
  return arr.map(function (pair) {
    var hm = pair[0].split(':');
    return {
      sgv: pair[1] / 18
      , bgValue: pair[1]
      , displayTime: new Date(2024, 0, day, Number(hm[0]), Number(hm[1]), 0, 0)
    };
  });
}

describe('compression lows (dropout-centric)', function () {

  it('flags an overnight low bracketed by a sensor dropout', function () {
    // 90, 30-min dropout, then 48/42/45 and a recovery to 130
    var r = recs(15, [['05:00', 90], ['05:30', 48], ['05:35', 42], ['05:40', 45], ['05:45', 130]]);
    cl.detectIndexes(r).length.should.be.greaterThan(0);
    var kept = cl.filterCompressionLows(r);
    kept.some(function (x) { return x.bgValue === 42; }).should.equal(false);
    kept.some(function (x) { return x.bgValue === 130; }).should.equal(true); // recovery kept
  });

  it('flags a single low reading isolated between two dropouts', function () {
    var r = recs(15, [['06:18', 111], ['06:58', 64], ['07:00', 139]]); // gaps both sides (07:00 ok, before-window 06:58)
    // place the low clearly inside the window
    var r2 = recs(15, [['05:18', 111], ['05:58', 64], ['06:38', 139]]);
    cl.filterCompressionLows(r2).some(function (x) { return x.bgValue === 64; }).should.equal(false);
    void r;
  });

  it('does NOT flag a clean well-sampled V with no dropout (real hypo)', function () {
    // 5-min sampling throughout, deep sharp V to 40 - this is a genuine low
    var r = recs(15, [['02:00', 130], ['02:05', 90], ['02:10', 60], ['02:15', 40], ['02:20', 60], ['02:25', 90], ['02:30', 130]]);
    cl.detectIndexes(r).length.should.equal(0);
  });

  it('does NOT flag a sustained low that merely contains a gap', function () {
    // low for over an hour, with a 20-min dropout, never recovering near it
    var r = recs(15, [['02:00', 60], ['02:20', 58], ['02:40', 55], ['03:00', 57], ['03:20', 60], ['03:40', 63]]);
    cl.detectIndexes(r).length.should.equal(0);
  });

  it('does NOT flag a daytime dropout low (outside the night window)', function () {
    var r = recs(15, [['14:00', 90], ['14:30', 48], ['14:35', 45], ['14:40', 130]]);
    cl.detectIndexes(r).length.should.equal(0);
  });

  it('does NOT flag a dropout where glucose is not low', function () {
    var r = recs(15, [['02:00', 120], ['02:30', 130], ['02:35', 128]]); // gap but brackets >= 75
    cl.detectIndexes(r).length.should.equal(0);
  });

  it('respects the 23:30 window start', function () {
    var early = recs(15, [['22:50', 90], ['23:10', 55], ['23:15', 130]]); // dropout around 23:00 -> before window
    cl.detectIndexes(early).length.should.equal(0);
    var late = recs(15, [['23:35', 90], ['23:55', 55], ['00:00', 130]]); // 23:35 -> inside window
    cl.detectIndexes(late).length.should.be.greaterThan(0);
  });

  it('keeps the normal baseline reading next to the gap', function () {
    var r = recs(15, [['05:00', 90], ['05:30', 48], ['05:45', 130]]);
    cl.filterCompressionLows(r).some(function (x) { return x.bgValue === 90; }).should.equal(true);
  });

  it('returns the input unchanged for tiny arrays', function () {
    cl.filterCompressionLows([]).should.eql([]);
    cl.filterCompressionLows(recs(15, [['05:00', 55]])).length.should.equal(1);
  });

  it('respects custom thresholds', function () {
    var r = recs(15, [['05:00', 90], ['05:30', 48], ['05:35', 45], ['05:45', 130]]);
    // require the dropout itself to be longer than this event's 30-min gap
    cl.detectIndexes(r, { gapMin: 60 }).length.should.equal(0);
  });

});
