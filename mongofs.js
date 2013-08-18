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
	path = this.encoder.encode(path);
	var parsedPath = parsePath(path);
	var proj = {};
	proj['f.' + parsedPath.fileName] = {$slice: -1};
	this.coll.find({_id: parsedPath.dirPath}, proj).toArray(util.protect(callback, function(err, docs) {
		if(err) return callback(err);
		if(docs.length < 1) {
			err = new Error('Path not found: ' + parsedPath.dirPath);
			err.fileNotFound = 1;
			return callback(err);
		}
		var vers = docs[0].f[parsedPath.fileName];
		if(!vers) {
			err = new Error('File not found: ' + path);
			err.fileNotFound = 1;
			return callback(err);
		}
		if(vers.length < 1) {
			return callback(new Error('No versions found for: ' + path));
		}
		if(vers[0]._dead) {
			err = new Error('File not found: ' + path);
			err.fileNotFound = 1;
			return callback(err);
		}
		callback(undefined, vers[0]);
	}));
}

MFS.prototype.createMappingActions = function(action, path, content, mappings) {
	path = this.encoder.decode(path);
	var actions = [];
	if(content._dead) return [];

	for(key in mappings) {
		actions.push({type: action, mapping: mappings[key], path: path, content: content});
	}
	return actions;
}

MFS.prototype.put = function(path, content, callback) {
	path = this.encoder.encode(path);
	if(!('_ts' in content)) {
		content._ts = util.timeUid();
	}
	var parsedPath = parsePath(path);

	var update = {};
	update['f.' + parsedPath.fileName] = {$each: [content], $slice: -this.maxVers, $sort: {_ts:1}};
	var fields = {m: 1};
	fields['f.' + parsedPath.fileName] = 1;
	var self = this;
	this.coll.findAndModify({_id: parsedPath.dirPath}, 
		{_id:1}, 
		{$push: update}, 
		{safe: true, upsert: true, fields: fields},
		util.protect(callback, function(err, doc) {
			var mappings = doc.m;
			if(doc.f) {
				var actions = [];
				var vers = doc.f[parsedPath.fileName];
				if(!vers) {
					return callback(undefined, self.createMappingActions('map', path, content, mappings));
				}
				var latest = vers[vers.length - 1];
				if(latest._ts < content._ts) {
					return callback(undefined, self.createMappingActions('map', path, content, mappings)
						.concat(self.createMappingActions('unmap', path, latest, mappings)));
				} else {
					return callback(undefined, []);
				}
			} else if(mappings) {
				var actions = self.createMappingActions('map', path, content, mappings);
				self.ensureParent(parsedPath.dirPath, function(err) { callback(err, actions); });
			} else {
				self.ensureParent(parsedPath.dirPath, function(err) { callback(err, []); });
			}
		}));
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
	path = this.encoder.encode(path);
	this.coll.find({_id: path}).toArray(util.protect(callback, function(err, docs) {
		if(docs.length < 1) {
			callback(new Error('Path not found: ' + path));
			return;
		}
		var doc = docs[0].f;
		if(expandFiles) {
			for(var name in doc) {
				var vers = doc[name];
				doc[name] = vers[vers.length - 1];
			}
		}
		callback(undefined, doc);
	}));
};
MFS.prototype.remove = function(path, timestamp, callback) {
	timestamp = timestamp || util.timeUid();
	this.put(path, {_ts: timestamp, _dead: 1}, callback);
};

MFS.prototype.createMapping = function(path, mapping, callback) {
	path = this.encoder.encode(path);
	var update = {};
	if(!('_ts' in mapping)) {
		mapping._ts = util.timeUid();
	}
	update['m.' + mapping._ts] = mapping;
	var self = this;
	this.coll.findAndModify({_id: path}, {_id: 1}, {$set: update}, {safe: true, upsert: true, fields: {f: 1}}, util.protect(callback, function(err, doc) {
		var actions = [];
		var files = doc.f;
		for(var key in files) {
			if(key.charAt(key.length-1) != '/') {
				var vers = files[key];
				if(vers.length == 0) continue;
				var lastVer = vers[vers.length - 1];
				if(lastVer._dead) continue;
				actions.push({type: 'map', mapping: mapping, path: self.encoder.decode(path + key), value: lastVer});
			} else {
				actions.push({type: 'tramp', internalType: 'map', mapping: mapping, path: self.encoder.decode(path + key)});					
			}
		}
		return callback(undefined, actions);
	}));
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
	path = this.encoder.encode(path);
	var unset = {};
	unset['m.' + ts] = 0;
	var fields = {f:1};
	fields['m.' + ts] = 1;
	var self = this;
	this.coll.findAndModify({_id: path}, {_id:1}, {$unset: unset}, {safe: true, fields: fields}, util.protect(callback, function(err, doc) {
		var files = doc.f;
		if(!files) {
			return callback(undefined, []);
		}
		var mapping = doc.m[ts];
		if(!mapping) {
			throw new Error('No mapping ' + ts + ' at path ' + path);
		}
		var actions = [];
		for(key in files) {
			if(key.charAt(key.length-1) != '/') {
				actions.push({type: 'unmap', mapping: mapping, path: self.encoder.decode(path + key)});
			} else {
				actions.push({type: 'tramp', internalType: 'unmap', mapping: mapping, path: self.encoder.decode(path + key)});					
			}
		}
		callback(undefined, actions);
	}));
};
exports.MFS = MFS;

