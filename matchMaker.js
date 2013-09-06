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
	    } else if(endsWith(key, '.map')) {
		addToGet(trans, '*.json');
		addToGet(trans, '*.d');
	    }
	}
	return function(result) {
	    ensureParent(trans.path, result);
	    if(!result._map) result._map = [];
	    if(!result._tramp) result._tramp = [];

	    for(var key in putCmd) {
		if(endsWith(key, '.json')) {
		    for(var resultKey in result) {
			if(endsWith(resultKey, '.map')) {
			    result._map.push({path: trans.path + key,
					      content: putCmd[key],
					      map: result[resultKey]});
			}
		    }
		} else if(endsWith(key, '.map')) {
		    for(var resultKey in result) {
			if(endsWith(resultKey, '.json')) {
			    result._map.push({path: trans.path + resultKey,
					      content: result[resultKey],
					      map: putCmd[key]});
			}
			if(endsWith(resultKey, '.d')) {
			    var put = {};
			    put[key] = putCmd[key];
			    result._tramp.push({path: trans.path + resultKey.replace(/\.d$/, '/'),
						put: put,
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
	if(trans.getIfExists.indexOf(value) < 0) {
	    trans.getIfExists.push(value);
	}
    }

    function ensureParent(path, result) {
	if(path == '/') return;
	assert.equal(path.charAt(path.length - 1), '/');
	path = path.substr(0, path.length - 1);
	if(result.dir_exists == 0) {
	    if(!result._tramp) result._tramp = [];
	    var parsed = util.parsePath(path);
	    var put = {};
	    put[parsed.fileName + '.d'] = {};
	    result._tramp.push({path: parsed.dirPath,
				put: put});
	}
    }
}