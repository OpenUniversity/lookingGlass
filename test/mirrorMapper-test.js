var util = require('../util.js');
var assert = require('assert');
var http = require('http');
var MapServer = require('../mapServer.js').MapServer;

var port = 23445;

var mapper = new MapServer(port, {'/mirror': require('../mirrorMapper.js')});
before(function(done) {
    mapper.start();
    setTimeout(done, 20);
});

after(function() {
    mapper.stop(function() {});
});

describe('MirrorMapper', function() {
    it('should returns content objects identical to the source, except changing the path', function(done) {
        util.seq([
            function(_) { util.httpJsonReq('POST', 'http://localhost:' + port + '/mirror', {
                type: 'map',
                mapping: {origPath: '/a/b/', newPath: '/X/Y/'},
                path: '/a/b/c/d',
                content: {foo: 'bar'},
            }, _.to('status', 'headers', 'response')); },
            function(_) {
                assert.equal(this.status, 200);
                assert.equal(this.headers['content-type'], 'application/json');
                assert.equal(this.response.length, 1);
                assert.equal(this.response[0].type, 'content');
                assert.equal(this.response[0].path, '/X/Y/c/d');
                assert.equal(this.response[0].content.foo, 'bar');
                _();
            },
        ], done)();
    });
});
