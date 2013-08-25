var util = require('./util.js');

function MFS(coll, options) {
	this.coll = coll;
	options = options || {};
	this.maxVers = options.maxVers || 1;
	this.encoder = new util.Encoder('-_/*%');
}

function parsePath(path) {
	var splitPath = path.split('/');
	return {
		fileName: splitPath[splitPath.length - 1],
		dirPath: splitPath.slice(0, splitPath.length - 1).join('/') + '/'
	};
}

MFS.prototype.get = function(path, callback) {
	var parsedPath = parsePath(path);
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
	var parsedPath = parsePath(path);
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
		return callback();
	}
	var parsed = parsePath(path.substr(0, path.length - 1));
	var proj = {};
	proj['f.' + parsed.fileName] = 1;
	var self = this;
	this.coll.find({_id: parsed.dirPath}, proj).toArray(util.protect(callback, function(err, docs) {
		if(docs.length == 0) {
			// Parent directory does not exist.
			// Create and ensure parent.
			var doc = {_id: parsed.dirPath, f:{}};
			doc.f[parsed.fileName + '/'] = 1;
			self.coll.insert(doc, function(err) {
				if(err) {
					return callback(err);
				}
				self.ensureParent(parsed.dirPath, callback);
			});
		} else {
			if(!docs[0].f || !docs[0].f[parsed.fileName]) {
				// Parent dir exists, but does not point to the child
				// Update it.
				var update = {};
				update['f.' + parsed.fileName + '/'] = 1;
				self.coll.update({_id: parsed.dirPath}, {$set: update}, {safe: true}, callback);
			} else {
				// All is well.
				// Nothing to do
				callback();
			}
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
	var parsedPath = parsePath(path);
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
	if(action.internalType == 'map') {
		this.createMapping(action.path, action.mapping, callback);
	} else if(action.internalType == 'unmap') {
		this.removeMapping(action.path, action.mapping._ts, callback);
	} else {
		return callback(new Error('Operation ' + action.internalType + ' not supported'));
	}
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
		var actions = [];
		for(var i = 0; i < postMethods.length; i++) {
			postMethods[i](trans.path, doc, actions);
		}
		for(var i = 0; i < actions.length; i++) {	
			if(actions[i].path) {
				actions[i].path = self.encoder.decode(actions[i].path);
			}
		}
		if(dirDoesNotExist) {
			self.ensureParent(trans.path, util.protect(callback, function() { callback(undefined, actions); }));
		} else {
			callback(undefined, actions);
		}
	});
	if(hasFields(update)) {
		this.coll.findAndModify(query, {_id:1}, update, {safe: true, upsert: (trans.ifExists?false:true), fields: fields}, post);
	} else {
		this.coll.findOne(query, fields, post);
	}
};

MFS.prototype.trans_get = function(get, update, fields, ts) {
	for(var i = 0; i < get.length; i++) {
		var field = this.encoder.encode(get[i]);
		fields['f.' + field] = 1;
	}
	var self = this;
	return function(path, doc, actions) {
		for(var i = 0; i < get.length; i++) {
			var field = self.encoder.encode(get[i]);
			if(!doc.f) { self.throwFileNotFoundExeption(path + field); }
			if(!(field in doc.f)) { self.throwFileNotFoundExeption(path + field); }
			var vers = doc.f[field];
			if(vers.length == 0) throw new Error('Zero versions left for file ' + field);
			var content = getLatestVersionAsOf(vers, ts);
			if(content._dead) { self.throwFileNotFoundExeption(path + field); }
			actions.push({type: 'content', path: path + field, content: content});
		}
	};
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
		removeFieldsStartingWith(fields, fieldNames[i] + '.');
	}
}
function removeFieldsStartingWith(obj, prefix) {
	for(var field in obj) {
		if(field.substr(0, prefix.length) == prefix) {
			delete obj[field];
		}
	}
}

MFS.prototype.trans_put = function(put, update, fields, ts) {
	if(!update.$push) {
		update.$push = {};
	}
	for(var field in put) {
		put[field]._ts = ts;
		var content = put[field];
		field = this.encoder.encode(field);
		update.$push['f.' + field] = {$each: [{_ts:0, _dead:1}, content], $slice: -this.maxVers, $sort: {_ts:1}};
		fields['f.' + field] = 1;
	}
	fields.m = 1;
	var self = this;
	return function(path, doc, actions) {
		var mappings = doc.m;
		if(doc.f) {
			for(var field in put) {
				var content = put[field];
				field = self.encoder.encode(field);
				var vers = doc.f[field];
				if(vers) {
					var latest = vers[vers.length - 1];
					if(latest._ts < content._ts) {
						arrayAppend(actions, self.createMappingActions('map', path + field, content, mappings));
						arrayAppend(actions, self.createMappingActions('unmap', path + field, latest, mappings));
					}
				} else {
					arrayAppend(actions, self.createMappingActions('map', path + field, content, mappings));
				}
			}
		} else if(mappings) {
			for(var field in put) {
				var content = put[field];
				arrayAppend(actions, self.createMappingActions('map', path + field, content, mappings));
			}
		}
	};
};

function arrayAppend(array, arrayToAppend) {
	for(var i = 0; i < arrayToAppend.length; i++) {
		array.push(arrayToAppend[i]);
	}
}

MFS.prototype.throwFileNotFoundExeption = function(path) {
	var err = new Error('File not found: ' + path);
	err.fileNotFound = 1;
	throw err;
}

MFS.prototype.trans_map = function(map, update, fields, ts) {
	if(!update.$set) {
		update.$set = {};
	}
	update.$set['m.' + ts] = map;
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
				actions.push({type: 'map', mapping: map, path: self.encoder.decode(path + key), value: lastVer});
			} else {
				actions.push({type: 'tramp', internalType: 'map', mapping: map, path: self.encoder.decode(path + key)});					
			}
		}
	};
};

MFS.prototype.trans_unmap = function(map, update, fields, ts) {
	if(!update.$unset) {
		update.$unset = {};
	}
	update.$unset['m.' + ts] = 0;
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
				actions.push({type: 'unmap', mapping: map, path: self.encoder.decode(path + key), value: lastVer});
			} else {
				actions.push({type: 'tramp', internalType: 'unmap', mapping: map, path: self.encoder.decode(path + key)});					
			}
		}
	};
};

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
	return function(path, doc, actions) {
		for(var i = 0; i < get.length; i++) {
			var field = self.encoder.encode(get[i]);
			if(!doc.f) continue;
			if(!(field in doc.f)) continue;
			var vers = doc.f[field];
			if(vers.length == 0) throw new Error('Zero versions left for file ' + field);
			var content = vers[vers.length - 1];
			if(content._dead) continue;
			actions.push({type: 'content', path: path + field, content: content});
		}
	};
};

MFS.prototype.trans_getDir = function(options, update, fields, ts) {
	fields.f = 1;
	var self = this;
	return function(path, doc, actions) {
		var fields = doc.f;
		if(!fields) return;
		for(var key in fields) {
			actions.push({type: 'dir', path: path + key});
			if(options.expandFiles) {
				var vers = fields[key];
				if(vers.length == 0) throw new Error('No versions for ' + path);
				var content = vers[vers.length - 1];
				actions.push({type: 'content', path: path + key, content: content});
			}
		}
	}
};

MFS.prototype.trans_ifExists = function(ifExists, update, fields, ts, query) {
	for(var i = 0; i < ifExists.length; i++) {
		var key = this.encoder.encode(ifExists[i]);
		query['f.' + key] = {$exists:true};
	}
	return function(path, doc, actions) {}
};

exports.MFS = MFS;

