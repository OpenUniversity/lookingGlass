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
});