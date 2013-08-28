var MFS = require('../mongofs.js').MFS;
var util = require('../util.js');
var Dispatcher = require('../dispatcher.js').Dispatcher;
var assert = require('assert');

function DummyScheduler(path) {
	this.getPath = function() {
		return path;
	};
}
var thePath = '/some/path/';
var scheduler = new DummyScheduler(thePath);

describe('Dispatcher', function() {
	var storage;
	var tracker;
	var storageColl;
	var trackerColl;
	var disp;
	var driverContainer = {};
	before(function(done) {
		util.seq([
			function(_) { require("mongodb").MongoClient.connect('mongodb://127.0.0.1:27017/test', _.to('db')); },
			function(_) {
				storageColl = this.db.collection('storage');
				trackerColl = this.db.collection('tracker');
				storage = new MFS(storageColl, {maxVers: 2});
				tracker = new MFS(trackerColl, {maxVers: 2});
				disp = new Dispatcher(storage, tracker, scheduler);
				_();
			},
			function(_) { storageColl.remove({}, _); },
			function(_) { trackerColl.remove({}, _); },
		], done)();
	});
	beforeEach(function(done) {
		util.seq([
			function(_) { storageColl.remove({}, _); },
			function(_) { trackerColl.remove({}, _); },
		], done)();
	});
	describe('.transaction(trans, callback(err, actions))', function() {
		it('should handle transactions that do not require futher action by forwaring them to storage', function(done) {
			util.seq([
				function(_) { disp.transaction({_ts: '01000', path:'/a/b/', put:{c:{a:1}, d:{a:2}}}, _.to('put1')); },
				function(_) { assert.deepEqual(this.put1, []); _();},
				function(_) { disp.transaction({_ts: '01001', path:'/a/b/e/', put:{f:{a:3}, g:{a:4}}}, _.to('put2')); },
				function(_) { assert.deepEqual(this.put2, []); _();},
				function(_) { storage.transaction({path:'/a/b/', get:['c', 'd']}, _.to('actions')); },
				function(_) { assert.deepEqual(this.actions, [
					{type: 'content', path: '/a/b/c', content: {a:1, _ts: '01000'}},
					{type: 'content', path: '/a/b/d', content: {a:2, _ts: '01000'}},
				]); _();},
				function(_) { storage.transaction({path:'/a/b/e/', get:['f', 'g']}, _.to('actions')); },
				function(_) { assert.deepEqual(this.actions, [
					{type: 'content', path: '/a/b/e/f', content: {a:3, _ts: '01001'}},
					{type: 'content', path: '/a/b/e/g', content: {a:4, _ts: '01001'}},
				]); _();},
			], done)();
		});
		it('should write actions that require further treatment to the tracker, in a path provided by the scheduler', function(done) {
			util.seq([
				function(_) { disp.transaction({_ts: '01000', path:'/a/b/', put:{c:{a:1}, d:{a:2}}}, _); },
				function(_) { disp.transaction({_ts: '01001', path:'/a/b/e/', put:{f:{a:3}, g:{a:4}}}, _); },
				function(_) { disp.transaction({path: '/a/b/', map: {m:1}}, _.to('mapActions')); },
				function(_) { assert.deepEqual(this.mapActions, []); _(); },
				function(_) { tracker.transaction({
					path: scheduler.getPath(), // We use a scheduler that always returns the same path
					getDir:{expandFiles:1}}, 
					_.to('actions')); },
				function(_) {
					var mappings = {};
					for(var i = 0; i < this.actions.length; i++) {
						if(this.actions[i].type != 'content') continue;
						var content = this.actions[i].content;
						if(content.type == 'map') {
							assert.equal(content.mapping.m, 1);
						} else {
							assert.equal(content.map.m, 1);
						}
						mappings[content.type + ':' + content.path] = content;
					}
					assert(mappings['tramp:/a/b/e/'], 'tramp:/a/b/e/');
					assert(mappings['map:/a/b/c'], 'map:/a/b/c');
					assert(mappings['map:/a/b/d'], 'map:/a/b/d');
					_();
				},
			], done)();
		});
	});
	describe('.tick(path, callback(err, job))', function() {
		beforeEach(function(done) {
			util.seq([
				function(_) { disp.transaction({_ts: '01000', path:'/a/b/', put:{c:{a:1}, d:{a:2}}}, _); },
				function(_) { disp.transaction({_ts: '01001', path:'/a/b/e/', put:{f:{a:3}, g:{a:4}}}, _); },
				function(_) { disp.transaction({path: '/a/b/', map: {m:1}}, _); },
			], done)();
		});
		it('should select a pending task from the tracker, mark it in progress and emit it in the callback', function(done) {
			util.seq([
				function(_) { disp.tick(thePath, _.to('job')); },
				function(_) { tracker.transaction({path: thePath, getDir: {}}, _.to('dir')); },
				function(_) {
					var inProgress = 0;
					for(var i = 0; i < this.dir.length; i++) {
						var entry = this.dir[i];
						assert.equal(entry.type, 'dir');
						if(entry.path == thePath + '^' + this.job.name) {
							inProgress++;
						}
					}
					assert.equal(inProgress, 1);
					_();
				},
			], done)();
		});
		it('should select a different job on each call', function(done) {
			var jobs = {};
			var test = function(done) {
				util.seq([
					function(_) { disp.tick(thePath, _.to('job')); },
					function(_) {
						assert(this.job, 'A job must be found');
						assert(!jobs[this.job.name], 'Each job must be unique');
						jobs[this.job.name] = 1;
						_();
					},
				], done)();
			}
			var c = util.parallel(3, done);
			test(c);
			test(c);
			test(c);
		});
		it('should emit undefined as a job if no job is found', function(done) {
			disp.tick('/wrong/path/', util.protect(done, function(err, job) {
				assert(!job, 'No job should be emitted');
				done();
			}));
		});
		it('should take the path from the scheduler if not provided', function(done) {
			disp.tick(undefined, util.protect(done, function(err, job) {
				assert(job, 'Found job');
				done();
			}));
		});
	});
	describe('tock(job, callback(err))', function() {
		beforeEach(function(done) {
			util.seq([
				function(_) { disp.transaction({_ts: '01001', path:'/a/b/e/', put:{f:{a:3}, g:{a:4}}}, _); },
				function(_) { disp.transaction({path: '/a/b/', map: {m:1}}, _); },
			], done)();
		});
		it('should perform the given job', function(done) {
			util.seq([
				// Initially we should have a tramp action for propagating the mapping to /a/b/e/
				// waiting to be picked up.
				function(_) { disp.tick(undefined, _.to('job')); },
				function(_) { disp.tock(this.job, _); },
				// Now the action should be removed, and instead we should have mapping actions for
				// /a/b/e/f and /a/b/e/g
				function(_) { tracker.transaction({path: thePath, getDir: {expandFiles:1}}, _.to('dir')); },
				function(_) {
					assert.equal(this.dir.length, 4); // Two 'dir', two 'content'
					var dir = {};
					for(var i = 0; i < 4; i++) {
						if(this.dir[i].type != 'content') continue;
						var content = this.dir[i].content;
						assert.equal(content.type, 'map');
						assert.equal(content.mapping.m, 1);
						dir[content.path] = content.value;
					}
					assert.deepEqual(dir['/a/b/e/f'], {a:3, _ts:'01001'});
					assert.deepEqual(dir['/a/b/e/g'], {a:4, _ts:'01001'});
					_();
				},
			], done)();
		});
	});
	describe('.start() and .stop()', function() {
		beforeEach(function(done) {
			util.seq([
				function(_) { disp.transaction({_ts: '01001', path:'/a/b/e/', put:{f:{a:3}, g:{a:4}}}, _); },
			], done)();
		});
		it('should cause the dispatcher to automatically take tasks and execute them', function(done) {
			disp.start();
			util.seq([
				function(_) { disp.transaction({path: '/a/b/', map: {m:1}}, _); },
				function(_) { setTimeout(_, 100); }, // should be plenty of time to propagate the mapping
				function(_) { storage.transaction({path:'/a/b/e/', put:{h:{a:5}}}, _.to('actions')); },
				function(_) {
					assert.equal(this.actions.length, 1);
					assert.equal(this.actions[0].type, 'map');
					assert.equal(this.actions[0].path, '/a/b/e/h');
					assert.equal(this.actions[0].content.a, 5);
					assert.equal(this.actions[0].mapping.m, 1);
					disp.stop();
					_();
				},
			], done)();
			
		});
	});
});

