var util = require('./util.js');
var assert = require('assert');

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

	function selectJob(dir) {
		for(var i = 0; i < dir.length; i++) {
			var name = dir[i].path;
			var nameSplit = name.split('/');
			name = nameSplit[nameSplit.length - 1];
			if(name.substr(0, 1) != '^') {
				return name;
			}
		}
	}

	this.tick = function(callback) {
		util.seq([
			function(_) { tracker.transaction({path: '/jobs/1/', getDir: {}}, _.to('dir')); },
			function(_) {
				this.job = selectJob(this.dir);
				//if(!job) return callback(undefined); 
				_();
			},
			function(_) { tracker.transaction({path: '/jobs/1/', getIfExists: [this.job]}, _.to('jobContent')); },
			function(_) {
				if(this.jobContent.length == 0) return callback(undefined);
				assert.equal(this.jobContent.length, 1);
				assert.equal(this.jobContent[0].type, 'content');
				this.markJobInProgress = {};
				this.markJobInProgress['^' + this.job] = this.jobContent[0].content;
				_();
			},
			function(_) { tracker.transaction({path: '/jobs/1/', ifExist: [this.job], remove: [this.job], put: this.markJobInProgress}, _); },
		], callback)();
	};
};
