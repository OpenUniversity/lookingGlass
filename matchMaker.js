var util = require('./util.js');

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
	var putCmd = trans[put];
	for(var key in putCmd) {
	    if(endsWith(key, '.json')) {
		addToGet(trans, '*.map');
	    } else if(endsWith(key, '.map')) {
		addToGet(trans, '*.json');
	    }
	}
	return function(result) {
	    if(!result._map) result._map = [];

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
		    }
		}
	    }	    
	};
    };
    function endsWith(str, suffix) {
	return str.substr(str.length - suffix.length) == suffix;
    }
    function addToGet(trans, value) {
	if(!trans.get) trans.getIfExists = [];
	if(trans.getIfExists.indexOf(value) < 0) {
	    trans.getIfExists.push(value);
	}
    }
}