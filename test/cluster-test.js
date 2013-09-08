var Trampoline = require('../trampoline.js').Trampoline;
var Dispatcher = require('../dispatcher.js').Dispatcher;
var MatchMaker = require('../matchMaker.js').MatchMaker;
var MFS = require('../mongofs.js').MFS;
var util = require('../util.js');
var assert = require('assert');
var ClusterNode = require('../cluster.js').ClusterNode;


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
            disp = new Dispatcher(new MatchMaker(storage), mappers);
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
	node1.start();
	node2.start();
	node3.start();
    });
    afterEach(function() {
	node1.stop();
	node2.stop();
	node3.stop();
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
		function(_) { tracker.transaction({path: '/node/node1/', get: ['*.pending'] }, _.to('result')); },
		function(_) {
		    var beenThere = false;
		    for(var key in this.result) {
			if(key.substr(key.length - 8) == '.pending') {
			    var task = this.result[key];
			    assert.deepEqual(task, {type: 'transaction',
						    path: '/a/',
						    put: {'b.d': {}},
						    _ts: task._ts});
			    beenThere = true;
			}
		    }
		    assert(beenThere, 'should encounter a task');
		    _();
		},
	    ], done)();
	});
    });
});