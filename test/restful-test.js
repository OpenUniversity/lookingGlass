var util = require('../util.js');
var assert = require('assert');
var LookingGlassServer = require('../restful.js').LookingGlassServer;
var MFS = require('../mongofs.js').MFS;
var Dispatcher = require('../dispatcher.js').Dispatcher;

function DummyScheduler(path) {
    this.getPath = function() {
        return path;
    };
}
var thePath = '/some/path/';
var scheduler = new DummyScheduler(thePath);

var mappers = {
    _default: require('../httpMapper.js'),
    mirror: require('../mirrorMapper.js'),
    javascript: require('../jsMapper.js'),
};

describe('lookingGlass RESTful API', function() {
    var storageColl, trackerColl, server;
    before(function(done) {
	util.seq([
            function(_) { require("mongodb").MongoClient.connect('mongodb://127.0.0.1:27017/test', _.to('db')); },
            function(_) {
                storageColl = this.db.collection('storage');
                trackerColl = this.db.collection('tracker');
                var storage = new MFS(storageColl, {maxVers: 2});
                var tracker = new MFS(trackerColl, {maxVers: 2});
                var disp = new Dispatcher(storage, tracker, scheduler, mappers);
		server = new LookingGlassServer(disp, 47837);
		server.start();
                _();
            },
        ], done)();
    });
    after(function() {
	server.stop();
    });
    beforeEach(function(done) {
	util.seq([
            function(_) { storageColl.remove({}, _); },
            function(_) { trackerColl.remove({}, _); },
	], done)();
    });
    it.skip('should response to GET requests with JSON objects provided in PUT requests to the same location', function(done) {
	var URL = 'http://localhost:47837/foo/bar';
	util.seq([
	    function(_) { util.httpJsonReq('PUT', URL, {
		myFoo: 'myBar',
	    }, _.to('statusCode', 'headers', 'resp')); },
	    function(_) { assert.equal(this.statusCode, 201); _(); },
	    function(_) { util.httpJsonReq('GET', URL, {}, _.to('statusCode', 'headers', 'resp')); },
	    function(_) {
		assert.equal(this.statusCode, 200); _();
		assert.equal(this.headers['content-type'], 'application/json');
		assert.equal(this.resp.myFoo, 'myBar');
		_();
	    },
	], done)();
	
    });
});