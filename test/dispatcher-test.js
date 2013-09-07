var Dispatcher = require('../dispatcher.js').Dispatcher;
var MatchMaker = require('../matchMaker.js').MatchMaker;
var MFS = require('../mongofs.js').MFS;
var util = require('../util.js');
var assert = require('assert');


describe('Dispatcher', function() {
    var storage;
    var coll;
    var mm;
    var disp;
    before(function(done) {
        require('mongodb').MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, db) {
            if(err) return done(err);
            coll = db.collection('test');
            storage = new MFS(coll, {maxVers: 2});
            mm = new MatchMaker(storage);
	    disp = new Dispatcher(mm, {mirror: require('../mirrorMapper.js')});
	    done();
        });
    });
    beforeEach(function(done) {
        coll.remove({}, done);
    });
    describe('transaction(trans, callback(err, result))', function() {
	it('should proxy transactions to the underlying layer', function(done) {
	    util.seq([
		function(_) { disp.transaction({path: '/a/b/', put: {c: {x:1}}, _ts: '0100'}, _); },
		function(_) { disp.transaction({path: '/a/b/', get: ['c']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result.c, {x:1, _ts: '0100'});
		    _();
		},
	    ], done)();
	});
    });
    describe('dispatch(task, callback(err, tasks))', function() {
	describe('transaction', function() {
	    it('should handle "transaction" tasks by performing a transaction on the storage', function(done) {
		util.seq([
		    function(_) { disp.dispatch({type: 'transaction', path: '/a/b/', put: {c: {x:1}}, _ts: '0100'}, _); },
		    function(_) { storage.transaction({path: '/a/b/', get: ['c']}, _.to('result')); },
		    function(_) {
			assert.deepEqual(this.result.c, {x:1, _ts: '0100'});
			_();
		    },
		], done)();
	    });
	    it('should return any further tasks', function(done) {
		util.seq([
		    function(_) { disp.dispatch({type: 'transaction', path: '/a/b/', put: {'a.json': {x:1}}, _ts: '0100'}, _); },
		    function(_) { disp.dispatch({type: 'transaction', path: '/a/b/', put: {'b.map': {m:1}}, _ts: '0101'}, _.to('tasks')); },
		    function(_) {
			assert.deepEqual(this.tasks, [
			    {type: 'map', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0101'}, _ts: '0101X'},
			]);
			_();
		    },
		], done)();
	    });
	});
	describe('map', function() {
	    it('should be referred to the corresponding mapper, returning transactions with put operations', function(done) {
		disp.dispatch({type: 'map',
			       path: '/a/b/c',
			       content: {foo: 'bar'},
			       map: {_mapper: 'mirror',
				     origPath: '/a/b/',
				     newPath: '/P/Q/'},
			       _ts: '0123'}, 
			      util.protect(done, function(err, tasks) {
				  assert.deepEqual(tasks, [
				      {type: 'transaction',
				       path: '/P/Q/',
				       put: {c: {foo: 'bar'}},
				       _ts: '0123'}
				  ]);
				  done();
			      }));
	    });
	});
    });
});