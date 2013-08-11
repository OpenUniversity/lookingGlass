var assert = require("assert")
var mongofs = require("../mongofs.js");
var mongodb = require("mongodb");


describe('MongoFS', function() {
	describe('#get', function() {
		var mfs;
		before(function(done) {
			mongodb.MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, db) {
				if(err) return done(err);
				var coll = db.collection('test');
				mfs = new mongofs.MFS(coll);
				coll.remove({}, function(err) {
					if(err) return done(err);
					coll.insert({_id: '/hello/', a: [{foo: 'bar', '/ts':1}]}, done);
				});
			});
		});
		it('should retrieve the value of a file', function(done) {
			mfs.get('/hello/a', function(err, result) {
				if(err) return done(err);
				assert.equal('bar', result.foo);
				done();
			});
		});
	});
});
