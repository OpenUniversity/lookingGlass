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

var emptyMapping = {
    map: function(obj, callback) {
        callback(undefined, []);
    }
};

describe('Dispatcher', function() {
    var storage;
    var tracker;
    var storageColl;
    var trackerColl;
    var disp;
    var driverContainer = {};
    var MapServer = require('../mapServer.js').MapServer;
    var server = new MapServer(12345, {
        '/mirror': require('../mirrorMapper.js'),
        '/javascript': require('../jsMapper.js'),
        _default: emptyMapping,
    });
    var mappers = {
        _default: require('../httpMapper.js'),
        mirror: require('../mirrorMapper.js'),
        javascript: require('../jsMapper.js'),
    };
    before(function(done) {
        util.seq([
            function(_) { require("mongodb").MongoClient.connect('mongodb://127.0.0.1:27017/test', _.to('db')); },
            function(_) {
                storageColl = this.db.collection('storage');
                trackerColl = this.db.collection('tracker');
                storage = new MFS(storageColl, {maxVers: 2});
                tracker = new MFS(trackerColl, {maxVers: 2});
                disp = new Dispatcher(storage, tracker, scheduler, mappers);
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
                    var dir = {};
                    var count = 0;
                    for(var i = 0; i < this.dir.length; i++) {
                        if(this.dir[i].type != 'content') continue;
                        var content = this.dir[i].content;
                        if(typeof(content) != 'object') continue;
                        count++;
                        assert.equal(content.type, 'map');
                        assert.equal(content.mapping.m, 1);
                        dir[content.path] = content.content;
                    }
                    assert.equal(count, 2);
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
                function(_) { this.tracking = disp.transaction({path: '/a/b/', map: {m:1}}, _); },
                function(_) { disp.wait(this.tracking, _); },
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
    describe('.wait(ts, callback(err))', function() {
        beforeEach(function(done) {
            util.seq([
                function(_) { disp.transaction({_ts: '01000', path:'/a/b/', put:{c:{a:1}, d:{a:2}}}, _); },
                function(_) { disp.transaction({_ts: '01001', path:'/a/b/e/', put:{f:{a:3}, g:{a:4}}}, _); },
                function(_) { server.start(); _(); },
                function(_) { disp.start(); setTimeout(_, 30); }, // Allow the server to start
            ], done)();
        });
        afterEach(function() {
            disp.stop();
            server.stop(function(){});
        });
        it('should trigger the callback after all work related to this ts has been complete', function(done) {
            util.seq([
                function(_) { this.trackMap = disp.transaction({
                    _ts: '01002',
                    path:'/a/b/', 
                    map:{_mapper: 'http://localhost:12345/mirror', origPath: '/a/b/', newPath: '/P/Q/'},
                }, _); },
                function(_) { disp.wait(this.trackMap, _); }, // Let the mapping propagate
                function(_) { this.trackPut = disp.transaction({_ts: '01003', path:'/a/b/h/', put:{i:{a:5}}}, _); },
                function(_) { disp.wait(this.trackPut, _); }, // Let the new value get mapped
                function(_) { disp.transaction({path: '/P/Q/h/', get:['i']}, _.to('i')); },
                function(_) {
                    assert.equal(this.i.length, 1);
                    assert.equal(this.i[0].content.a, 5);
                    _();
                },
            ], done)();
        });
    });
    describe('mapping', function() {
        beforeEach(function(done) {
            util.seq([
                function(_) { disp.transaction({_ts: '01000', path:'/a/b/', put:{c:{a:1}, d:{a:2}}}, _); },
                function(_) { disp.transaction({_ts: '01001', path:'/a/b/e/', put:{f:{a:3}, g:{a:4}}}, _); },
                function(_) { server.start(); _(); },
                function(_) { disp.start(); setTimeout(_, 30); }, // Allow the mapper to start
            ], done)();
        });
        afterEach(function() {
            disp.stop();
            server.stop(function() {});
        });
        it('should handle map operations with _mapping fields containing HTTP URLs by redirecting them to RESTful mappers', function(done) {
            util.seq([
                function(_) { this.tracker = disp.transaction({
                    path:'/a/b/', 
                    map:{_mapper: 'http://localhost:12345/mirror', origPath: '/a/b/', newPath: '/P/Q/'},
                }, _); },
                function(_) { disp.wait(this.tracker, _); }, // Let the mapping propagate
                function(_) { disp.transaction({path: '/P/Q/', get:['c']}, _.to('c')); },
                function(_) { disp.transaction({path: '/P/Q/e/', get:['g']}, _.to('g')); },
                function(_) {
                    assert.equal(this.c.length, 1);
                    assert.equal(this.c[0].content.a, 1);
                    assert.equal(this.g.length, 1);
                    assert.equal(this.g[0].content.a, 4);
                    _();
                },
            ], done)();
        });
        it('should handle map operations with _mapping="mirror" by mirrorring data', function(done) {
            util.seq([
                function(_) { this.tracker = disp.transaction({
                    path:'/a/b/', 
                    map:{_mapper: 'mirror', origPath: '/a/b/', newPath: '/P/Q/'},
                }, _); },
                function(_) { disp.wait(this.tracker, _); }, // Let the mapping propagate
                function(_) { disp.transaction({path: '/P/Q/', get:['c']}, _.to('c')); },
                function(_) { disp.transaction({path: '/P/Q/e/', get:['g']}, _.to('g')); },
                function(_) {
                    assert.equal(this.c.length, 1);
                    assert.equal(this.c[0].content.a, 1);
                    assert.equal(this.g.length, 1);
                    assert.equal(this.g[0].content.a, 4);
                    _();
                },
            ], done)();
        });
        it('should handle unmap operations by removing mirrored data', function(done) {
            util.seq([
                function(_) { this.tracker = disp.transaction({
                    path:'/a/b/', 
                    map:{_mapper: 'mirror', origPath: '/a/b/', newPath: '/P/Q/'},
                }, _); },
                function(_) { disp.wait(this.tracker, _); }, // Let the mapping propagate
                function(_) { disp.transaction({path: '/P/Q/', get:['c']}, _.to('c')); },
                function(_) { disp.transaction({path: '/P/Q/e/', get:['g']}, _.to('g')); },
                function(_) {
                    assert.equal(this.c.length, 1);
                    assert.equal(this.c[0].content.a, 1);
                    assert.equal(this.g.length, 1);
                    assert.equal(this.g[0].content.a, 4);
                    _();
                },
                function(_) { this.track = disp.transaction({path: '/a/b/', remove:['c']}, _.to('c')); },
                function(_) { disp.wait(this.track, _); },
                function(_) { disp.transaction({path: '/P/Q/', getIfExists:['c']}, _.to('c')); },
                function(_) {
                    assert.equal(this.c.length, 0); // 'c' does not exist anymore
                    _();
                },
            ], done)();
        });
        it('should support the javascript mapper', function(done) {
            util.seq([
                function(_) { this.mapTracker = disp.transaction({
                    path:'/text/',
                    map:{
                        _mapper: 'http://localhost:12345/javascript',
                        func: (function(path, content) {
                            if(content[this.field]) {
                                var text = content[this.field];
                                var hash = encodeURIComponent(path);
                                var words = text.split(/[ \t]+/);
                                for(var i = 0; i < words.length; i++) {
                                    emit('/searchIdx/' + words[i] + '/' + hash, {_link: path});
                                }
                            }
                        }).toString(),
                        field: 'desc',
                    },
                }, _); },
                function(_) { this.putTracker = disp.transaction({path: '/text/', put:{
                    a: {desc: 'the first letter in the alphabet'},
                    b: {desc: 'the second letter in the alphabet'},
                    z: {desc: 'the last letter in the alphabet'},
                }}, _); },
                function(_) { disp.wait(this.mapTracker, _); },
                function(_) { disp.wait(this.putTracker, _); },
                function(_) { disp.transaction({path:'/searchIdx/first/', getDir:{expandFiles:1}}, _.to('first')); },
                function(_) {
                    for(var i = 0; i < this.first.length; i++) {
                        if(this.first[i].type == 'content') {
                            assert.equal(this.first[0].content._link, '/text/a');
                        }
                    }
                    _();
                },
                function(_) { disp.transaction({path:'/searchIdx/alphabet/', getDir:{}}, _.to('alphabet')); },
                function(_) {
                    assert.equal(this.alphabet.length, 3); // All three files
                    _();
                },
                function(_) { this.removeTracker = disp.transaction({path: '/text/', remove: ['a']}, _); },
                function(_) { disp.wait(this.removeTracker, _); },
                function(_) { disp.transaction({path:'/searchIdx/first/', getDir:{}}, _.to('first')); },
                function(_) { disp.transaction({path:'/searchIdx/alphabet/', getDir:{}}, _.to('alphabet')); },
                function(_) {
                    assert.equal(this.first.length, 0); // "a" has been deleted
                    assert.equal(this.alphabet.length, 2);
                    _();
                },
            ], done)();
        });
	it('should treat mapping results for which the path is a directory, as new mappings', function(done) {
	    // We build a tweeter-like data model, with /follow/<user>/<followee> files indicating
	    // following relationships, /tweet/<user>/* files containing individual tweets, and
	    // timelines being mapped to /timeline/<user>/*

	    var mapFunction = function(path, content) {
		// Put followee tweets in the follower's timeline
		var mapTweet = function(path, content) {
		    var splitPath = path.split('/');
		    var author = splitPath[2];
		    emit('/timeline/' + this.follower + '/' + content._ts, 
			 {text: content.text, from: author});
		};
		// Create a mapping for each following relationship
		var splitPath = path.split('/');
		var follower = splitPath[2];
		var followee = splitPath[3];
		emit('/tweet/' + followee + '/', {
		    _mapper: 'javascript',
		    func: mapTweet.toString(),
		    follower: follower,
		});
	    };
	    util.seq([
		function(_) { this.w1 = disp.transaction({path: '/follow/', map: {
		    _mapper: 'javascript',
		    func: mapFunction.toString(),
		}}, _); },
		function(_) { this.w2 = disp.transaction({path: '/tweet/alice/', put: {a: {text: 'Hi, I\'m alice'}}}, _); },
		function(_) { this.w3 = disp.transaction({path: '/tweet/bob/', put: {b: {text: 'Hi, I\'m bob'}}}, _); },
		function(_) { this.w4 = disp.transaction({path: '/follow/alice/', put: {bob: {}}}, _); },
		function(_) { disp.wait(this.w1, _); },
		function(_) { disp.wait(this.w2, _); },
		function(_) { disp.wait(this.w3, _); },
		function(_) { disp.wait(this.w4, _); },
		function(_) { disp.transaction({path: '/timeline/alice/', getDir:{expandFiles:1}}, _.to('dir')); },
		function(_) {
		    var found = false;
		    for(var i = 0; i < this.dir.length; i++) {
			if(this.dir[i].type != 'content') continue;
			assert.equal(this.dir[i].content.text, 'Hi, I\'m bob');
			assert.equal(this.dir[i].content.from, 'bob');
			found = true;
		    }
		    assert(found, 'should find an entry in alice\'s timeline');
		    _();
		},
	    ], done)();
	});
    });
});

