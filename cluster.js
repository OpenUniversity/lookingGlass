var util = require('./util.js');
var assert = require('assert');
var SubdirNotifier = require('./matchMaker.js').SubdirNotifier;
var Trampoline = require('./trampoline.js').Trampoline;
var Dispatcher = require('./dispatcher.js').Dispatcher;

exports.ClusterNode = function(disp, tracker, nodeID) {
    var self = this;
    var trackerPath = '/node/' + nodeID + '/';
    var PENDING_EXT = '.pending';
    var WIP_EXT = '.wip';
    var waitInterval = 20;
    var workerInterval = 100;
    var nodesCovered = 2;
    var peerFinderInterval = 200;
    var workers = [];
    var coveredPaths = new Array(nodesCovered);
    var peerFinder = new util.Worker(findPeers, peerFinderInterval);
    tracker = new SubdirNotifier(tracker);
    tracker = new Dispatcher(tracker, {});
    tracker = new Trampoline(tracker, 1000);
    
    var workers = [];
    for(var i = 0; i < nodesCovered + 1; i++) {
	workers.push(createWorker(i-1));
    }

    this.stop = function() {
	workers.forEach(function(w) {w.stop()});
	peerFinder.stop();
    };
    this.start = function() {
	workers.forEach(function(w) {w.start()});
	peerFinder.start();
    };
    this.transaction = function(trans, callback) {
	disp.transaction(trans, util.protect(callback, function(err, result) {
	    if(result._tasks) {
		var tasks = result._tasks;
		delete result._tasks;
		result._tracking = {path: trackerPath, counter: trans._ts + '.counter'};
		replaceDoneWithNewTasks(trackerPath, undefined, tasks, result._tracking, util.protect(callback, function() {
		    callback(undefined, result);
		}));
	    } else {
		callback(undefined, result);
	    }
	}));
    };
    
    var lastChange = {};
    function queryIfChanged(trans) {
	if(lastChange[trans.path]) {
	    trans.ifChangedSince = lastChange[trans.path];
	}
    }

    function tick(trackerPath, callback) {
	var trans = {path: trackerPath, getIfExists: ['*.pending']};
	util.seq([
	    function(_) { queryIfChanged(trans); _(); },
	    function(_) { tracker.transaction(trans, _.to('result')); },
	    function(_) { if(this.result._noChangesSince) callback(); else _(); },
	    function(_) { lastChange[trackerPath] = this.result._lastChangeTS; _(); },
	    function(_) { this.task = findPendingTask(this.result); _(); },
	    function(_) { if(this.task) _(); else callback(); },
	    function(_) { markTaskInProgress(trackerPath, this.task, _.to('result')); },
	    function(_) { if(this.result[this.task._id + PENDING_EXT]) _(); else callback(); },
	    function(_) { disp.dispatch(this.task, _.to('tasks')); },
	    function(_) { replaceDoneWithNewTasks(trackerPath, this.task, this.tasks, this.task._tracking, _); },
	], callback)();
    }

    function findPendingTask(dir) {
	for(var key in dir) {
	    if(key.substr(key.length - PENDING_EXT.length) == PENDING_EXT) {
		return dir[key].task;
	    }
	}
    }
    function markTaskInProgress(trackerPath, task, callback) {
	var put = {};
	put[task._id + WIP_EXT] = {task: task};
	tracker.transaction({path: trackerPath,
			     remove: [task._id + PENDING_EXT],
			     put: put,
			     getIfExists: [task._id + PENDING_EXT]}, callback);
    }
    function replaceDoneWithNewTasks(trackerPath, doneTask, newTasks, tracking, callback) {
	assert(tracking);
	var trans = {path: trackerPath, accum: {}};
	var counter = 0;
	if(doneTask) {
	    trans.remove = [doneTask._id + WIP_EXT];
	    jobTS = doneTask._ts;
	    counter--;
	}
	trans.put = {};
	for(var i = 0; i < newTasks.length; i++) {
	    var task = newTasks[i];
	    task._tracking = tracking;
	    task._id = util.timeUid();
	    trans.put[task._id + PENDING_EXT] = {task: task};
	    jobTS = task._ts;
	    counter++;
	}
	trans.accum[tracking.counter] = counter;
	tracker.transaction(trans, callback);
    }
    this.wait = function(result, callback) {
	if(!result._tracking) {
	    return callback();
	}
	var trackingInfo = result._tracking;
	var accum = {};
	accum[trackingInfo.counter] = 0;
	util.seq([
	    function(_) { setTimeout(_, waitInterval); },
	    function(_) { tracker.transaction({path: trackingInfo.path, accum: accum}, _.to('result')); },
	    function(_) { if(this.result[trackingInfo.counter] > 0) self.wait(result, callback); else _(); },
	], callback)();
    };
    function createWorker(index) {
	return new util.Worker(function(_) {
	    var path = index < 0 ? trackerPath : coveredPaths[index];
	    if(!path) return _();
	    tick(path, _);
	}, workerInterval);
    }
    function findPeers(callback) {
	tracker.transaction({path: '/node/', getIfExists: ['*.d']}, util.protect(callback, function(err, result) {
	    var peers = listFilesWithSuffix(result, '.d');
	    var index = 0;
	    while(index < peers.length && nodeID >= peers[index]) {
		index++;
	    }
	    for(var i = 0; i < nodesCovered; i++) {
		var peersIndex = (index + i) % peers.length;
		if(peers[peersIndex]) {
		    coveredPaths[i] = '/node/' + peers[peersIndex].replace(/\.d$/, '/');
		} else {
		    coveredPaths[i] = undefined;
		}
	    }
	}));
    }
    function listFilesWithSuffix(result, suffix) {
	var keys = [];
	for(var key in result) {
	    if(key.substr(key.length - suffix.length) == suffix) {
		keys.push(key);
	    }
	}
	return keys;
    }
};