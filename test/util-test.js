describe('util', function() {

var util = require('../util.js');
var assert = require('assert');

describe('seq(funcs, done)', function() {
	it('should return a function that runs asynchronous functions in funcs in order', function(done) {
		var d;
		var f = util.seq([
			function(_) {d = done; setTimeout(_, 10);},
			function(_) {d();}
		], function() {});
		f();
	});
	it('should handle errors by calling done with the error', function(done) {
		util.seq([
			function(_) {_(new Error('someError'));},
			function(_) {assert(0, 'This should not be called'); _()}
		], function(err) { assert.equal(err.message, 'someError'); done(); })();
	});
	it('should handle exceptions thrown by functions by calling done with the exception', function(done) {
		util.seq([
			function(_) { throw new Error('someError');},
			function(_) {assert(0, 'This should not be called'); _()}
		], function(err) { assert.equal(err.message, 'someError'); done(); })();
	});
	it('should call done with no error if all is successful', function(done) {
		util.seq([
			function(_) {setTimeout(_, 10);},
			function(_) {setTimeout(_, 10);},
			function(_) {setTimeout(_, 10);}
		], done)();
	});
	describe('_.to(names...)', function() {
		it('should return a function that places the corresponding arguments in "this" (skipping err)', function(done) {
			util.seq([
				function(_) { _.to('a', 'b', 'c')(undefined, 1, 2, 3); },
				function(_) { assert.equal(this.a, 1); _(); },
				function(_) { assert.equal(this.b, 2); _(); },
				function(_) { assert.equal(this.c, 3); _(); },
			], done)();
		});
	});
});

describe('timeUid()', function() {
	it('should return a unique string', function() {
		var vals = {};
		for(var i = 0; i < 10000; i++) {
			var tuid = util.timeUid();
			assert.equal(typeof(tuid), 'string');
			assert(!(tuid in vals), 'Value not unique');
			vals[tuid] = 1;
		}
	});
	it('should return a larger value when called over one millisecond later', function(done) {
		var a, b;
		util.seq([
			function(_) { a = util.timeUid(); setTimeout(_, 2); },
			function(_) { b = util.timeUid(); setTimeout(_, 2); },
			function(_) { assert(b > a, 'Later value is not larger than earlier'); _();},
		], done)();
	});
	it('should do something');
});

});

