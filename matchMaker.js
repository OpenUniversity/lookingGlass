var util = require('./util.js');
var assert = require('assert');

exports.MatchMaker = function(storage) {
    var pairs = [];
    this.definePair = function(ext1, ext2, handler) {
	pairs.push({ext1: ext1, ext2: ext2, handler: handler});
	pairs.push({ext1: ext2, ext2: ext1, handler: handler});	
    }
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
    }

    this.handle_put = function(trans, put) {
	var putCmd = trans[put];
	for(var key in putCmd) {
	    for(var i = 0; i < pairs.length; i++) {
		if(endsWith(key, '.' + pairs[i].ext1)) {
		    addToGet(trans, "*." + pairs[i].ext2);
		    addToGet(trans, key);
		}
	    }
	}
	return function(result) {
	    for(var key in putCmd) {
		for(var i = 0; i < pairs.length; i++) {
		    if(endsWith(key, '.' + pairs[i].ext1)) {
			for(var resultKey in result) {
			    if(endsWith(resultKey, '.' + pairs[i].ext2)) {
				var args = {
				    path: trans.path,
				    _ts: trans._ts,
				    cmd: put,
				    changed: pairs[i].ext1,
				};
				args['key_' + pairs[i].ext1] = key;
				args['new_' + pairs[i].ext1] = putCmd[key];
				args['old_' + pairs[i].ext1] = result[key];
				args['key_' + pairs[i].ext2] = resultKey;
				args['new_' + pairs[i].ext2] = result[resultKey];
				args['old_' + pairs[i].ext2] = result[resultKey];
				pairs[i].handler(result, args);
			    } else if(endsWith(resultKey, '.' + pairs[i].ext2 + ':latest') &&
				      !result[resultKey.substr(0, resultKey.length - 7)]) {
				var args = {
				    path: trans.path,
				    _ts: result[resultKey]._ts + trans._ts,
				    cmd: put,
				    changed: pairs[i].ext1,
				};
				args['key_' + pairs[i].ext1] = key;
				args['new_' + pairs[i].ext1] = putCmd[key];
				args['old_' + pairs[i].ext1] = result[key];
				args['key_' + pairs[i].ext2] = resultKey.substr(0, resultKey.length - 7);
				args['new_' + pairs[i].ext2] = result[resultKey];
				args['old_' + pairs[i].ext2] = result[resultKey];
				pairs[i].handler(result, args);
			    }
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
	    for(var j = 0; j < pairs.length; j++) {
		var pair = pairs[j];
		if(endsWith(key, pair.ext1)) {
		    addToGet(trans, '*.' + pair.ext2);
		    addToGet(trans, key);
		}
	    }
	}
	return function(result) {
	    for(var i = 0; i < removeCmd.length; i++) {
		var key = removeCmd[i];
		for(var j = 0; j < pairs.length; j++) {
		    var pair = pairs[j];
		    if(endsWith(key, pair.ext1)) {
			for(var resultKey in result) {
			    if(endsWith(resultKey, '.' + pair.ext2)) {
				var args = {
				    path: trans.path,
				    _ts: trans._ts,
				    cmd: remove,
				    changed: pair.ext1,
				};
				args['key_' + pair.ext1] = key;
				// new value is left undefined
				args['old_' + pair.ext1] = result[key];
				args['key_' + pair.ext2] = resultKey;
				args['new_' + pair.ext2] = result[resultKey];
				args['old_' + pair.ext2] = result[resultKey];
				pair.handler(result, args);
			    } else if(endsWith(resultKey, '.' + pair.ext2 + ':latest') &&
				      !result[resultKey.substr(0, resultKey.length - 7)]) {
				var args = {
				    path: trans.path,
				    _ts: result[resultKey]._ts + trans._ts,
				    cmd: remove,
				    changed: pair.ext1,
				};
				args['key_' + pair.ext1] = key;
				args['old_' + pair.ext1] = result[key];
				args['key_' + pair.ext2] = resultKey;
				args['new_' + pair.ext2] = result[resultKey];
				args['old_' + pair.ext2] = result[resultKey];
				pair.handler(result, args);
			    }
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

};

exports.SubdirNotifier = function(storage) {
    var self = this;
    this.transaction = function(trans, callback) {
	if(trans.path != '/' && (trans.put || trans.accum)) {
	    if(!trans.accum) trans.accum = {};
	    trans.accum.dir_exists = 1;
	}
	storage.transaction(trans, util.protect(callback, function(err, result) {
	    if(result.dir_exists == 0) {
		assert.equal(trans.path.charAt(trans.path.length - 1), '/');
		var path = trans.path.substr(0, trans.path.length - 1);
		var parsed = util.parsePath(path);
		var put = {};
		put[parsed.fileName + '.d'] = {};
		self.transaction({path: parsed.dirPath, put: put, _ts: trans._ts}, util.protect(callback, function() {
		    callback(undefined, result);
		}));
	    } else {
		callback(undefined, result);
	    }
	}));
    };
};

exports.MapMatcher = function(storage) {
    var matcher = new exports.SubdirNotifier(storage);
    matcher = new exports.MatchMaker(matcher);
    matcher.definePair('map', 'json', function(result, args) {
	if(args.old_map && args.old_json) {
	    createTask(result, {type: 'unmap',
				path: args.path + args.key_json,
				content: args.old_json,
				map: args.old_map,
				_ts: args._ts});
	}
	if(args.new_map && args.new_json) {
	    createTask(result, {type: 'map',
				path: args.path + args.key_json,
				content: args.new_json,
				map: args.new_map,
				_ts: args._ts + 'X'});
	}
    });
    matcher.definePair('map', 'd', function(result, args) {
	if(args.new_map && args.new_d) {
	    var put = {};
	    put[args.key_map] = args.new_map;
	    createTask(result, {type: 'transaction',
				path: args.path + args.key_d.replace(/\.d$/, '/'),
				put: put,
				_ts: args._ts});
	} else {
	    createTask(result, {type: 'transaction',
				path: args.path + args.key_d.replace(/\.d$/, '/'),
				remove: [args.key_map],
				_ts: args._ts});
	}
    });

    this.transaction = function(trans, callback) {
	matcher.transaction(trans, callback);
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
    function createTask(result, task) {
	if(!result._tasks) result._tasks = [];
	result._tasks.push(task);
    }
}