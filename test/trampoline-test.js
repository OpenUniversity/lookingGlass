var Trampoline = require('../trampoline.js').Trampoline;
var Dispatcher = require('../dispatcher.js').Dispatcher;
var MapMatcher = require('../matchMaker.js').MapMatcher;
var MFS = require('../mongofs.js').MFS;
var util = require('../util.js');
var assert = require('assert');


describe('Trampoline', function() {
    var storage;
    var coll;
    var disp;
    var tramp;
    before(function(done) {
	var mappers = {mirror: require('../mirrorMapper.js'),
		       javascript: require('../jsMapper.js')};
        require('mongodb').MongoClient.connect('mongodb://127.0.0.1:27017/test', function(err, db) {
            if(err) return done(err);
            coll = db.collection('test');
            storage = new MFS(coll, {maxVers: 2});
            disp = new Dispatcher(new MapMatcher(storage), mappers);
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
	it('should perform subsequent tasks before calling the callback, given the timeout is not exceeded', function(done) {
	    util.seq([
		function(_) { tramp.transaction({path: '/a/b/', put: {'a.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { tramp.transaction({path: '/a/', put: {'b.map': {_mapper: 'mirror',
										origPath: '/a/',
										newPath: '/A/'}}, _ts: '0101'}, _); },
		function(_) { tramp.transaction({path: '/A/b/', get: ['a.json']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result['a.json'], {foo: 'bar', _ts: '0101X'}); _();
		},
		
	    ], done)();
	});
	it('should not exceed the given timeout (by too much)', function(done) {
	    var shortTramp = new Trampoline(disp, 50); // only two milliseconds
	    function infiniteMapper(path, content) {
		// foo.json -> fooX.json
		emit(path.substr(0, path.length - 5) + 'X.json', content);
	    }
	    util.seq([
		function(_) { shortTramp.transaction({path: '/a/b/', put: {'a.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { this.startTime = (new Date()).getTime(); _(); },
		function(_) { shortTramp.transaction({path: '/a/', put: {'b.map': {_mapper: 'javascript',
										   func: infiniteMapper.toString()}}, _ts: '0101'}, _); },
		function(_) { this.endTime = (new Date()).getTime(); _(); },
		function(_) {
		    assert(this.endTime - this.startTime <= 100, 'should stop on time  (' + (this.endTime - this.startTime) + ' ms)');
		    _();
		},
		
	    ], done)();
	});
	it('should update result._tasks so that the residual tasks can be resumed once the timeout was exceeded', function(done) {
	    var shortTramp = new Trampoline(disp, 0); // not enough time to do anything
	    util.seq([
		function(_) { tramp.transaction({path: '/a/b/', put: {'a.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { shortTramp.transaction({path: '/a/', put: {'b.map': {_mapper: 'mirror',
										   origPath: '/a/',
										   newPath: '/A/'}}, _ts: '0101'}, _.to('result')); },
		function(_) { var cb = util.parallel(this.result._tasks.length, _);
			      for(var i = 0; i < this.result._tasks.length; i++) {
				  tramp.dispatch(this.result._tasks[i], cb);
			      }
			    },
		
		function(_) { tramp.transaction({path: '/A/b/', get: ['a.json']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result['a.json'], {foo: 'bar', _ts: '0101X'}); _();
		},
		
	    ], done)();
	});
    });
    describe('dispatch', function() {
	it('should relay tasks to the underlying dispatcher', function(done) {
	    util.seq([
		function(_) { tramp.dispatch({type: 'transaction', path: '/a/b/', put: {'c.json': {foo:'bar'}}, _ts: '0100'}, _); },
		function(_) { tramp.transaction({path: '/a/b/', get: ['c.json']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result['c.json'], {foo: 'bar', _ts: '0100'});
		    _();
		},
		
	    ], done)();
	});
	it('should re-dispatch tasks returned from dispatched tasks, until no tasks are left, given it is done within the timeout', function(done) {
	    util.seq([
		function(_) { tramp.dispatch({type: 'transaction', path: '/a/b/', put: {'c.json': {foo:'bar'}}, _ts: '0100'}, _); },
		function(_) { tramp.transaction({path: '/a/', get: ['b.d']}, _.to('result')); },
		function(_) {
		    assert(this.result['b.d'], 'the directory entry must exist');
		    _();
		},
		
	    ], done)();
	});
    });
});