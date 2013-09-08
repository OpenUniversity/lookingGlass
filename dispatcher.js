var util = require('./util.js');

exports.Dispatcher = function(storage, mappers) {
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
    this.do_map = function(task, callback) {
	var mapperName = task.map._mapper;
	if(!mapperName) throw new Error('No mapper in mapping: ' + JSON.stringify(task.map));
	var mapper = mappers[mapperName];
	if(!mapper) throw new Error('Invalid mapper: ' + mapperName);
	mapper.map(task, util.protect(callback, function(err, list) {
	    var tasks = []
	    for(var i = 0; i < list.length; i++) {
		var entry = list[i];
		var parsed = util.parsePath(entry.path);
		if(typeof(entry.content) == 'number') {
		    var accum = {};
		    accum[parsed.fileName] = entry.content;
		    tasks.push({type: 'transaction',
				path: parsed.dirPath,
				accum: accum,
				_ts: task._ts});
		} else {
		    var put = {};
		    put[parsed.fileName] = entry.content;
		    tasks.push({type: 'transaction',
				path: parsed.dirPath,
				put: put,
				_ts: task._ts});
		}
	    }
	    callback(undefined, tasks);
	}));
    };
};