var util = require('./util.js');
var http = require('http');

exports.LookingGlassServer = function(disp, port) {
    var self = this;
    var server = http.createServer(function(req, res) {
        var reqContent = '';
        util.seq([
            function(_) {
		if(req.headers['content-type'] == 'application/json') {
                    req.setEncoding('utf8');
		} else {
                    req.setEncoding('base64');
		}
                req.on('data', function(data) { reqContent += data; });
                req.on('end', _);
            },
            function(_) { 
		var methodName = 'do_' + req.method;
		var json = '';
		if(req.headers['content-type'] == 'application/json') {
		    json = JSON.parse(reqContent);
		} else if(reqContent != '') {
		    json = reqContent;
		}
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
	if(typeof(data) == 'string') {
	    data = {_content_type: req.headers['content-type'], _content: data};
	}
	put[parsed.fileName] = data;
	disp.transaction({path: parsed.dirPath, put: put, _ts: data._ts}, util.protect(callback, function(err, actions) {
	    res.writeHead(201, {'Content-Type': 'application/json'});
	    res.end(JSON.stringify(actions));
	}));
    };
    this.do_GET = function(req, res, data, callback) {
	var path = req.url;
	var parsed = util.parsePath(path);
	if(parsed.fileName == '') {
	    return this.do_getDir(req, res, data, callback);
	}
	disp.transaction({path: parsed.dirPath, get:[parsed.fileName]}, function(err, actions) {
	    try {
		if(err) {
		    if(err.fileNotFound) {
			res.writeHead(404, {'content-type': 'text/plain'});
			res.end(err.toString());
			return;
		    } else {
			throw err;
		    }
		}
		for(var i = 0; i < actions.length; i++) {
		    if(actions[i].type == 'content') {
			var content = actions[i].content;
			var contentType = 'application/json';
			if(content._content_type) {
			    contentType = content._content_type;
			    content = new Buffer(content._content, 'base64');
			} else {
			    content = JSON.stringify(content);
			}
			res.writeHead(200, {'Content-Type': contentType});
			res.end(content);
			return;
		    }
		}
		throw new Error('No content found');
	    } catch(e) {
		callback(e);
	    }
	});
    };
    this.do_DELETE = function(req, res, data, callback) {
	var path = req.url;
	var parsed = util.parsePath(path);
	disp.transaction({path: parsed.dirPath, remove: [parsed.fileName]}, util.protect(callback, function(err, actions) {
	    res.writeHead(200, {'Content-Type': 'application/json'});
	    res.end(JSON.stringify(actions));
	}));
    };
    this.do_POST = function(req, res, data, callback) {
	data.path = req.url;
	var tracking = disp.transaction(data, util.protect(callback, function(err, actions) {
	    res.writeHead(200, {'Content-Type': 'application/json'});
	    res.end(JSON.stringify({tracking: tracking, actions: actions}));
	}));
    };
    this.do_getDir = function(req, res, data, callback) {
	var path = req.url;
	disp.transaction({path: path, getDir:{expandFiles:1}}, util.protect(callback, function(err, actions) {
	    var dir = {};
	    for(var i = 0; i < actions.length; i++) {
		if(actions[i].type != 'content') continue;
		var parsed = util.parsePath(actions[i].path);
		dir[parsed.fileName] = actions[i].content._ts;
	    }
	    res.writeHead(200, {'Content-Type': 'application/json'});
	    res.end(JSON.stringify(dir));
	}));
    }
};
