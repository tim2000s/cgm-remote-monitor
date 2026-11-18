'use strict';

// Legend and per-sensor readout for multi-sensor comparison mode, rendered
// into #sensorLegend. Toggles only hide chart marks (client.hiddenSensors);
// stored data, API responses, alarms and the main reading are unaffected.
// Hidden sensors are not persisted: a reload shows every sensor again.

var _ = require('lodash');
var multisensor = require('./multisensor');

function init (client, $) {

  var legend = {};
  var container = $('#sensorLegend');

  client.hiddenSensors = {};
  client.sensorStyles = {};

  if (!multisensor.isEnabled(client.settings) || !container.length) {
    legend.update = function update () { };
    return legend;
  }

  var translate = client.translate;

  function ageText (mills) {
    var mins = Math.max(0, Math.round((client.now - mills) / 60000));
    return mins + ' ' + translate('min ago');
  }

  function swatch (series) {
    return '<svg class="sensor-swatch" width="28" height="10" aria-hidden="true">' +
      '<line x1="1" y1="5" x2="27" y2="5" stroke="' + series.color + '" stroke-width="2"' +
      (series.dash ? ' stroke-dasharray="' + series.dash + '"' : '') + '/>' +
      '<circle cx="14" cy="5" r="3" fill="' + series.color + '"/></svg>';
  }

  legend.update = function update () {
    var series = multisensor.buildSeries(client.entries);
    client.sensorStyles = multisensor.assignStyles(series.map(function (s) { return s.device; }));

    var html = '<div class="sensor-notice">' +
      _.escape(translate('Comparison mode: this site holds several sensor feeds. The main reading, alarms and API are not per sensor. Do not use this site as a CGM source for automated insulin delivery.')) +
      '</div>';

    series.forEach(function (s) {
      var hidden = !!client.hiddenSensors[s.device];
      html += '<button type="button" class="sensor-toggle' + (hidden ? ' is-hidden' : '') + '"' +
        ' aria-pressed="' + (!hidden) + '" data-device="' + _.escape(s.device) + '"' +
        ' title="' + _.escape(translate(hidden ? 'Show' : 'Hide') + ' ' + s.device) + '">' +
        swatch(s) +
        '<span class="sensor-name">' + _.escape(s.device) + '</span>' +
        '<span class="sensor-value">' + _.escape(String(client.sbx.scaleEntry(s.latest))) +
        ' <small>' + _.escape(ageText(s.latest.mills)) + '</small></span>' +
        '</button>';
    });

    container.html(html).toggleClass('hidden', series.length === 0);
  };

  container.on('click', 'button.sensor-toggle', function onToggle () {
    var device = $(this).attr('data-device');
    if (client.hiddenSensors[device]) {
      delete client.hiddenSensors[device];
    } else {
      client.hiddenSensors[device] = true;
    }
    legend.update();
    if (client.chart) {
      client.chart.update(false);
    }
  });

  return legend;
}

module.exports = init;
