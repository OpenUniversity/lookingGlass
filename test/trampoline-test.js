/*var Trampoline = require('../trampoline.js').Trampoline;
var MatchMaker = require('../matchMaker.js').MatchMaker;
var MFS = require('../mongofs.js').MFS;
var util = require('../util.js');
var assert = require('assert');


describe('Trampoline', function() {
    var storage;
    var coll;
    var mm;
    var tramp;
    before(function(done) {
        require('mongodb').MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, db) {
            if(err) return done(err);
            coll = db.collection('test');
            storage = new MFS(coll, {maxVers: 2});
            mm = new MatchMaker(storage);
	    tramp = new Trampoline(mm, 1000);
	    done();
        });
    });
    beforeEach(function(done) {
        coll.remove({}, done);
    });
    describe('', function() {
	
    });
});*/