var jsMapper = require('../jsMapper.js');
var assert = require('assert');

describe('jsMapper', function() {
	it('should receive a javascript function as the mapping\'s "func" field and call it with the entry as its "this"', function(done) {
		mappingFunction = function() {
			this.beenHere = true;
		}
		var mapping = {func: mappingFunction.toString()};
		jsMapper.map({
			type: 'map',
			mapping: mapping,
			content: {foo: 'bar'},
			path: '/a/b/c',
		}, function(err, list) {
			assert(mapping.beenHere, 'indication that the mapping function has been executed');
			done();
		});
	});
	it('should pass the function the path and the content to be mapped', function(done) {
		mappingFunction = function(path, content) {
			this.path = path;
			this.content = content;
		}
		var mapping = {func: mappingFunction.toString()};
		jsMapper.map({
			type: 'map',
			mapping: mapping,
			content: {foo: 'bar'},
			path: '/a/b/c',
		}, function(err, list) {
			assert.equal(mapping.path, '/a/b/c');
			assert.equal(mapping.content.foo, 'bar');
			done();
		});
	});
	it('should provide an emit() function that contributes content actions to the output', function(done) {
		mappingFunction = function(path, content) {
			emit('/foo/bar', {foo: 'bar'});
			emit('/a/b/c/d', {abc: 123});
		}
		var mapping = {func: mappingFunction.toString()};
		jsMapper.map({
			type: 'map',
			mapping: mapping,
			content: {foo: 'bar'},
			path: '/a/b/c',
		}, function(err, list) {
			assert.equal(list.length, 2);
			assert.equal(list[0].type, 'content');
			assert.equal(list[0].path, '/foo/bar');
			assert.equal(list[0].content.foo, 'bar');
			assert.equal(list[1].type, 'content');
			assert.equal(list[1].path, '/a/b/c/d');
			assert.equal(list[1].content.abc, 123);
			done();
		});
	});
});

