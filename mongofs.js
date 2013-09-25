var util = require('./util.js');
var assert = require('assert');

function MFS(coll, options) {
    this.coll = coll;
    options = options || {};
    this.maxVers = options.maxVers || 1;
    this.encoder = new util.Encoder('-_/*%');
}

function hasFields(obj) {
    for(var k in obj) {
        return true;
    }
    return false;
}

MFS.prototype.transaction = function(trans, callback) {
    if(!('_ts' in trans)) {
        trans._ts = util.timeUid();
    }
    trans.path = this.encoder.encode(trans.path);
    var update = {};
    var fields = {};
    var query = {_id: trans.path};
    var postMethods = [];
    for(var key in trans) {
        var methodName = 'trans_' + key;
        if(this[methodName]) {
            postMethods.push(this[methodName](trans[key], update, fields, trans._ts, query));
        }
    }
    removeSubFieldsOfExistingFields(fields);
    var self = this;
    var post = util.protect(callback, function(err, doc) {
        if(!doc || !doc._id) {
            doc = {};
        }
	var result = {};
        for(var i = 0; i < postMethods.length; i++) {
            postMethods[i](trans.path, doc, result);
        }
        callback(undefined, result);
    });
    if(hasFields(update)) {
	updateTimestamp(update);
        this.coll.findAndModify(query, {_id:1}, update, {safe: true, upsert: (trans.tsCond?false:true), fields: fields}, post);
    } else {
        this.coll.findOne(query, fields, post);
    }
};

function updateTimestamp(update) {
    if(!update.$set) update.$set = {};
    update.$set._lastChangeTS = util.timeUid();
}

MFS.prototype.accessField = function(name, doc) {
    var fieldParts = this.mongoField(name).split('.');
    var field = doc;
    for(var i = 0; i < fieldParts.length; i++) {
	if(fieldParts[i] != '') {
	    field = field[fieldParts[i]];
	}
	if(!field) break;
    }
    return field;
};

MFS.prototype.trans_get = function(get, update, fields, ts) {
    for(var i = 0; i < get.length; i++) {
	if(get[i].substr(0, 2) == '*.') __ = true;
        fields[this.mongoField(get[i])] = 1;
    }
    fields._lastChangeTS = 1;
    var self = this;
    return function(path, doc, result) {
	result._lastChangeTS = doc._lastChangeTS;
        for(var i = 0; i < get.length; i++) {
	    var key = get[i];
            var field = self.accessField(key, doc);
	    if(Array.isArray(field)) {
		var ver = getLatestVersionAsOf(field, ts);
		if(ver._dead) { self.throwFileNotFoundException(key); }
		result[key] = ver;
	    } else if(typeof(field) == 'object'){
		assert.equal(key.charAt(0), '*');
		self.addSubFields(field, key.substr(1), ts, result);
	    } else {
		self.throwFileNotFoundException(key);
	    }
        }
    };
};

MFS.prototype.addSubFields = function(obj, suffix, ts, result) {
    for(var key in obj) {
	var name = key + suffix;
	var child = obj[key];
	if(Array.isArray(child)) {
	    var latest = getLatestVersionAsOf(child, ts);
	    if(!latest._dead) {
		result[this.encoder.decode(name)] = latest;
	    }
	} else if(typeof(child) == 'object') {
	    this.addSubFields(child, '.' + name, ts, result);
	}
    }
};

function getLatestVersionAsOf(vers, ts) {
    for(var i = vers.length - 1; i >= 0; i--) {
        if(vers[i]._ts < ts) {
            return vers[i];
        }
    }
    return vers[0];
}
function removeSubFieldsOfExistingFields(fields) {
    var fieldNames = [];
    for(var name in fields) {
        fieldNames.push(name);
    }
    for(var i = 0; i < fieldNames.length; i++) {
	if(fieldNames[i] == '') {
            removeFieldsStartingWith(fields, '');
	} else {
            removeFieldsStartingWith(fields, fieldNames[i] + '.');
	}
    }
}
function removeFieldsStartingWith(obj, prefix) {
    for(var field in obj) {
        if(field.substr(0, prefix.length) == prefix) {
            delete obj[field];
        }
    }
}

MFS.prototype.mongoField = function(field) {
    var comp = field.split('.');
    if(comp[0] == '*') {
	comp.shift();
    }
    comp.reverse();
    var self = this;
    comp = comp.map(function(x) { return self.encoder.encode(x); });
    return comp.join('.');
}

MFS.prototype.trans_put = function(put, update, fields, ts) {
    if(!update.$push) {
        update.$push = {};
    }
    for(var field in put) {
        put[field]._ts = ts;
        var content = put[field];
        update.$push[this.mongoField(field)] = {$each: [{_ts:0, _dead:1}, content], $slice: -this.maxVers, $sort: {_ts:1}};
        fields[this.mongoField(field)] = 1;
    }
    fields.m = 1;
    var self = this;
    return function(path, doc, actions) {};
};

function arrayAppend(array, arrayToAppend) {
    for(var i = 0; i < arrayToAppend.length; i++) {
        array.push(arrayToAppend[i]);
    }
}

MFS.prototype.throwFileNotFoundException = function(path) {
    var err = new Error('File not found: ' + path);
    err.fileNotFound = 1;
    throw err;
}

MFS.prototype.trans_remove = function(remove, update, fields, ts) {
    var put = {};
    for(var i = 0; i < remove.length; i++) {
        put[remove[i]] = {_dead:1};
    }
    return this.trans_put(put, update, fields, ts);
};

MFS.prototype.trans_getIfExists = function(get, update, fields, ts) {
    this.trans_get(get, update, fields, ts);
    var self = this;
    return function(path, doc, result) {
	result._lastChangeTS = doc._lastChangeTS;
        for(var i = 0; i < get.length; i++) {
            var field = self.accessField(get[i], doc);
	    if(!field) continue;
	    if(Array.isArray(field)) {
		var vers = field;
		if(vers.length == 0) throw new Error('Zero versions left for file ' + field);
		var content = vers[vers.length - 1];
		if(content._dead) continue;
		result[get[i]] = content;
	    } else if(typeof(field) == 'object') {
		self.addSubFields(field, get[i].substr(1), ts, result);
	    }
        }
    };
};

MFS.prototype.trans_getLatest = function(get, update, fields, ts) {
    var getIfExists = this.trans_getIfExists(get, update, fields, '~');  // ~ is the highest printable character in ASCII
    return function(path, doc, result) {
	var res = {};
	getIfExists(path, doc, res);
	for(var key in res) {
	    result[key + ':latest'] = res[key];
	}
    }
};



MFS.prototype.trans_tsCond = function(tsCond, update, fields, ts, query) {
    for(var key in tsCond) {
        query[this.mongoField(key) + '._ts'] = tsCond[key];
    }
    return function(path, doc, actions) {}
};

MFS.prototype.trans_accum = function(accum, update, fields, ts, query) {
    if(!update.$inc) {
        update.$inc = {};
    }
    for(var key in accum) {
        update.$inc[this.mongoField(key)] = accum[key];
        fields[this.mongoField(key)] = 1;
    }
    var self = this;
    return function(path, doc, result) {
        for(var key in accum) {
	    var field = self.accessField(key, doc);
	    if(field) {
		if(typeof(field) != 'number') throw new Error('Field ' + key + ' is not a number');
		result[key] = field;
	    } else {
		result[key] = 0;
	    }
        }
    };
};

MFS.prototype.trans_accumReset = function(accumReset, update, fields, ts, query) {
    if(!update.$unset) {
        update.$unset = {};
    }
    for(var i = 0; i < accumReset.length; i++) {
        var key = accumReset[i];
        update.$unset[this.mongoField(key)] = 0;
        fields[this.mongoField(key)] = 1;
    }
    var self = this;
    return function(path, doc, result) {
        for(var i = 0; i < accumReset.length; i++) {
	    var key = accumReset[i];
            var field = self.accessField(key, doc);
	    if(field) {
		result[key] = field;
	    } else {
		result[key] = 0;
	    }
        }
    };
};

MFS.prototype.trans_ifChangedSince = function(ifChangedSince, update, fields, ts, query) {
    query._lastChangeTS = {$ne: ifChangedSince};
    return function(path, doc, result) {
	if(!doc._lastChangeTS) {
	    result._noChangesSince = ifChangedSince;
	}
    };
};

exports.MFS = MFS;

