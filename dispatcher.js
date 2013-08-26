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
			if(dir[i].type != 'content') continue;
			if(dir[i].content._dead) continue;
			var name = dir[i].path;
			var nameSplit = name.split('/');
			name = nameSplit[nameSplit.length - 1];
			if(name.substr(0, 1) != '^') {
				return {name: name, content: dir[i].content};
			}
		}
	}

	this.tick = function(callback) {
		var self = this;
		util.seq([
			function(_) { tracker.transaction({path: '/jobs/1/', getDir: {expandFiles:1}}, _.to('dir')); },
			function(_) {
				this.job = selectJob(this.dir);
				//if(!job) return callback(undefined); 
				_();
			},
			function(_) {
				this.markJobInProgress = {};
				this.markJobInProgress['^' + this.job.name] = this.job.content;
				this.tsCond = {};
				this.tsCond[this.job.name] = this.job.content._ts;
				_();
			},
			function(_) { tracker.transaction({
				path: '/jobs/1/', 
				tsCond: this.tsCond, 
				remove: [this.job.name], 
				getIfExists: [this.job.name], 
				put: this.markJobInProgress}, _.to('actions')); },
			function(_) {
				if(this.actions.length == 0) {
					self.tick(callback);
				}	else {
					callback(undefined, this.job);
				}
			},
		], callback)();
	};
};
