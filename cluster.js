var util = require('./util.js');

exports.ClusterNode = function(disp, tracker, nodeID) {
    var self = this;
    var trackerPath = '/node/' + nodeID + '/';
    this.stop = function() {};
    this.start = function() {};
    this.transaction = function(trans, callback) {
	disp.transaction(trans, util.protect(callback, function(err, result) {
	    if(result._tasks) {
		var put = {};
		for(var i = 0; i < result._tasks.length; i++) {
		    var task = result._tasks[i];
		    put[util.timeUid() + '.pending'] = task;
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
};