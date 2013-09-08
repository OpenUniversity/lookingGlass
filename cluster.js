var util = require('./util.js');

exports.ClusterNode = function(disp, tracker, nodeID) {
    var self = this;
    var trackerPath = '/node/' + nodeID + '/';
    var worker = new util.Worker(tick, 10);
    var PENDING_EXT = '.pending';
    var WIP_EXT = '.wip';
    this.stop = function() { worker.stop(); };
    this.start = function() { worker.start(); };
    this.transaction = function(trans, callback) {
	disp.transaction(trans, util.protect(callback, function(err, result) {
	    if(result._tasks) {
		var put = {};
		for(var i = 0; i < result._tasks.length; i++) {
		    var task = result._tasks[i];
		    task._id = util.timeUid()
		    put[task._id + PENDING_EXT] = task;
		}
		delete result._tasks;
		tracker.transaction({path: trackerPath, put: put}, util.protect(callback, function() {
		    callback(undefined, result);
		}));
	    } else {
		callback(undefined, result);
	    }		   
	}));
    };

    function tick(callback) {
	util.seq([
	    function(_) { tracker.transaction({path: trackerPath, getIfExists: ['*.pending']}, _.to('result')); },
	    function(_) { this.task = findPendingTask(this.result); _(); },
	    function(_) { if(this.task) _(); else callback(); },
	    function(_) { markTaskInProgress(this.task, _); },
	    function(_) { disp.dispatch(this.task, _.to('tasks')); },
	    function(_) { replaceDoneWithNewTasks(this.task, this.tasks, _); },
	], callback)();
    }

    function findPendingTask(dir) {
	for(var key in dir) {
	    if(key.substr(key.length - PENDING_EXT.length) == PENDING_EXT) {
		return dir[key];
	    }
	}
    }
    function markTaskInProgress(task, callback) {
	var put = {};
	put[task._id + WIP_EXT] = task;
	var tsCond = {};
	tsCond[task._id + PENDING_EXT] = task._ts;
	tracker.transaction({path: trackerPath,
			     remove: [task._id + PENDING_EXT],
			     put: put,
			     tsCond: tsCond}, callback);
    }
    function replaceDoneWithNewTasks(doneTask, newTasks, callback) {
	var trans = {path: trackerPath};
	if(doneTask) {
	    trans.remove = [doneTask._id + WIP_EXT];
	}
	trans.put = {};
	for(var i = 0; i < newTasks.length; i++) {
	    var task = newTasks[i];
	    task._id = util.timeUid();
	    trans.put[task._id + PENDING_EXT] = task;
	}
	tracker.transaction(trans, callback);
    }
};