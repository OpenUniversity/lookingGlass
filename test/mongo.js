var assert = require("assert");
var mongofs = require("../mongofs.js");
var mongodb = require("mongodb");
var util = require("../util.js");
var protect = util.protect;
var describeStorageDriver = require('./storageDriver-test.js').describeStorageDriver;

describe('MongoFS', function() {
    var mfs;
    var coll;
    var driverContainer = {};
    before(function(done) {
        mongodb.MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, db) {
            if(err) return done(err);
            coll = db.collection('test');
            mfs = new mongofs.MFS(coll, {maxVers: 2});
            coll.remove({}, done);
            driverContainer.driver = mfs;
        });
    });
    describeStorageDriver(driverContainer);
});

