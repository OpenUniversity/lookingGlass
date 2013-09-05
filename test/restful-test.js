var util = require('../util.js');
var assert = require('assert');
var LookingGlassServer = require('../restful.js').LookingGlassServer;
var MFS = require('../mongofs.js').MFS;
var Dispatcher = require('../dispatcher.js').Dispatcher;
var http = require('http');

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

describe.skip('lookingGlass RESTful API', function() {
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
    describe('PUT', function() {
	it('should stopre JSON object so that GET can retrieve them', function(done) {
	    var URL = 'http://localhost:47837/foo/bar';
	    util.seq([
		function(_) { util.httpJsonReq('PUT', URL, {
		    myFoo: 'myBar',
		}, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 201); _(); },
		function(_) { util.httpJsonReq('GET', URL, undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) {
		    assert.equal(this.statusCode, 200);
		    assert.equal(this.headers['content-type'], 'application/json');
		    assert.equal(this.resp.myFoo, 'myBar');
		    _();
		},
	    ], done)();
	});
	it('should accept data of any content type', function(done) {
	    storeFileWithContentType('text/foobar', 'foo bar foo bar foo bar', done);
	    
	    function storeFileWithContentType(contentType, content, done) {
		var client = http.createClient(47837, 'localhost');
		var request = client.request('PUT', '/a/b/foo.txt', {host: 'localhost', 'content-type': contentType});
		request.end(content);
		request.on('error', done);
		request.on('response', function(resp) {
		    assert.equal(resp.statusCode, 201);
		    resp.on('end', done);
		});
	    }
	});
    });
    function storeFileWithContentType(contentType, content, done) {
	var client = http.createClient(47837, 'localhost');
	var request = client.request('PUT', '/a/b/foo.txt', {host: 'localhost', 'content-type': contentType});
	request.end(content);
	request.on('error', done);
	request.on('response', function(resp) {
	    assert.equal(resp.statusCode, 201);
	    resp.on('end', done);
	});
    }
    describe('GET', function() {
	it('should return a status of 404 when accessing a file that does not exist', function(done) {
	    util.seq([
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/file/that/does/not/exist', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 404); _(); },
	    ], done)();	    
	});
	it('should return files stored with any content type, providing the content type given at storage', function(done) {
	    util.seq([
		function(_) { storeFileWithContentType('text/foobar', 'FOO-BAR', _); },
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/a/b/foo.txt', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) {
		    assert.equal(this.statusCode, 200);
		    assert.equal(this.headers['content-type'], 'text/foobar');
		    assert.equal(this.resp, 'FOO-BAR');
		    _();
		},
	    ], done)();
	});
	it('should retrieve the content of a directory, if the path ends with a slash', function(done) {
	    util.seq([
		function(_) { util.httpJsonReq('PUT', 'http://localhost:47837/some/dir/a', {hello: 'world'}, _); },
		function(_) { util.httpJsonReq('PUT', 'http://localhost:47837/some/dir/b', {hola: 'mondi'}, _); },
		function(_) { util.httpJsonReq('PUT', 'http://localhost:47837/some/dir/c', {shalom: 'olam'}, _); },
		function(_) { util.httpJsonReq('PUT', 'http://localhost:47837/some/dir/d', {privet: 'mir'}, _); },
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/some/dir/', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) {
		    assert.equal(this.statusCode, 200);
		    assert(this.resp.a, 'a should exist');
		    assert(this.resp.b, 'b should exist');
		    assert(this.resp.c, 'c should exist');
		    assert(this.resp.d, 'd should exist');
		    _();
		},
	    ], done)();
	});
	it('should provide timestamps for each file when retrieving a directory', function(done) {
	    util.seq([
		function(_) { util.httpJsonReq('POST', 'http://localhost:47837/some/dir/', {put: {a: {hello: 'world'}}, _ts: "0100"}, _); },
		function(_) { util.httpJsonReq('POST', 'http://localhost:47837/some/dir/', {put: {b: {hola: 'mondi'}}, _ts: "0101"}, _); },
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/some/dir/', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) {
		    assert.equal(this.statusCode, 200);
		    assert.equal(this.resp.a, '0100');
		    assert.equal(this.resp.b, '0101');
		    _();
		},
	    ], done)();
	});
    });
    describe('DELETE', function() {
	var URL = 'http://localhost:47837/foo/bar';
	it('should remove a file as response to a DELETE request', function(done) {
	    util.seq([
		function(_) { util.httpJsonReq('PUT', URL, { myFoo: 'myBar'}, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 201); _(); },
		function(_) { util.httpJsonReq('DELETE', URL, undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 200); _(); },
		function(_) { util.httpJsonReq('GET', URL, undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 404); _(); },
	    ], done)();
	    
	});
    });
    describe('POST', function() {
	it('should perform the transaction enclosed in the body of the request', function(done) {
	    util.seq([
		function(_) { util.httpJsonReq('POST', 'http://localhost:47837/some/dir/', {
		    put: {foo: {bar: 'baz'}}
		}, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 200); _(); },
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/some/dir/foo', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) {
		    assert.equal(this.statusCode, 200);
		    assert.equal(this.resp.bar, 'baz');
		    _();
		},
		function(_) { util.httpJsonReq('POST', 'http://localhost:47837/some/dir/', {
		    remove: ['foo'],
		}, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 200); _(); },
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/some/dir/foo', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 404); _(); },
	    ], done)();
	});
    });
});