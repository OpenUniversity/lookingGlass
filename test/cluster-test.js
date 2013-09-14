var Dispatcher = require('../dispatcher.js').Dispatcher;
var MapMatcher = require('../matchMaker.js').MapMatcher;
var MFS = require('../mongofs.js').MFS;
var util = require('../util.js');
var assert = require('assert');
var ClusterNode = require('../cluster.js').ClusterNode;

var trace = false;
//var trace = true;

describe('ClusterNode', function() {
    var storage;
    var coll, collTracker;
    var disp;
    var tracker;
    var node1, node2, node3;
    before(function(done) {
	var mappers = {mirror: require('../mirrorMapper.js'),
		       javascript: require('../jsMapper.js')};
        require('mongodb').MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, db) {
            if(err) return done(err);
            coll = db.collection('storage');
            collTracker = db.collection('tracker');
            storage = new MFS(coll, {maxVers: 2});
            tracker = new MFS(collTracker, {maxVers: 1});
	    var matcher = new MapMatcher(storage);
/*	    if(trace) {
		matcher = new util.TracingDispatcher(matcher, 'MATCHER');
	    }*/
            disp = new Dispatcher(matcher, mappers);
	    if(trace) {
		disp = new util.TracingDispatcher(disp, 'DISP');
		tracker = new util.TracingDispatcher(tracker, 'TRACKER');
	    }
	    node1 = new ClusterNode(disp, tracker, 'node1');
	    node2 = new ClusterNode(disp, tracker, 'node2');
	    node3 = new ClusterNode(disp, tracker, 'node3');
	    done();
        });
    });
    beforeEach(function(done) {
	util.seq([
	    function(_) { coll.remove({}, _); },
	    function(_) { collTracker.remove({}, _); },
	], done)();
    });
    afterEach(function(done) {
	node1.stop();
	node2.stop();
	node3.stop();
	setTimeout(done, 100);
    });
    describe('transaction(trans, callback(err, result))', function() {
	it('should relay the transaction to the underlying storage (regardless of node)', function(done) {
	    util.seq([
		function(_) { node1.transaction({path: '/a/b/', put: {'c.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { node2.transaction({path: '/a/b/', get: ['c.json']}, _.to('result')); },
		function(_) { assert.deepEqual(this.result['c.json'], {foo: 'bar', _ts: '0100'}); _(); },
	    ], done)();
	});
	it('should write returned tasks to the tracker, in the form: /node/[nodeID]/[taskID].pending', function(done) {
	    util.seq([
		function(_) { node1.transaction({path: '/a/b/', put: {'c.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { tracker.transaction({path: '/node/node1/', get: ['*']}, _.to('result')); },
		function(_) {
		    var beenThere = false;
		    for(var key in this.result) {
			if(key.substr(key.length - 8) == '.pending') {
			    var task = this.result[key].task;
			    assert.deepEqual(task, {type: 'transaction',
						    path: '/a/',
						    put: {'b.d': {}},
						    _ts: '0100',
						    _tracking: task._tracking,
						    _id: task._id});
			    beenThere = true;
			}
		    }
		    assert(beenThere, 'should encounter a task');
		    _();
		},
	    ], done)();
	});
    });
    describe('start()', function() {
	it('should cause the node to automatically take .pending tasks and execute them', function(done) {
	    util.seq([
		function(_) { node1.transaction({path: '/a/b/', put: {'c.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { node1.start(); _(); },
		function(_) { setTimeout(_, 100); }, // enough time to work
		function(_) { node2.transaction({path: '/a/', get: ['b.d']}, _.to('result')); },
		function(_) { assert(this.result['b.d'], 'directory must exist'); _(); },
	    ], done)();
	});
    });
    describe('wait(tracking, callback(err))', function() {
	it('should call the callback once all processing for the transaction associated with the tracking object is done', function(done) {
	    node1.start();
	    util.seq([
		function(_) { node1.transaction({path: '/a/', put: {'m.map': {_mapper: 'mirror',
									      origPath: '/a/',
									      newPath: '/X/Y/'}}, _ts: '0100'}, _.to('t2')); },
		function(_) { node1.transaction({path: '/a/b/', put: {'a.json': {x:1}, 'b.json': {x:2}}, _ts: '0200'}, _.to('t1')); },
		function(_) { node1.wait(this.t1, _); },
		function(_) { node1.wait(this.t2, _); },
		function(_) { node1.transaction({path: '/X/Y/b/', get: ['*.json']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result['a.json'], {x:1, _ts: '02000100X', _future: true});
		    assert.deepEqual(this.result['b.json'], {x:2, _ts: '02000100X', _future: true});
		    _();
		},
	    ], done)();
	});
    });
    it('should support map of map scenarios', function(done) {
	node1.start();
	// We build a tweeter-like data model, with /follow/<user>/<followee> files indicating
	// following relationships, /tweet/<user>/* files containing individual tweets, and
	// timelines being mapped to /timeline/<user>/*
	util.seq([
	    function(_) { tweeterExample(node1, _); },
	    function(_) { node1.transaction({path: '/timeline/alice/', get: ['*.json']}, _.to('result')); },
	    function(_) {
		assert(this.result['0101.json'], 'tweet should exist');
		assert.equal(this.result['0101.json'].text, 'Hi, I\'m bob');
		assert.equal(this.result['0101.json'].from, 'bob');
		_();
	    },
	], done)();

	function tweeterExample(node, done) {
	    var mapFunction = function(path, content) {
		// Put followee tweets in the follower's timeline
		var mapTweet = function(path, content) {
		    var splitPath = path.split('/');
		    var author = splitPath[2];
		    emit('/timeline/' + this.follower + '/' + content._ts + '.json', 
			 {text: content.text, from: author});
		};
		// Create a mapping for each following relationship
		var splitPath = path.split('/');
		var follower = splitPath[2];
		var followee = content.who;
		emit('/tweet/' + followee + '/' + follower + '.map', {
		    _mapper: 'javascript',
		    func: mapTweet.toString(),
		    follower: follower,
		});
	    };
	    util.seq([
		function(_) { node.transaction({path: '/follow/', put: {'tweet.map': {
		    _mapper: 'javascript',
		    func: mapFunction.toString(),
		}}, _ts: '0010'}, _.to('w1')); },
		function(_) { node.transaction({path: '/tweet/alice/', put: {'a.json': {text: 'Hi, I\'m alice'}}, _ts: '0100'}, _.to('w2')); },
		function(_) { node.transaction({path: '/tweet/bob/', put: {'b.json': {text: 'Hi, I\'m bob'}}, _ts: '0101'}, _.to('w3')); },
		function(_) { node.transaction({path: '/follow/alice/', put: {'bob.json': {who: 'bob'}}, _ts: '0123'}, _.to('w4')); },
		function(_) { node.wait(this.w1, _); },
		function(_) { node.wait(this.w2, _); },
		function(_) { node.wait(this.w3, _); },
		function(_) { node.wait(this.w4, _); },
	    ], done)();
	}
    });
    function tweeterExample(node, done) {
	var mapFunction = function(path, content) {
	    // Put followee tweets in the follower's timeline
	    var mapTweet = function(path, content) {
		var splitPath = path.split('/');
		var author = splitPath[2];
		emit('/timeline/' + this.follower + '/' + content._ts + '.json', 
		     {text: content.text, from: author});
	    };
	    // Create a mapping for each following relationship
	    var splitPath = path.split('/');
	    var follower = splitPath[2];
	    var followee = content.who;
	    emit('/tweet/' + followee + '/' + follower + '.map', {
		_mapper: 'javascript',
		func: mapTweet.toString(),
		follower: follower,
	    });
	};
	util.seq([
	    function(_) { node1.transaction({path: '/follow/', put: {'tweet.map': {
		_mapper: 'javascript',
		func: mapFunction.toString(),
	    }}, _ts: '0010'}, _.to('w1')); },
	    function(_) { node.transaction({path: '/tweet/alice/', put: {'a.json': {text: 'Hi, I\'m alice'}}, _ts: '0100'}, _.to('w2')); },
	    function(_) { node.transaction({path: '/tweet/bob/', put: {'b.json': {text: 'Hi, I\'m bob'}}, _ts: '0101'}, _.to('w3')); },
	    function(_) { node.transaction({path: '/follow/alice/', put: {'bob.json': {who: 'bob'}}, _ts: '0123'}, _.to('w4')); },
	    function(_) { node.wait(this.w1, _); },
	    function(_) { node.wait(this.w2, _); },
	    function(_) { node.wait(this.w3, _); },
	    function(_) { node.wait(this.w4, _); },
	], done)();
    }
    it('should unmap when a file creating a mapping, is removed', function(done) {
	node1.start();
	util.seq([
	    function(_) { tweeterExample(node1, _); },
	    function(_) { node1.transaction({path: '/follow/alice/', remove: ['bob.json']}, _.to('w1')); },
	    function(_) { node1.wait(this.w1, _); },
	    function(_) { node1.transaction({path: '/timeline/alice/', get: ['*.json']}, _.to('result')); },
	    function(_) {
		assert(!this.result['0101.json'], 'Bob\'s tweet should not be found there');
		_();
	    },
	], done)();
    });
    it('should cover for work by the following two cluster nodes (two being configurable) in lexicographic order', function(done) {
	node1.start(); // node3 has not be started.  It is considered to be down.
	util.seq([
	    function(_) { tweeterExample(node3, _); },
	    function(_) { node3.transaction({path: '/follow/alice/', remove: ['bob.json']}, _.to('w1')); },
	    function(_) { node1.wait(this.w1, _); },
	    function(_) { node1.transaction({path: '/timeline/alice/', get: ['*.json']}, _.to('result')); },
	    function(_) {
		assert(!this.result['0101.json'], 'Bob\'s tweet should not be found there');
		_();
	    },
	], done)();	
    });
    it('should cover nodes cyclicly', function(done) {
	node3.start(); // node1 has not be started.  It is considered to be down.
	util.seq([
	    function(_) { tweeterExample(node1, _); },
	    function(_) { node1.transaction({path: '/follow/alice/', remove: ['bob.json']}, _.to('w1')); },
	    function(_) { node3.wait(this.w1, _); },
	    function(_) { node3.transaction({path: '/timeline/alice/', get: ['*.json']}, _.to('result')); },
	    function(_) {
		assert(!this.result['0101.json'], 'Bob\'s tweet should not be found there');
		_();
	    },
	], done)();	
    });
});
