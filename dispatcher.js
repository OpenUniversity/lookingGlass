var util = require('./util.js');
var assert = require('assert');

var immediateTypes = {content:1, dir:1};

exports.Dispatcher = function(storage, tracker, scheduler) {
	var worker = new util.Worker(tickTock, 10);

	this.transaction = function(trans, callback) {
		if(!trans._ts) {
			trans._ts = util.timeUid();
		}
		var actionTuid = util.timeUid();
		var put = {};
		var retActions = [];
		util.seq([
			function(_) { storage.transaction(trans, _.to('actions')); },
			function(_) { trackActions(this.actions, trans._ts, undefined, _); },
		], callback)();
	};

	function selectJob(dir) {
		for(var i = 0; i < dir.length; i++) {	
			if(dir[i].type != 'content') continue;
			var name = dir[i].path;
			var nameSplit = name.split('/');
			name = nameSplit[nameSplit.length - 1];
			var path = nameSplit.slice(0, nameSplit.length - 1).join('/') + '/';
			if(name.substr(0, 1) != '^') {
				return {name: name, content: dir[i].content, path: path};
			}
		}
	}

	this.tick = function(path, callback) {
		path = path || scheduler.getPath();
		var self = this;
		util.seq([
			function(_) { tracker.transaction({path: path, getDir: {expandFiles:1}}, _.to('dir')); },
			function(_) {
				this.job = selectJob(this.dir);
				if(!this.job) return callback(); 
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
				path: scheduler.getPath(), 
				tsCond: this.tsCond, 
				remove: [this.job.name], 
				getIfExists: [this.job.name], 
				put: this.markJobInProgress}, _.to('actions')); },
			function(_) {
				if(this.actions.length == 0) {
					self.tick(path, callback);
				}	else {
					callback(undefined, this.job);
				}
			},
		], callback)();
	};

	this.tock = function(job, callback) {
		var self = this;
		this['do_' + job.content.type](job, util.protect(callback, function(err, actions) {
			trackActions(actions, job.content._ts, job, callback);
		}));
	};
	function trackActions(actions, ts, job, callback) {
		var actionTuid = util.timeUid();
		var put = {};
		var retActions = [];
		var needsTracking = false;
		for(var i = 0; i < actions.length; i++) {
			var action = actions[i];
			if(immediateTypes[action.type]) {
				retActions.push(action);
			} else {
				put[ts + '-' + actionTuid + '-' + i] = action;
				needsTracking = true;
			}
		}
		var trans = {path: scheduler.getPath(), put: put};
		if(job) {
			trans['remove'] = ['^' + job.name];
		}
		if(needsTracking) {
			tracker.transaction(trans, util.protect(callback, function() {
				callback(undefined, retActions);
			}));
		} else {
			callback(undefined, retActions);
		}
	}

	this.do_tramp = function(job, callback) {
		storage.transaction(job.content, callback);
	};
	
	this.start = function() {
		worker.start();
	};
	this.stop = function() {
		worker.stop();
	};

	var self = this;
	function tickTock(callback) {
		self.tick(undefined, util.protect(callback, function(err, job) {
			if(job) {
				self.tock(job, callback);
			}
		}));
	}
};

