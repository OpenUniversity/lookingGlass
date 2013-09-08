var util = require('./util.js');
var assert = require('assert');

exports.MatchMaker = function(storage) {
    this.transaction = function(trans, callback) {
	var postMethods = [];
	for(var key in trans) {
	    var methodName = 'handle_' + key;
	    if(this[methodName]) {
		postMethods.push(this[methodName](trans, key));
	    }
	}
	var self = this;
	storage.transaction(trans, util.protect(callback, function(err, result) {
	    for(var i = 0; i < postMethods.length; i++) {
		postMethods[i].call(self, result);
	    }
	    callback(undefined, result);
	}));
    };

    this.handle_put = function(trans, put) {
	if(!trans.accum) trans.accum = {};
	trans.accum.dir_exists = 1;
	var putCmd = trans[put];
	for(var key in putCmd) {
	    if(endsWith(key, '.json')) {
		addToGet(trans, '*.map');
		addToGet(trans, key);
	    } else if(endsWith(key, '.map')) {
		addToGet(trans, '*.json');
		addToGet(trans, '*.d');
		addToGet(trans, key);
	    } else if(endsWith(key, '.d')) {
		addToGet(trans, '*.map');
	    }
	}
	return function(result) {
	    ensureParent(trans.path, result, trans._ts);

	    for(var key in putCmd) {
		if(endsWith(key, '.json')) {
		    for(var resultKey in result) {
			var ts = maxTS(trans, result[resultKey]);
			if(endsWith(resultKey, '.map:latest')) {
			    if(key in result) {
				createTask(result, {type: 'unmap',
						    path: trans.path + key,
						    content: result[key],
						    map: result[resultKey],
						    _ts: ts});
			    }
			    createTask(result, {type: 'map',
						path: trans.path + key,
						content: putCmd[key],
						map: result[resultKey],
						_ts: ts + 'X'});
			}
		    }
		} else if(endsWith(key, '.map')) {
		    for(var resultKey in result) {
			var ts = maxTS(trans, result[resultKey]);
			if(endsWith(resultKey, '.json:latest')) {
			    if(key in result) {
				createTask(result, {type: 'unmap',
						    path: trans.path + removeSuffix(resultKey, ':latest'),
						    content: result[resultKey],
						    map: result[key],
						    _ts: ts});
			    }
			    createTask(result, {type: 'map',
						path: trans.path + removeSuffix(resultKey, ':latest'),
						content: result[resultKey],
						map: putCmd[key],
						_ts: ts + 'X'});
			}
			if(endsWith(resultKey, '.d:latest')) {
			    var put = {};
			    put[key] = putCmd[key];
			    createTask(result, {type: 'transaction',
						path: trans.path + removeSuffix(resultKey, ':latest').replace(/\.d$/, '/'),
						put: put,
						_ts: ts});
			}
		    }
		} else if(endsWith(key, '.d')) {
		    var foundMaps = false;
		    for(var resultKey in result) {
			var ts = maxTS(trans, result[resultKey]);
			if(endsWith(resultKey, '.map:latest')) {
			    var putMaps = {};
			    putMaps[removeSuffix(resultKey, ':latest')] = result[resultKey];
			    createTask(result, {type: 'transaction',
						path: trans.path + key.replace(/\.d$/, '/'),
						put: putMaps,
						_ts: ts});
			}
		    }
		}
	    }
	};
    };
    this.handle_remove = function(trans, remove) {
	var removeCmd = trans[remove];
	for(var i = 0; i < removeCmd.length; i++) {
	    var key = removeCmd[i];
	    if(endsWith(key, '.json')) {
		addToGet(trans, '*.map');
		addToGet(trans, key);
	    } else if(endsWith(key, '.map')) {
		addToGet(trans, '*.json');
		addToGet(trans, '*.d');
		addToGet(trans, key);
	    }
	}
	return function(result) {
	    for(var i = 0; i < removeCmd.length; i++) {
		var key = removeCmd[i];
		if(endsWith(key, '.json')) {
		    for(var resultKey in result) {
			if(endsWith(resultKey, '.map')) {
			    createTask(result, {type: 'unmap',
						path: trans.path + key,
						content: result[key],
						map: result[resultKey],
						_ts: trans._ts});
			}
		    }
		} else if(endsWith(key, '.map')) {
		    for(var resultKey in result) {
			if(endsWith(resultKey, '.json')) {
			    createTask(result, {type: 'unmap',
						path: trans.path + resultKey,
						content: result[resultKey],
						map: result[key],
						_ts: trans._ts});
			} else if(endsWith(resultKey, '.d')) {
			    createTask(result, {type: 'transaction',
						path: trans.path + resultKey.replace(/\.d$/, '/'),
						remove: [key],
						_ts: trans._ts});
			}
		    }
		}
	    }
	};
    };
    function endsWith(str, suffix) {
	return str.substr(str.length - suffix.length) == suffix;
    }
    function addToGet(trans, value) {
	if(!trans.getIfExists) trans.getIfExists = [];
	if(!trans.getLatest) trans.getLatest = [];
	if(trans.getIfExists.indexOf(value) < 0) {
	    trans.getIfExists.push(value);
	}
	if(trans.getLatest.indexOf(value) < 0) {
	    trans.getLatest.push(value);
	}
    }

    function ensureParent(path, result, ts) {
	if(path == '/') return;
	assert.equal(path.charAt(path.length - 1), '/');
	path = path.substr(0, path.length - 1);
	if(result.dir_exists == 0) {
	    var parsed = util.parsePath(path);
	    var put = {};
	    put[parsed.fileName + '.d'] = {};
	    createTask(result, {type: 'transaction',
				path: parsed.dirPath,
				put: put,
				_ts: ts});
	}
    }
    function createTask(result, task) {
	if(!result._tasks) result._tasks = [];
	result._tasks.push(task);
    }
    function maxTS(file1, file2) {
	return (file1._ts > file2._ts) ? file1._ts : file2._ts;
    }
    function removeSuffix(str, suff) {
	return str.substr(0, str.length - suff.length);
    }
}