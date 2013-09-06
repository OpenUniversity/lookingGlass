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

    function trampoline(input, callback) {
	if(!input || !input.length) {
	    return callback();
	}
	assert.equal(input[0].type, 'transaction');
	mm.transaction(input[0], util.protect(callback, function(err, result) {
	    var next = input.slice(1);
	    if(result._tramp) next = next.concat(result._tasks);
	    trampoline(next, callback);
	}));
    }

    describe('put', function() {
	it('should add a _tasks entry to the result, containing a list of mappings', function(done) {
	    util.seq([
		// Adding a .map file to a directory.
		function(_) { mm.transaction({path: '/a/b/', put: {'foo.map': {m:1}}, _ts: '0100'}, _); },
		// Adding a .json file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'bar.json': {x:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'map',                  // A mapping
			 path: '/a/b/bar.json',        // Path to the .json file
			 map: {m:1, _ts: '0100'},      // The content of the .map file
			 content: {x:1, _ts: '0101'},  // The content of the .json file
			 _ts: '0101X',                 // The timestamp of the transaction triggerring the mapping   
			                               // with an X suffix, to make it just one bit later than the
			                               // unmapping transactions
			}
		    ]);
		    _();
		},
	    ], done)();
	});
	it('should add a mapping entry for each .map file in the directory when adding a .json file', function(done) {
	    util.seq([
		// Adding three .map file to a directory.
		function(_) { mm.transaction({path: '/a/b/', put: {'1.map': {m:1}, '2.map': {m:2}, '3.map': {m:3}}, _ts: '0100'}, _); },
		// Adding a .json file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'x.json': {x:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'map', path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:1, _ts: '0100'}, _ts: '0101X'},
			{type: 'map', path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:2, _ts: '0100'}, _ts: '0101X'},
			{type: 'map', path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:3, _ts: '0100'}, _ts: '0101X'},
		    ]);
		    _();
		},
	    ], done)();
	});
	it('should add a mapping entry for each .json file in the directory when adding a .map file', function(done) {
	    util.seq([
		// Adding three .json files
		function(_) { mm.transaction({path: '/a/b/', put: {'1.json': {x:1}, '2.json': {x:2}, '3.json': {x:3}}, _ts: '0100'}, _); },
		// Adding a .map file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'m..map': {m:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'map', path: '/a/b/1.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0101'}, _ts: '0101X'},
			{type: 'map', path: '/a/b/2.json', content: {x:2, _ts: '0100'}, map: {m:1, _ts: '0101'}, _ts: '0101X'},
			{type: 'map', path: '/a/b/3.json', content: {x:3, _ts: '0100'}, map: {m:1, _ts: '0101'}, _ts: '0101X'},
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
	it('should create a transaction entry in the _tasks field of the result to add a .d entry in the parent directory if the directory is new', function(done) {
	    util.seq([
		function(_) { mm.transaction({path: '/new/dir/', put: {a:{}}}, _.to('result')); },
		function(_) { assert.deepEqual(this.result._tasks, [
		    {type: 'transaction',   // Create a transaction
		     path: '/new/',         // On the parent directory
		     put: {'dir.d': {}}}    // To add a .d placeholder to indicate this directory (named dir)
		]); _(); },
		
	    ], done)();
	});
	it('should create a task for each subdirectory, to propagate .map files up', function(done) {
	    util.seq([
		function(_) { mm.transaction({path: '/a/b/c/', put: {g:{}, h:{}}}, _.to('c')); },
		function(_) { trampoline(this.c._tasks, _); },
		function(_) { mm.transaction({path: '/a/b/d/', put: {g:{}, h:{}}}, _.to('d')); },
		function(_) { trampoline(this.d._tasks, _); },
		function(_) { mm.transaction({path: '/a/b/', put: {'foo.map':{m:1}}, _ts: '0100'}, _.to('result')); },
		function(_) { assert.deepEqual(this.result._tasks, [
		    {type: 'transaction', path: '/a/b/c/', put: {'foo.map': {m:1, _ts:'0100'}}, _ts: '0100'},
		    {type: 'transaction', path: '/a/b/d/', put: {'foo.map': {m:1, _ts:'0100'}}, _ts: '0100'},
		]); _(); },
		
	    ], done)();
	    function trampoline(input, callback) {
		if(!input || !input.length) {
		    return callback();
		}
		assert.equal(input[0].type, 'transaction');
		mm.transaction(input[0], util.protect(callback, function(err, result) {
		    var next = input.slice(1);
		    if(result._tramp) next = next.concat(result._tasks);
		    trampoline(next, callback);
		}));
	    }
	});
	it('should create an unmap task for the old content of a file when modifying an existing .json file', function(done) {
	    util.seq([
		// Create the initial content and two .map files
		function(_) { mm.transaction({path:'/a/b/', put:{'a.json': {x:1}, 'b.map': {m:1}, 'c.map': {m:2}}, _ts: '0100'}, _); },
		// Modify the .json file
		function(_) { mm.transaction({path: '/a/b/', put:{'a.json': {x:2}}, _ts: '0200'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			// Unmap old content (b.map)
			{type: 'unmap', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0100'}, _ts: '0200'},
			// Map new content (b.map)
			{type: 'map', path: '/a/b/a.json', content: {x:2, _ts: '0200'}, map: {m:1, _ts: '0100'}, _ts: '0200X'},
			// c.map
			{type: 'unmap', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:2, _ts: '0100'}, _ts: '0200'},
			{type: 'map', path: '/a/b/a.json', content: {x:2, _ts: '0200'}, map: {m:2, _ts: '0100'}, _ts: '0200X'},
		    ]);
		    _();
		},
	    ], done)();
	});
	it('should create an unmap task for the old content of a file when modifying an existing .map file', function(done) {
	    util.seq([
		// Create the initial content and .map file
		function(_) { mm.transaction({path:'/a/b/', put:{'a.json': {x:1}, 'b.json': {x:2}, 'c.map': {m:1}}, _ts: '0100'}, _); },
		// Modify the .map file
		function(_) { mm.transaction({path: '/a/b/', put:{'c.map': {m:2}}, _ts: '0200'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			// Unmap old content (a.json)
			{type: 'unmap', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0100'}, _ts: '0200'},
			// Map new content (a.json)
			{type: 'map', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:2, _ts: '0200'}, _ts: '0200X'},
			// b.json
			{type: 'unmap', path: '/a/b/b.json', content: {x:2, _ts: '0100'}, map: {m:1, _ts: '0100'}, _ts: '0200'},
			{type: 'map', path: '/a/b/b.json', content: {x:2, _ts: '0100'}, map: {m:2, _ts: '0200'}, _ts: '0200X'},
		    ]);
		    _();
		},
	    ], done)();
	});
    });
    describe('remove', function() {
	it('should create an unmap task for each removed .json file, for each existing .map file', function(done) {
	    util.seq([
		function(_) { mm.transaction({path: '/a/b/', put: {'a.json': {x:1}, 'b.map': {m:1}}, _ts: '0100'}, _); },
		function(_) { mm.transaction({path: '/a/b/', remove: ['a.json'], _ts: '0200'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'unmap', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0100'}, _ts: '0200'}
		    ]);
		    _();
		},
	    ], done)();	
	});
	it('should create an unmap task for each removed .map file, for each existing .json file', function(done) {
	    util.seq([
		function(_) { mm.transaction({path: '/a/b/', put: {'a.json': {x:1}, 'b.map': {m:1}}, _ts: '0100'}, _); },
		function(_) { mm.transaction({path: '/a/b/', remove: ['b.map'], _ts: '0200'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'unmap', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0100'}, _ts: '0200'}
		    ]);
		    _();
		},
	    ], done)();	
	});
	it('should create transaction tasks to remove .map files from child directories, when a .map file is removed', function(done) {
	    util.seq([
		function(_) { mm.transaction({path: '/a/b/c/', put: {foo: {}}, _ts: '0100'}, _.to('r1')); },
		function(_) { trampoline(this.r1._tasks, _); },
		function(_) { mm.transaction({path: '/a/b/d/', put: {foo: {}}, _ts: '0101'}, _.to('r2')); },
		function(_) { trampoline(this.r2._tasks, _); },
		function(_) { mm.transaction({path: '/a/b/', put: {'a.map': {m:1}}, _ts: '0102'}, _.to('r3')); },
		function(_) { trampoline(this.r3._tasks, _); },
		function(_) { mm.transaction({path: '/a/b/', remove: ['a.map'], _ts: '0200'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'transaction', path: '/a/b/c/', remove: ['a.map'], _ts: '0200'},
			{type: 'transaction', path: '/a/b/d/', remove: ['a.map'], _ts: '0200'},
		    ]);
		    _();
		},
	    ], done)();	
	});
    });
});
