var MatchMaker;// = require('../matchMaker.js');

describe('MatchMaker', function() {
    var mfs;
    var coll;
    var driverContainer = {};
    before(function(done) {
        require('mongodb').MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, db) {
            if(err) return done(err);
            coll = db.collection('test');
            mfs = new mongofs.MFS(coll, {maxVers: 2});
            driverContainer.driver = new MatchMaker(mfs);
        });
    });
    beforeEach(function(done) {
        coll.remove({}, done);
    });

});