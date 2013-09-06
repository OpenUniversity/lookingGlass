var MatchMaker = require('../matchMaker.js').MatchMaker;
var MFS = require('../mongofs.js').MFS;
var util = require('../util.js');
var assert = require('assert');

describe('MatchMaker', function() {
    var storage;
    var coll;
    var mm;
    before(function(done) {
        require('mongodb').MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, db) {
            if(err) return done(err);
            coll = db.collection('test');
            storage = new MFS(coll, {maxVers: 2});
            mm = new MatchMaker(storage);
	    done();
        });
    });
    beforeEach(function(done) {
        coll.remove({}, done);
    });
    it('should proxy transactions to the underlying storage', function(done) {
	util.seq([
	    function(_) { mm.transaction({path: '/a/b/', put:{'c.json':{x:1}}}, _); },
	    function(_) { storage.transaction({path: '/a/b/', get:['*']}, _.to('result')); },
	    function(_) {
		assert(this.result['c.json'], 'c.json should exist in storage');
		assert.equal(this.result['c.json'].x, 1);
		_();
	    },
	], done)();
    });
    describe('put', function() {
	it('should add a _map entry to the result, containing a list of mappings', function(done) {
	    util.seq([
		// Adding a .map file to a directory, directly in storage.
		function(_) { storage.transaction({path: '/a/b/', put: {'foo.map': {m:1}}, _ts: '0100'}, _); },
		// Adding a .json file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'bar.json': {x:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert(this.result._map, 'A _map entry should be added to the result');
		    assert(Array.isArray(this.result._map), 'it should be an array');
		    assert.equal(this.result._map.length, 1, 'it should have one entry');
		    assert.equal(this.result._map[0].path, '/a/b/bar.json', 'it should indicate the path of the .json file');
		    assert.deepEqual(this.result._map[0].content, {x:1, _ts: '0101'}, 'it should have the content of the .json file');
		    assert.deepEqual(this.result._map[0].map, {m:1, _ts: '0100'}, 'and the .map file');
		    _();
		},
	    ], done)();
	});
	it('should add a mapping entry for each .map file in the directory when adding a .json file', function(done) {
	    util.seq([
		// Adding three .map file to a directory, directly in storage.
		function(_) { storage.transaction({path: '/a/b/', put: {'1.map': {m:1}, '2.map': {m:2}, '3.map': {m:3}}, _ts: '0100'}, _); },
		// Adding a .json file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'x.json': {x:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._map, [
			{path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:1, _ts: '0100'}},
			{path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:2, _ts: '0100'}},
			{path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:3, _ts: '0100'}},
		    ]);
		    _();
		},
	    ], done)();
	});
	it('should add a mapping entry for each .json file in the directory when adding a .map file', function(done) {
	    util.seq([
		// Adding three .json files directly in the storage
		function(_) { storage.transaction({path: '/a/b/', put: {'1.json': {x:1}, '2.json': {x:2}, '3.json': {x:3}}, _ts: '0100'}, _); },
		// Adding a .map file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'m..map': {m:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._map, [
			{path: '/a/b/1.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0101'}},
			{path: '/a/b/2.json', content: {x:2, _ts: '0100'}, map: {m:1, _ts: '0101'}},
			{path: '/a/b/3.json', content: {x:3, _ts: '0100'}, map: {m:1, _ts: '0101'}},
		    ]);
		    _();
		},
	    ], done)();
	});
	it('should increment a counter (dir_exists) in the directory, so that it is only zero if the directory is new', function(done) {
	    util.seq([
		// If we add an element to a new directory
		function(_) { mm.transaction({path: '/new/dir/', put:{a:{}}}, _); },
		// and query its dir_exists accumulator,
		function(_) { mm.transaction({path: '/new/dir/', accum: {dir_exists:0}}, _.to('result')); },
		// we should get a value of 1, because there was one transaction on it.
		function(_) { assert.equal(this.result.dir_exists, 1); _(); },
		// If we query the accumulator on a directory that does not exist,
		function(_) { mm.transaction({path: '/new/dir2/', accum: {dir_exists:0}}, _.to('result')); },
		// we get 0
		function(_) { assert.equal(this.result.dir_exists, 0); _(); },
	    ], done)();
	});
	it('should create a transaction entry in the _tramp field of the result to add a .d entry in the parent directory if the directory is new', function(done) {
	    util.seq([
		function(_) { mm.transaction({path: '/new/dir/', put: {a:{}}}, _.to('result')); },
		function(_) { assert.deepEqual(this.result._tramp, [
		    {path: '/new/', put: {'dir.d': {}}}
		]); _(); },
		
	    ], done)();
	});
	it('should create a _tramp entry for each subdirectory, to propagate .map files up', function(done) {
	    util.seq([
		function(_) { mm.transaction({path: '/a/b/c/', put: {g:{}, h:{}}}, _.to('c')); },
		function(_) { trampoline(this.c._tramp, _); },
		function(_) { mm.transaction({path: '/a/b/d/', put: {g:{}, h:{}}}, _.to('d')); },
		function(_) { trampoline(this.d._tramp, _); },
		function(_) { mm.transaction({path: '/a/b/', put: {'foo.map':{m:1}}, _ts: '0100'}, _.to('result')); },
		function(_) { assert.deepEqual(this.result._tramp, [
		    {path: '/a/b/c/', put: {'foo.map': {m:1, _ts:'0100'}}, _ts: '0100'},
		    {path: '/a/b/d/', put: {'foo.map': {m:1, _ts:'0100'}}, _ts: '0100'},
		]); _(); },
		
	    ], done)();
	    function trampoline(input, callback) {
		if(!input || !input.length) {
		    return callback();
		}
		mm.transaction(input[0], util.protect(callback, function(err, result) {
		    var next = input.slice(1);
		    if(result._tramp) next = next.concat(result._tramp);
		    trampoline(next, callback);
		}));
	    }
	});
    });
});