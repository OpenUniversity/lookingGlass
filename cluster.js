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
		var tasks = result._tasks;
		delete result._tasks;
		replaceDoneWithNewTasks(undefined, tasks, util.protect(callback, function() {
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
	    function(_) { markTaskInProgress(this.task, _.to('result')); },
	    function(_) { if(this.result[this.task._id + PENDING_EXT]) _(); else callback(); },
	    function(_) { disp.dispatch(this.task, _.to('tasks')); },
	    function(_) { replaceDoneWithNewTasks(this.task, this.tasks, _); },
	], callback)();
    }

    function findPendingTask(dir) {
	for(var key in dir) {
	    if(key.substr(key.length - PENDING_EXT.length) == PENDING_EXT) {
		return dir[key].task;
	    }
	}
    }
    function markTaskInProgress(task, callback) {
	var put = {};
	put[task._id + WIP_EXT] = {task: task};
	tracker.transaction({path: trackerPath,
			     remove: [task._id + PENDING_EXT],
			     put: put,
			     getIfExists: [task._id + PENDING_EXT]}, callback);
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
	    trans.put[task._id + PENDING_EXT] = {task: task};
	}
	tracker.transaction(trans, callback);
    }
    this.wait = function(tracking, callback) {
	callback();
    };
};