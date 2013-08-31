var util = require('./util.js');
var assert = require('assert');

var immediateTypes = {content:1, dir:1};

exports.Dispatcher = function(storage, tracker, scheduler, options) {
	options = options || {workerInterval: 10};
	var initialWaitInterval = options.initialWaitInterval || 10;
	var maxWaitInterval = options.maxWaitInterval || initialWaitInterval * 100;
	var waitIntervalGrowthFactor = options.waitIntervalGrowthFactor || 1.2;
	var worker = new util.Worker(tickTock, options.workerInterval, options.workerMaxInst);

	this.transaction = function(trans, callback) {
		if(!trans._ts) {
			trans._ts = util.timeUid();
		}
		var actionTuid = util.timeUid();
		var put = {};
		var retActions = [];
		var trackerPath = scheduler.getPath();
		util.seq([
			function(_) { storage.transaction(trans, _.to('actions')); },
			function(_) { trackActions(this.actions, trans._ts, undefined, trackerPath, _); },
		], callback)();
		return {path: trackerPath, ts: trans._ts};
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
				path: path, 
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
			trackActions(actions, job.content.actionTS, job, job.path, callback);
		}));
	};
	function trackActions(actions, ts, job, path, callback) {
		var actionTuid = util.timeUid();
		var put = {};
		var retActions = [];
		var numActions = 0;
		for(var i = 0; i < actions.length; i++) {
			var action = actions[i];
			action.actionTS = ts;
			if(immediateTypes[action.type]) {
				retActions.push(action);
			} else {
				put[ts + '-' + actionTuid + '-' + i] = action;
				numActions++;
			}
		}
		var trans = {path: path, put: put};
		if(job) {
			numActions--;
			trans['remove'] = ['^' + job.name];
		}
		if(/*numActions != 0 || job*/true) {
			trans.accum = {};
			trans.accum['count-' + ts] = numActions;
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

	this.do_map = function(job, callback) {
		var mapper = job.content.mapping._mapper;
		if(!mapper) return callback(undefined, []);
		if(mapper.substr(0, 5) != 'http:') return callback(undefined, []);
		var self = this;
		util.httpJsonReq('POST', mapper, job.content, util.protect(callback, function(err, status, headers, list) {
			if(status != 200) throw new Error('Bad status from mapper: ' + status);
			var actions = [];
			var cb = util.parallel(list.length, function() {callback(undefined, actions);});
			for(var i = 0; i < list.length; i++) {
				var path = util.parsePath(list[0].path);
				var content = list[0].content;
				var put = {};
				put[path.fileName] = content;
				var trans = {_ts: job.content._ts, path: path.dirPath, put: put};
				self.transaction(trans, function(err, act) {actions = actions.concat(act); cb();});
			}
		}));
	};

	this.wait = function(tracking, callback, waitInterval) {
		waitInterval = waitInterval || initialWaitInterval;
		var accum = {};
		var fileName = 'count-' + tracking.ts;
		accum[fileName] = 0;
		var self = this;
		tracker.transaction({path: tracking.path, accum: accum}, util.protect(callback, function(err, actions) {
			assert.equal(actions.length, 1);
			if(actions[0].content == 0) {
				tracker.transaction({path: tracking.path, accumReset: [fileName]}, callback);
			} else {
				setTimeout(function() {
					self.wait(tracking, callback, Math.min(waitInterval * waitIntervalGrowthFactor, maxWaitInterval));
				}, waitInterval);
			}
		}));
	};
};

