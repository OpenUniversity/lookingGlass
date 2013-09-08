var Trampoline = require('../trampoline.js').Trampoline;
var Dispatcher = require('../dispatcher.js').Dispatcher;
var MatchMaker = require('../matchMaker.js').MatchMaker;
var MFS = require('../mongofs.js').MFS;
var util = require('../util.js');
var assert = require('assert');


describe('Trampoline', function() {
    var storage;
    var coll;
    var disp;
    var tramp;
    before(function(done) {
        require('mongodb').MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, db) {
            if(err) return done(err);
            coll = db.collection('test');
            storage = new MFS(coll, {maxVers: 2});
            disp = new Dispatcher(new MatchMaker(storage));
	    tramp = new Trampoline(disp, 1000);
	    done();
        });
    });
    beforeEach(function(done) {
        coll.remove({}, done);
    });
    describe('transaction', function() {
	it('should relay transactions to the underlying storage, and return the result', function(done) {
	    util.seq([
		function(_) { tramp.transaction({path: '/a/b/', put: {'c.json': {foo:'bar'}}, _ts: '0100'}, _); },
		function(_) { tramp.transaction({path: '/a/b/', get: ['c.json']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result['c.json'], {foo: 'bar', _ts: '0100'});
		    _();
		},
		
	    ], done)();
	});
    });
});