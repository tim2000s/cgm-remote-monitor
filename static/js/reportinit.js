'use strict';

$(document).ready(function() {
	console.log('Application got ready event');
	// Browser-only: auto-generate the default 7-day report on load so the
	// Statistics Summary tab shows data without a manual "Show" click. The
	// headless test harness drives reportclient() directly (this ready handler
	// does not fire there), so the flag stays unset and tests keep full control.
	window.Nightscout.reportAutoShow = true;
	window.Nightscout.reportclient();
});
