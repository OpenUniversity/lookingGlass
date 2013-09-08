var util = require('./util.js');

exports.Trampoline = function(disp, timeout) {
    this.transaction = function(trans, callback) {
	var startTime = (new Date()).getTime();
	disp.transaction(trans, util.protect(callback, function(err, result) {
	    if(result._tasks) {
		dispatchList(result._tasks, startTime, util.protect(callback, function(err, tasks) {
		    result._tasks = tasks;
		    callback(undefined, result);
		}));
	    } else {
		callback(undefined, result);
	    }
	}));
    };
    var self = this;
    function dispatchList(tasks, startTime, callback) {
	if(tasks.length == 0 || (new Date()).getTime() - startTime >= timeout) {
	    return callback(undefined, tasks);
	}
	var first = tasks[0];
	self.dispatch(first, util.protect(callback, function(err, newTasks) {
	    dispatchList(tasks.slice(1).concat(newTasks), startTime, callback);
	}));
    }
    this.dispatch = function(task, callback) {
	var startTime = (new Date()).getTime();
	disp.dispatch(task, util.protect(callback, function(err, tasks) {
	    dispatchList(tasks, startTime, callback);
	}));
    };
};