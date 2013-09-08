var util = require('./util.js');

exports.Trampoline = function(disp, timeout) {
    this.transaction = function(trans, callback) {
	disp.transaction(trans, util.protect(callback, function(err, result) {
	    if(result._tasks) {
		dispatchList(result._tasks, util.protect(callback, function(err, tasks) {
		    result._tasks = tasks;
		    callback(undefined, result);
		}));
	    } else {
		callback(undefined, result);
	    }
	}));
    };
    var self = this;
    function dispatchList(tasks, callback) {
	if(tasks.length == 0) {
	    return callback(undefined, tasks);
	}
	var first = tasks[0];
	self.dispatch(first, util.protect(callback, function(err, newTasks) {
	    dispatchList(tasks.slice(1).concat(newTasks), callback);
	}));
    }
    this.dispatch = function(task, callback) {
	disp.dispatch(task, util.protect(callback, function(err, tasks) {
	    dispatchList(tasks, callback);
	}));
    };
};