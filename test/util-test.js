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
});

describe('Encoder(allowedSpecial)', function() {
	describe('.encode(str)', function() {
		it('should encode str in a way that will only include letters, digits or characters from allowedSpecial', function() {
			var specialChars = '!@#$%^&*()_+<>?,./~`\'"[]{}\\|';
			var allowed = '_-+';
			var encoder = new util.Encoder(allowed);
			var enc = encoder.encode('abc' + specialChars + 'XYZ');
			for(var i = 0; i < specialChars.length; i++) {
				if(allowed.indexOf(specialChars.charAt(i)) != -1) continue; // Ignore allowed characters
				assert.equal(enc.indexOf(specialChars.charAt(i)), -1);
			}
		});
		it('should throw an exception if less than three special characters are allowed', function() {
			assert.throws(function() {
				util.encode('foo bar', '_+');
			}, 'at least three special characters must be allowed');
		});
	});
	var specialChars = '!@#$%^&*()_+<>?,./~`\'"[]{}\\|';
	var allowed = '_-+';
	describe('.decode(enc)', function() {
		it('should decode a string encoded with .encode()', function() {
			var encoder = new util.Encoder(allowed);
			var str = 'This is a test' + specialChars + ' woo hoo\n';
			assert.equal(encoder.decode(encoder.encode(str)), str);
		});
	});
});

});

