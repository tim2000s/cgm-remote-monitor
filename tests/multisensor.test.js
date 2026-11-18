'use strict';

require('should');
var _ = require('lodash');

var multisensor = require('../lib/client/multisensor');
var mergeDataUpdate = require('../lib/client/receiveddata').mergeDataUpdate;

var T0 = 1795021200000;
var MIN = 60000;

function sgv (device, mills, mgdl, id) {
  return { type: 'sgv', device: device, mills: mills, mgdl: mgdl, _id: id };
}

// Three sensors at 5-minute cadence sharing every timestamp; B stops for
// 30 minutes. Synthetic values, not real readings.
function threeSensorFixture () {
  var entries = [];
  for (var i = 0; i < 24; i++) {
    var t = T0 + i * 5 * MIN;
    entries.push(sgv('GS3-serial-A', t, 110 + i, 'A-' + i));
    if (i < 8 || i >= 14) entries.push(sgv('GS3-serial-B', t, 118 + i, 'B-' + i));
    entries.push(sgv('GS3-serial-C', t, 105 + i, 'C-' + i));
  }
  return entries;
}

describe('multi-sensor comparison display', function () {

  describe('setting', function () {
    it('defaults to off', function () {
      var settings = require('../lib/settings')();
      settings.multiSensorDisplay.should.equal(false);
      multisensor.isEnabled(settings).should.equal(false);
    });

    it('maps MULTI_SENSOR_DISPLAY from the environment', function () {
      var settings = require('../lib/settings')();
      settings.eachSettingAsEnv(function (name) {
        return name === 'MULTI_SENSOR_DISPLAY' ? 'true' : undefined;
      });
      settings.multiSensorDisplay.should.equal(true);
    });
  });

  describe('buildSeries', function () {
    it('keeps every reading at a shared timestamp as its own series point', function () {
      var series = multisensor.buildSeries(threeSensorFixture());
      _.map(series, 'device').should.eql(['GS3-serial-A', 'GS3-serial-B', 'GS3-serial-C']);
      var atT0 = series.map(function (s) { return s.segments[0][0]; });
      _.map(atT0, 'mills').should.eql([T0, T0, T0]);
      _.map(atT0, 'mgdl').should.eql([110, 118, 105]);
    });

    it('gives every same-timestamp reading a distinct chart key', function () {
      var entries = threeSensorFixture();
      var keys = entries.map(multisensor.entryKey);
      _.uniq(keys).length.should.equal(entries.length);
    });

    it('breaks only the sensor that stopped, without borrowing other sensors', function () {
      var series = _.keyBy(multisensor.buildSeries(threeSensorFixture()), 'device');
      series['GS3-serial-A'].segments.length.should.equal(1);
      series['GS3-serial-C'].segments.length.should.equal(1);
      var b = series['GS3-serial-B'].segments;
      b.length.should.equal(2);
      _.flatten(b).forEach(function (e) { e.device.should.equal('GS3-serial-B'); });
      // six missing readings: 35 min between the readings either side
      (b[1][0].mills - _.last(b[0]).mills).should.equal(35 * MIN);
    });

    it('sorts backfilled and shifted readings into per-sensor time order', function () {
      var entries = [
        sgv('A', T0 + 10 * MIN, 120, 'a3')
        , sgv('A', T0, 100, 'a1')
        , sgv('A', T0 + 5 * MIN + 12000, 110, 'a2') // 12 s clock skew
      ];
      var a = multisensor.buildSeries(entries)[0];
      _.map(a.segments[0], '_id').should.eql(['a1', 'a2', 'a3']);
      a.latest._id.should.equal('a3');
    });

    it('labels missing device as Unknown sensor and drops non-sensor and invalid entries', function () {
      var entries = [
        { type: 'sgv', mills: T0, mgdl: 100, _id: 'x' }
        , { type: 'sgv', mills: T0, mgdl: 100, device: '  ', _id: 'y' }
        , { type: 'mbg', mills: T0, mgdl: 100, device: 'meter' }
        , { type: 'rawbg', mills: T0, mgdl: 100 }
        , { type: 'forecast', mills: T0, mgdl: 100 }
        , sgv('A', T0, 38, 'low-code')
        , sgv('A', T0, NaN, 'nan')
      ];
      var series = multisensor.buildSeries(entries);
      series.length.should.equal(1);
      series[0].device.should.equal(multisensor.UNKNOWN_DEVICE);
      _.flatten(series[0].segments).length.should.equal(2);
    });

    it('keeps duplicate uploads with distinct ids apart and identical records deterministic', function () {
      var entries = [sgv('A', T0, 100, 'r1'), sgv('A', T0, 100, 'r2'), sgv('A', T0, 100)];
      var keys = entries.map(multisensor.entryKey);
      _.uniq(keys).length.should.equal(3);
      multisensor.entryKey(entries[2], 2).should.equal(multisensor.entryKey(entries[2], 2));
    });

    it('does not mutate the entries it is given', function () {
      var entries = threeSensorFixture();
      var before = _.cloneDeep(entries);
      multisensor.buildSeries(entries);
      entries.should.eql(before);
    });
  });

  describe('assignStyles', function () {
    it('keeps a device colour when arrival order or the other devices change', function () {
      var abc = multisensor.assignStyles(['GS3-serial-A', 'GS3-serial-B', 'GS3-serial-C']);
      var cba = multisensor.assignStyles(['GS3-serial-C', 'GS3-serial-B', 'GS3-serial-A']);
      abc.should.eql(cba);
      var a = multisensor.assignStyles(['GS3-serial-A']);
      a['GS3-serial-A'].should.eql(abc['GS3-serial-A']);
    });

    it('gives distinct colours and dashes to up to seven devices', function () {
      var devices = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
      var styles = multisensor.assignStyles(devices);
      _.uniq(_.map(styles, 'color')).length.should.equal(7);
      _.uniq(_.map(styles, 'dash')).length.should.equal(7);
    });
  });

  describe('client delta merge', function () {
    function cached () {
      var now = Date.now();
      return [sgv('A', now - MIN, 100, 'a'), sgv('B', now - MIN, 120, 'b')];
    }

    it('keeps both sensors when a delta repeats a timestamp, in comparison mode', function () {
      var c = cached();
      var delta = [sgv('C', c[0].mills, 130, 'c'), sgv('A', c[0].mills, 101, 'a')];
      var merged = mergeDataUpdate(true, c, delta, undefined, multisensor.mergeKey);
      _.sortBy(merged, 'device').map(function (e) { return e.device + e.mgdl; }).should.eql(['A101', 'B120', 'C130']);
    });

    it('keeps the legacy mills merge when comparison mode is off', function () {
      var c = cached();
      var delta = [sgv('C', c[0].mills, 130, 'c')];
      var merged = mergeDataUpdate(true, c, delta);
      merged.length.should.equal(2);
      _.map(merged, 'mgdl').should.eql([130, 130]);
    });
  });
});
