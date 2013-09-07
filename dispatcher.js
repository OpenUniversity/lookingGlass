var util = require('./util.js');

exports.Dispatcher = function(storage) {
    this.transaction = function(trans, callback) {
	storage.transaction(trans, callback);
    }
    this.dispatch = function(task, callback) {
	var methodName = 'do_' + task.type;
	if(!this[methodName]) throw new Error('Bad task type: ' + task.type);
	this[methodName](task, callback);
    };
    this.do_transaction = function(task, callback) {
	storage.transaction(task, util.protect(callback, function(err, result) {
	    if(result._tasks) {
		callback(undefined, result._tasks);
	    } else {
		callback(undefined, []);
	    }
	}));
    }
};