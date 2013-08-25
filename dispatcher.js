var util = require('./util.js');

var immediateTypes = {content:1, dir:1};

exports.Dispatcher = function(storage, tracker) {
	this.transaction = function(trans, callback) {
		if(!trans._ts) {
			trans._ts = util.timeUid();
		}
		var actionTuid = util.timeUid();
		var put = {};
		var retActions = [];
		util.seq([
			function(_) { storage.transaction(trans, _.to('actions')); },
			function(_) {
				var needsTracking = false;
				for(var i = 0; i < this.actions.length; i++) {
					var action = this.actions[i];
					if(immediateTypes[action.type]) {
						retActions.push(action);
					} else {
						put[trans._ts + '-' + actionTuid + '-' + i] = action;
						needsTracking = true;
					}
				}
				if(needsTracking) {
					_();
				} else {
					callback(undefined, retActions);
				}
			},
			function(_) { tracker.transaction({path: '/jobs/1/', put: put}, _); },
			function(_) { callback(undefined, retActions); },
		], callback)();
		storage.transaction(trans, util.protect(callback, function(err, actions) {
		}));
	};
};
