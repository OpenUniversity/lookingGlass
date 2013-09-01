var util = require('./util.js');
var http = require('http');

exports.LookingGlassServer = function(disp, port) {
    var self = this;
    var server = http.createServer(function(req, res) {
        var reqContent = '';
        util.seq([
            function(_) {
                req.setEncoding('utf8');
                req.on('data', function(data) { reqContent += data; });
                req.on('end', _);
            },
            function(_) { 
		var methodName = 'do_' + req.method;
		var json = reqContent != '' ? JSON.parse(reqContent) : {};
		if(self[methodName]) {
		    self[methodName](req, res, json, _);
		} else {
		    res.writeHead(405, {'Content-Type': 'text/plain'});
		    res.end('Method not allowed: ' + req.method);
		    _();
		}
            },
        ], function(err) {
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end(err.stack);
        })();	
    });
    this.start = function() {
	disp.start();
	server.listen(port);
    };
    this.stop = function() {
	server.close();
	disp.stop();
    };
    
    this.do_PUT = function(req, res, data, callback) {
	var path = req.url;
	var parsed = util.parsePath(path);
	var put = {};
	put[parsed.fileName] = data;
	disp.transaction({path: parsed.dirPath, put: put, _ts: data._ts}, util.protect(callback, function(err, actions) {
	    res.writeHead(201, {'Content-Type': 'application/json'});
	    res.end(JSON.stringify(actions));
	}));
    };
    this.do_GET = function(req, res, data, callback) {
	var path = req.url;
	var parsed = util.parsePath(path);
	disp.transaction({path: parsed.dirPath, get:[parsed.fileName]}, util.protect(callback, function(err, actions) {
	    for(var i = 0; i < actions.length; i++) {
		if(actions[i].type == 'content') {
		    res.writeHead(200, {'Content-Type': 'application/json'});
		    res.end(JSON.stringify(actions[0].content));
		    return;
		}
	    }
	    throw new Error('No content found');
	}));
    };
};
