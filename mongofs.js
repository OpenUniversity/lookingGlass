var util = require('./util.js');
var assert = require('assert');

function MFS(coll, options) {
    this.coll = coll;
    options = options || {};
    this.maxVers = options.maxVers || 1;
    this.encoder = new util.Encoder('-_/*%');
}

MFS.prototype.get = function(path, callback) {
    var parsedPath = util.parsePath(path);
    this.transaction({
        path: parsedPath.dirPath,
        get: [parsedPath.fileName]
    }, util.protect(callback, function(err, actions) {
        callback(undefined, actions[0].content);
    }));
}

MFS.prototype.createMappingActions = function(action, path, content, mappings) {
    var actions = [];
    if(content._dead) return [];

    for(key in mappings) {
        actions.push({type: action, mapping: mappings[key], path: path, content: content});
    }
    return actions;
}

MFS.prototype.put = function(path, content, callback) {
    var parsedPath = util.parsePath(path);
    var put = {};
    put[parsedPath.fileName] = content;
    var trans = {
        path: parsedPath.dirPath,
        put: put
    };
    if(content._ts) {
        trans._ts = content._ts;
    }
    this.transaction(trans, callback);
};

MFS.prototype.ensureParent = function(path, callback) {
    if(path == '/') {
        return callback(undefined, []);
    }
    var parsed = util.parsePath(path.substr(0, path.length - 1));
    var proj = {};
    proj[this.mongoField(parsed.fileName)] = 1;
    proj.m = 1;
    var update = {$set: {}};
    update.$set[this.mongoField(parsed.fileName) + '/'] = 1;
    var self = this;
    this.coll.findAndModify({_id: parsed.dirPath}, {_id: 1}, update, {upsert: true, fields: proj}, util.protect(callback, function(err, doc) {
        var actions = [];
        if(doc) {
            // parent directory exists
            if(doc.m) {
                for(var key in doc.m) {
                    actions.push({type: 'tramp', map: doc.m[key], path: path, _ts: key});
                }
            }
            callback(undefined, actions);
        } else {
            self.ensureParent(parsed.dirPath, callback);
        }
    }));
};

function batchPutKeys(self, keys, keyVals, callback) {
    if(keys.length == 0) {
        return callback();
    }

    try {
        var key = keys.shift();
        self.put(key, keyVals[key], function(err) {
            if(err) {
                callback(err);
            } else {
                batchPutKeys(self, keys, keyVals, callback);
            }
        });
    } catch(e) {
        callback(e);
    }
}

MFS.prototype.batchPut = function(keyVals, callback) {
    var keys = [];
    for(var key in keyVals) {
        keys.push(this.encoder.encode(key));
    }
    batchPutKeys(this, keys, keyVals, callback);
};

MFS.prototype.getDir = function(path, expandFiles, callback) {
    this.transaction({path: path, getDir: {expandFiles: expandFiles}}, util.protect(callback, function(err, actions) {
        var dir = {};
        for(var i = 0; i < actions.length; i++) {
            if(actions[i].type == 'dir') {
                var fileName = actions[i].path.substr(path.length);
                dir[fileName] = 1;
            }
        }
        if(expandFiles) {
            for(var i = 0; i < actions.length; i++) {
                if(actions[i].type == 'content') {
                    var fileName = actions[i].path.substr(path.length);
                    dir[fileName] = actions[i].content;
                }
            }
        }
        callback(undefined, dir);
    }));
};
MFS.prototype.remove = function(path, timestamp, callback) {
    var parsedPath = util.parsePath(path);
    var trans = {path: parsedPath.dirPath, remove: [parsedPath.fileName]};
    if(timestamp) {
        trans._ts = timestamp;
    }
    this.transaction(trans, callback);
};

MFS.prototype.createMapping = function(path, mapping, callback) {
    this.transaction({path: path, map: mapping, _ts: mapping._ts}, callback);
};
MFS.prototype.trampoline = function(action, callback) {
    this.transaction(action, callback);
};

MFS.prototype.removeMapping = function(path, ts, callback) {
    this.transaction({path: path, unmap: [ts]}, callback);
};
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
        var dirDoesNotExist = false;
        if(!doc || !doc._id) {
            dirDoesNotExist = true;
            doc = {};
        }
	var result = {};
        for(var i = 0; i < postMethods.length; i++) {
            postMethods[i](trans.path, doc, result);
        }
        if(dirDoesNotExist) {
            self.ensureParent(trans.path, util.protect(callback, function(err, parentResult) {
                callback(undefined, result); // TODO: something with parentResult
            }));
        } else {
            callback(undefined, result);
        }
    });
    if(hasFields(update)) {
        this.coll.findAndModify(query, {_id:1}, update, {safe: true, upsert: (trans.tsCond?false:true), fields: fields}, post);
    } else {
        this.coll.findOne(query, fields, post);
    }
};

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
    var self = this;
    return function(path, doc, result) {
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
	    result[this.encoder.decode(name)] = getLatestVersionAsOf(child, ts);
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

/*MFS.prototype.trans_map = function(map, update, fields, ts) {
    if(!update.$set) {
        update.$set = {};
    }
    util.createHashID(map);
    update.$set['m.' + map._id] = map;
    fields.f = 1;
    var self = this;
    return function(path, doc, actions) {
        var files = doc.f;
        for(var key in files) {
            if(key.charAt(key.length-1) != '/') {
                var vers = files[key];
                if(vers.length == 0) continue;
                var lastVer = vers[vers.length - 1];
                if(lastVer._dead) continue;
                actions.push({type: 'map', mapping: map, path: self.encoder.decode(path + key), content: lastVer});
            } else {
                actions.push({type: 'tramp', map: map, path: self.encoder.decode(path + key), _ts: ts});
            }
        }
    };
};

MFS.prototype.trans_unmap = function(unmap, update, fields, ts) {
    if(!update.$unset) {
        update.$unset = {};
    }
    for(var i = 0; i < unmap.length; i++) {
	update.$unset['m.' + unmap[i]] = 0;
	fields['m.' + unmap[i]] = 1;
    }
    fields.f = 1;
    var self = this;
    return function(path, doc, actions) {
        var files = doc.f;
	for(var i = 0; i < unmap.length; i++) {
	    var mapping = doc.m[unmap[i]];
	    if(!mapping) throw Error('Invalid mapping ' + unmap[i]);
	    for(var key in files) {
		if(key.charAt(key.length-1) != '/') {
		    var vers = files[key];
		    if(vers.length == 0) continue;
		    var lastVer = vers[vers.length - 1];
		    if(lastVer._dead) continue;
		    actions.push({type: 'unmap', mapping: mapping, path: self.encoder.decode(path + key), content: lastVer});
		} else {
		    actions.push({type: 'tramp', unmap: [unmap[i]], path: self.encoder.decode(path + key), _ts: ts});
		}
	    }
	}
    };
};
*/
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
        for(var i = 0; i < get.length; i++) {
            var field = self.accessField(get[i], doc);
	    if(!field) continue;
            var vers = field;
            if(vers.length == 0) throw new Error('Zero versions left for file ' + field);
            var content = vers[vers.length - 1];
            if(content._dead) continue;
	    result[get[i]] = content;
        }
    };
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

exports.MFS = MFS;

