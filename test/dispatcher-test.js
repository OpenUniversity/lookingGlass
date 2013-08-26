var MFS = require('../mongofs.js').MFS;
var util = require('../util.js');
var Dispatcher = require('../dispatcher.js').Dispatcher;
var assert = require('assert');

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
				disp = new Dispatcher(storage, tracker);
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
		it('should write actions that require further treatment to the tracker', function(done) {
			util.seq([
				function(_) { disp.transaction({_ts: '01000', path:'/a/b/', put:{c:{a:1}, d:{a:2}}}, _); },
				function(_) { disp.transaction({_ts: '01001', path:'/a/b/e/', put:{f:{a:3}, g:{a:4}}}, _); },
				function(_) { disp.transaction({path: '/a/b/', map: {m:1}}, _.to('mapActions')); },
				function(_) { tracker.transaction({path: '/jobs/1/', getDir:{expandFiles:1}}, _.to('actions')); },
				function(_) {
					assert.deepEqual(this.mapActions, []);
					var mappings = {};
					for(var i = 0; i < this.actions.length; i++) {
						if(this.actions[i].type != 'content') continue;
						var content = this.actions[i].content;
						assert.equal(content.mapping.m, 1);
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
	describe('.tick(callback(err, job))', function() {
		beforeEach(function(done) {
			util.seq([
				function(_) { disp.transaction({_ts: '01000', path:'/a/b/', put:{c:{a:1}, d:{a:2}}}, _); },
				function(_) { disp.transaction({_ts: '01001', path:'/a/b/e/', put:{f:{a:3}, g:{a:4}}}, _); },
				function(_) { disp.transaction({path: '/a/b/', map: {m:1}}, _); },
			], done)();
		});
		it('should select a pending task from the tracker, mark it in progress and emit it in the callback', function(done) {
			util.seq([
				function(_) { disp.tick(_.to('job')); },
				function(_) { tracker.transaction({path: '/jobs/1/', getDir: {}}, _.to('dir')); },
				function(_) {
					var inProgress = 0;
					for(var i = 0; i < this.dir.length; i++) {
						var entry = this.dir[i];
						assert.equal(entry.type, 'dir');
						if(entry.path == '/jobs/1/^' + this.job.name) {
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
					function(_) { disp.tick(_.to('job')); },
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
	});
});

