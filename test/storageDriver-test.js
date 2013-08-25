var assert = require("assert");
var util = require("../util.js");

function trampoline(driver, actions, callback) {
	for(var i = 0; i < actions.length; i++) {
		var action = actions[i];
		if(action.type == 'tramp') {
			actions.splice(i, 1);
			driver.trampoline(action, function(err, newActions) {
				if(err) return callback(err);
				actions = actions.concat(newActions);
				trampoline(driver, actions, callback);
			});
			return;
		}
	}
	// Found no trampoline actions
	callback(undefined, actions);
}

function describeStorageDriver(driverContainer) {
	var driver
	before(function() {
		driver = driverContainer.driver;
	});
	describe('as StorageDriver', function() {
		function actionsToMappings(actions) {
			var mappings = {};
			for(var i = 0; i < actions.length; i++) {
				var action = actions[i];
				mappings[action.type + ':' + action.path] = action;
			}
			return mappings;
		}
		it('should support any kind of characters in paths, with the exception that slash (/) and star (*)', function(done) {
			var path = '/!@#/$%^/&(){}/-=+_/';
			var fileName = ',.?<>[]';
			var put = {};
			put[fileName] = {foo: 'bar'};
			util.seq([
				function(_) { driver.transaction({path: path, put: put}, _); },
				function(_) { driver.transaction({path: path, get: [fileName]}, _.to('actions')); },
				function(_) { assert.equal(actionsToContent(this.actions, path + fileName).foo, 'bar'); _(); },
			], done)();
		});
		function actionsToContent(actions, path) {
			assert.equal(actions.length, 1);
			assert.equal(actions[0].type, 'content');
			assert.equal(actions[0].path, path);
			return actions[0].content;
		}
		describe('.transaction(trans, callback(err, actions))', function() {
			beforeEach(function(done) {
				driver.batchPut({'/a/b/c': {x:1}, '/a/b/d': {x:2}}, done);
			});
			describe('get', function() {
				before(function(done) {
					util.seq([
						function(_) { driver.transaction({_ts: '01000', path:'/bank1/account/', put: {me: {amount: 100}}}, _); },
						function(_) { driver.transaction({_ts: '02000', path:'/bank1/account/', put: {me: {amount: 200}}}, _); },
						function(_) { driver.transaction({_ts: '03000', path:'/bank1/account/', put: {me: {amount: 300}}}, _); },
						function(_) { driver.transaction({path:'/Hello/', put: {a: {foo: 'bar'}, b:{foo: 'baz'}}}, _); },
					], done)();
				});
				it('should retrieve the value of a file', function(done) {
					function actionsToContent(actions, path) {
						assert.equal(actions.length, 1);
						assert.equal(actions[0].type, 'content');
						assert.equal(actions[0].path, path);
						return actions[0].content;
					}
					driver.transaction({path: '/Hello/', get: ['a']}, util.protect(done, function(err, actions) {
						var content = actionsToContent(actions, '/Hello/a');
						assert.equal(content.foo, 'bar');
						done();
					}));
				});
				it('should retrieve the latest version prior to the transaction timestamp if one is stored', function(done) {
					driver.transaction({_ts: '02500', path:'/bank1/account/', get: ['me']}, util.protect(done, function(err, actions) {
							var content = actionsToContent(actions, '/bank1/account/me');
							assert.equal(actions[0].content.amount, 200); // Before the 03000 ts
							done();
					}));
				});
				it('should retrieve the earliest stored version if latest prior to ts is not stored', function(done) {
					driver.transaction({_ts: '01500', path:'/bank1/account/', get: ['me']}, util.protect(done, function(err, actions) {
							var content = actionsToContent(actions, '/bank1/account/me');
							assert.equal(actions[0].content.amount, 200); // We only save two versions
							done();
					}));
				});
				it('should not find the file if it was created past the transaction ts, as long as enough versions are stored', function(done) {
					util.seq([
						function(_) { driver.transaction({_ts: '02000', path: '/some/thing/new/', put:{foo: {bar: 'baz'}}}, _); },
						function(_) { driver.transaction({_ts: '01000', path: '/some/thing/new/', get: ['foo']}, _); },
						function(_) {
							done(new Error('File should not have been found'));
						}
					], function(err) {
						assert(err.fileNotFound, 'File should not have been found');
						done();
					})();
				});
			});
			describe('put', function() {
				it('should write a file so that "get" retrieves it', function(done) {
					util.seq([
						function(_) { driver.transaction({path: '/Hello/', put: {world: {x: 123}}}, _); },
						function(_) { driver.transaction({path: '/Hello/', get: ['world']}, _.to('actions')); },
						function(_) { 
							var content = actionsToContent(this.actions, '/Hello/world');
							assert.equal(content.x, 123);
							_();
						},
					], done)();
				});
				it('should assign a timestamp to a file if one is not provided', function(done) {
					var before = util.timeUid();
					util.seq([
						function(_) { setTimeout(_, 2); },
						function(_) { driver.transaction({path: '/Hello/', put: {file: {x: 444}}}, _); },
						function(_) { driver.transaction({path: '/Hello/', get: ['file']}, _.to('actions')); },
						function(_) { setTimeout(_, 2); },
						function(_) { 
							var after = util.timeUid();
							var content = actionsToContent(this.actions, '/Hello/file');
							assert(content._ts > before, '_ts > before');
							assert(content._ts < after, '_ts < after');
							_();
						},
					], done)();
				});
				it('should reflect the provided timestamp if one is given', function(done) {
					util.seq([
						function(_) { driver.transaction({path: '/Hello/', put: {someOtherFile: {foo: 'bar'}}, _ts: '0100'}, _); },
						function(_) { driver.transaction({path: '/Hello/', get: ['someOtherFile']}, _.to('actions')); },
						function(_) { 
							var content = actionsToContent(this.actions, '/Hello/someOtherFile');
							assert.equal(content._ts, '0100');
							_();
						},
					], done)();
				});
			});
			it('should allow for multiple get and put operations to be performed atomically', function(done) {
				driver.transaction({
					path: '/a/b/',
					get: ['c', 'd'],
					put: {c: {x:3}, d: {x:4}}
				}, util.protect(done, function(err, actions) {
					var contentMap = actionsToContentMap(actions);
					// The values received from the 'get' operation are from before the transaction.
					assert.equal(contentMap['/a/b/c'].x, 1);
					assert.equal(contentMap['/a/b/d'].x, 2);
					driver.transaction({
						path: '/a/b/',
						get: ['c', 'd']
					}, util.protect(done, function(err, actions) {
						var contentMap = actionsToContentMap(actions);
						assert.equal(contentMap['/a/b/c'].x, 3);
						assert.equal(contentMap['/a/b/d'].x, 4);
						// The new values have the same timestamp.
						assert.equal(contentMap['/a/b/c']._ts, contentMap['/a/b/d']._ts);
						done();
					}));
				}));
				function actionsToContentMap(results) {
					var contentMap = {}
					for(var i = 0; i < results.length; i++) {
						if(results[i].type == 'content') {
							contentMap[results[i].path] = results[i].content;
						}
					}
					return contentMap;
				}
			});
			it('should retrieve the value with the highest _ts value', function(done) {
				util.seq([
					function(_) {driver.transaction({path: '/some/path/to/', put:{doc: {foo: 'bar'}}, _ts: '01000'}, _); },
					function(_) {driver.transaction({path: '/some/path/to/', put:{doc: {foo: 'baz'}}, _ts: '03000'}, _); },
					function(_) {driver.transaction({path: '/some/path/to/', put:{doc: {foo: 'bat'}}, _ts: '02000'}, _); },
					function(_) {driver.transaction({path: '/some/path/to/', get:['doc']}, _.to('actions')); },
					function(_) {
						driver.get('/some/path/to/doc', util.protect(done, function(err, file) {
							assert.equal(file.foo, 'baz');
							_();
						}));
					}
				], done)();
			});
			describe('map', function() {
				before(function(done) {
					util.seq([
						function(_) {driver.transaction({path: '/a/b/', put: {c: {a:1}, d: {a:2}, e: {a:3}}}, _); },
						function(_) {driver.transaction({path: '/a/b/f/', put: {g: {a:4}}}, _); },
					], done)();					
				});
				it('should emit actions including the mapping for all files in the directory', function(done) {
					driver.transaction({path: '/a/b/', map: {foo: 'bar'}}, util.protect(done, function(err, actions) {
						var mappings = actionsToMappings(actions);
						assert(mappings['map:/a/b/c'], 'Valid mapping for /a/b/c');
						assert(mappings['map:/a/b/d'], 'Valid mapping for /a/b/d');
						assert(mappings['map:/a/b/e'], 'Valid mapping for /a/b/e');
						assert.equal(mappings['map:/a/b/c'].mapping.foo, 'bar');
						done();
					}));
					function actionsToMappings(actions) {
						var mappings = {};
						for(var i = 0; i < actions.length; i++) {
							var action = actions[i];
							mappings[action.type + ':' + action.path] = action;
						}
						return mappings;
					}
				});
				it('should emit actions so that when sending the "tramp" actions back, we get mappings for all files in the sub-tree', function(done) {
					driver.transaction({path: '/a/b/', map: {foo: 'bar'}}, util.protect(done, function(err, actions) {
						trampoline(driver, actions, util.protect(done, function(err, actions) {
							var mappings = actionsToMappings(actions);
							assert(mappings['map:/a/b/c'], 'Valid mapping for /a/b/c');
							assert(mappings['map:/a/b/d'], 'Valid mapping for /a/b/d');
							assert(mappings['map:/a/b/e'], 'Valid mapping for /a/b/e');
							assert(mappings['map:/a/b/f/g'], 'Valid mapping for /a/b/f/g');
							assert.equal(mappings['map:/a/b/f/g'].mapping.foo, 'bar');
							done();
						}));
					}));
				});
				function trampoline(driver, actions, callback) {
					for(var i = 0; i < actions.length; i++) {
						var action = actions[i];
						if(action.type == 'tramp') {
							actions.splice(i, 1);
							driver.trampoline(action, function(err, newActions) {
								if(err) return callback(err);
								actions = actions.concat(newActions);
								trampoline(driver, actions, callback);
							});
							return;
						}
					}
					// Found no trampoline actions
					callback(undefined, actions);
				}
				it('should work whether or not the directory already exists', function(done) {
					util.seq([
						function(_) { driver.transaction({path: '/Qwe/rty/', map: {foo: 'bar'}}, _); },
						function(_) { driver.transaction({path: '/Qwe/rty/', put: {uio: {baz: 'bat'}}}, _.to('actions2')); },
						function(_) {
							assert.equal(this.actions2.length, 1);
							assert.equal(this.actions2[0].type, 'map');
							assert.equal(this.actions2[0].mapping.foo, 'bar');
							assert.equal(this.actions2[0].path, '/Qwe/rty/uio');
							done();
						},
					], done)();
				});
				describe('with .put()', function() {
					var mappingTS = util.timeUid();
					before(function(done) {
						driver.transaction({path: '/a/b/', map: {map: 333, _ts: mappingTS}}, util.protect(done, function(err, actions) {
							trampoline(driver, actions, done);
						}));
					});
					after(function(done) {
						driver.transaction({path: '/a/b/', unmap: [mappingTS]}, util.protect(done, function(err, actions) {
							trampoline(driver, actions, done);
						}));
					});
					it('should cause subsequent puts emit the mapping for the new object', function(done) {
						driver.transaction({path: '/a/b/', put: {g: {a:7}}}, util.protect(done, function(err, actions) {
							for(var i = 0; i < actions.length; i++) {
								if(actions[i].type == 'map' && 
									actions[i].mapping.map == 333 && 
									actions[i].path == '/a/b/g') {
									return done();
								}
							}
							done(new Error('Could not find action relating to this mapping. Found: ' + JSON.stringify(actions)));
						}));
					});
					it('should cause puts that overrides an existing value provide mapping for the new value and unmapping for the old one', function(done) {
						util.seq([
							function(_) { driver.transaction({path: '/x?/', put:{y: {value: 'old'}}}, _); },
							function(_) { driver.transaction({path: '/x?/', map:{map: 1}}, _.to('actions')); },
							function(_) { trampoline(driver, this.actions, _); },
							function(_) { setTimeout(_, 2); },
							function(_) { driver.transaction({path: '/x?/', put:{y: {value: 'new'}}}, _.to('actions')); },
							function(_) {
								var mappings = actionsToMappings(this.actions);
								assert(mappings['map:/x?/y'], 'New value mapped');
								assert.equal(mappings['map:/x?/y'].content.value, 'new');
								assert(mappings['unmap:/x?/y'], 'Old value unmapped');
								assert.equal(mappings['unmap:/x?/y'].content.value, 'old');
								_();
							},
						], done)();
					});
				});
				describe('with .remove()', function() {
					var mappingTS = util.timeUid();
					before(function(done) {
						driver.transaction({path: '/a/b/', map: {map: 333, _ts: mappingTS}}, util.protect(done, function(err, actions) {
							trampoline(driver, actions, done);
						}));
					});
					after(function(done) {
						driver.transaction({path: '/a/b/', unmap: [mappingTS]}, util.protect(done, function(err, actions) {
							trampoline(driver, actions, done);
						}));
					});

					it('should emit unmapping of the removed content', function(done) {
						driver.transaction({path: '/a/b/', remove: ['c']}, util.protect(done, function(err, actions){
							assert(actions.length >= 1, 'there should be at least one unmap');
							for(var i = 0; i < actions.length; i++) {
								assert.equal(actions[i].type, 'unmap');
								assert.equal(actions[i].path, '/a/b/c');
							}
							done();
						}));
					});

				});
			});
			describe('unmap', function() {
				var mapping = {m:1, _ts: util.timeUid()};
				before(function(done) {
					util.seq([
						function(_) { driver.transaction({path: '/e/f!/', put: {g: {a:1}, h: {a:2}}}, _); },
						function(_) { driver.transaction({path: '/e/f!/i/', put: {j: {a:3}, k: {a:4}}}, _); },
						function(_) { driver.transaction({path: '/e/f!/', map: mapping}, _.to('actions')); },
						function(_) { trampoline(driver, this.actions, _); },
					], done)();
				})
				it('should remove the mapping with ts from path, and produce actions to undo its effect', function(done) {
					util.seq([
						function(_) { driver.transaction({path: '/e/f!/', unmap: [mapping._ts]}, _.to('actions')); },
						function(_) { trampoline(driver, this.actions, _.to('actions')); },
						function(_) { 
							var mappings = actionsToMappings(this.actions);
							assert(mappings['unmap:/e/f!/g'], 'unmap:/e/f!/g');
							assert(mappings['unmap:/e/f!/h'], 'unmap:/e/f!/h');
							assert(mappings['unmap:/e/f!/i/j'], 'unmap:/e/f!/i/j');
							assert(mappings['unmap:/e/f!/i/k'], 'unmap:/e/f!/i/k');
							_();
						},
					], done)();
				});
			});
			describe('remove', function() {
				var path;
				beforeEach(function(done) {
					var seed = Math.floor(Math.random() * 1000000) + '';
					path = '/seeded/' + seed + '/';
					util.seq([
						function(_) { driver.transaction({path: path, put: {delete: {foo: 'bar'}}, _ts: '01000'}, _); },
						function(_) { driver.transaction({path: path + 'foo/', put: {bar: {baz:'bat'}}, _ts: '033330'}, _); },
						function(_) { driver.transaction({path: path + 'foo/', map: {m:7}, _ts: '033333'}, _); },
					], done)();
					
				});
				it('should remove a file of the given path', function(done) {
					util.seq([
						function(_) { driver.transaction({path: path, remove:['delete']}, _); },
						function(_) { driver.transaction({path: path, get:['delete']}, util.shouldFail(done, 'File should not exist', function(err) {
							assert(err.fileNotFound, 'File should not exist');
							_();
						})); },
					], done)();
				});
				it('should remove a file only if the removal timestamp is greater than the latest', function(done) {
					util.seq([
						function(_) { driver.transaction({path: path, remove: ['delete'], _ts: '00900'}, _); },
						function(_) { driver.transaction({path: path, get:['delete']}, _.to('actions')); },
						function(_) { assert.equal(actionsToContent(this.actions, path + 'delete').foo, 'bar'); _(); },
					], done)();
				});
				it('should provide unmapping for them for each mapping that exists', function(done) {
					driver.transaction({path: path + 'foo/', remove: ['bar']}, util.protect(done, function(err, actions) {
						assert(actions.length >= 1, 'there should be at least one result');
						var found = false;
						for(var i = 0; i < actions.length; i++) {
							assert.equal(actions[i].type, 'unmap');
							assert.equal(actions[i].path, path + 'foo/bar');
							if(actions[i].mapping.m == 7) {
								found = true;
							}
							assert.equal(actions[i].content.baz, 'bat');
						}
						assert(found, 'Should find the mapping');
						done();
					}));
				});
			});
			describe('getIfExists', function() {
				it('should emit content actions only for the files that exist in the list', function(done) {
					driver.transaction({path: '/a/b/', getIfExists: ['c', 'doesNotExist']}, util.protect(done, function(err, actions) {
						assert.equal(actions.length, 1);
						assert.equal(actions[0].type, 'content');
						assert.equal(actions[0].path, '/a/b/c');
						assert.equal(actions[0].content.x, 1);
						done();
					}));
				});
			});
			describe('getDir', function() {
				it('should emit dir actions for all files in the directory', function(done) {
					driver.transaction({path: '/a/b/', getDir: {}}, util.protect(done, function(err, actions) {
						var dir = {};
						for(var i = 0; i < actions.length; i++) {
							if(actions[i].type == 'dir') {
								dir[actions[i].path] = 1;
							}
						}
						assert(dir['/a/b/c'], '/a/b/c should exist');
						assert(dir['/a/b/d'], '/a/b/d should exist');
						done();
					}));
				});
				it('should behave properly when used in conjunction with get', function(done) {
					driver.transaction({path: '/a/b/', getDir: {}, get: ['d']}, util.protect(done, function(err, actions) {
						var dir = {};
						for(var i = 0; i < actions.length; i++) {
							if(actions[i].type == 'dir') {
								dir[actions[i].path] = 1;
							}
						}
						assert(dir['/a/b/c'], '/a/b/c should exist');
						assert(dir['/a/b/d'], '/a/b/d should exist');
						done();
					}));
				});
				it('should emit content entries with file contents when using the expandFiles option', function(done) {
					driver.transaction({path: '/a/b/', getDir: {expandFiles:1}}, util.protect(done, function(err, actions) {
						var dir = {};
						for(var i = 0; i < actions.length; i++) {
							if(actions[i].type == 'content') {
								dir[actions[i].path] = actions[i].content;
							}
						}
						assert.equal(dir['/a/b/c'].x, 1);
						assert.equal(dir['/a/b/d'].x, 2);
						done();
					}));
				});
			});
		});
	});
}

exports.describeStorageDriver = describeStorageDriver;
