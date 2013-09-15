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
	var trans = {path: parsed.dirPath, put: put};
	if(data._ts) {
	    trans._ts = data._ts;
	}
	disp.transaction(trans, util.protect(callback, function(err, result) {
	    res.writeHead(201, {'Content-Type': 'application/json'});
	    res.end(JSON.stringify(result));
	}));
    };
    this.do_GET = function(req, res, data, callback) {
	var path = req.url;
	var parsed = util.parsePath(path);
	if(parsed.fileName == '') {
	    return this.do_getDir(req, res, data, callback);
	}
	disp.transaction({path: parsed.dirPath, get:[parsed.fileName]}, function(err, result) {
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
		if(notModified(req, result)) {
		    res.writeHead(304, {'content-type': 'text/plain'});
		    res.end();
		    return;
		}
		var headers = {'Content-Type': 'application/json', 
			       'ETag': '"' + result._lastChangeTS + '"'};
		if(parsed.fileName.charAt(0) == '*') {
		    res.writeHead(200, headers);
		    res.end(JSON.stringify(result));		    
		} else {
		    var content = result[parsed.fileName];
		    if(content._content_type) {
			headers['Content-Type'] = content._content_type;
			content = new Buffer(content._content, 'base64');
		    } else {
			content = JSON.stringify(content);
		    }
		    res.writeHead(200, headers);
		    res.end(content);
		}
	    } catch(e) {
		callback(e);
	    }
	});
    };
    this.do_DELETE = function(req, res, data, callback) {
	var path = req.url;
	var parsed = util.parsePath(path);
	disp.transaction({path: parsed.dirPath, remove: [parsed.fileName]}, util.protect(callback, function(err, result) {
	    res.writeHead(200, {'Content-Type': 'application/json'});
	    res.end(JSON.stringify(result));
	}));
    };
    this.do_POST = function(req, res, data, callback) {
	data.path = req.url;
	var tracking = disp.transaction(data, util.protect(callback, function(err, result) {
	    res.writeHead(200, {'Content-Type': 'application/json'});
	    res.end(JSON.stringify(result));
	}));
    };
    this.do_getDir = function(req, res, data, callback) {
	var path = req.url;
	disp.transaction({path: path, get:['*']}, util.protect(callback, function(err, result) {
	    res.writeHead(200, {'Content-Type': 'application/json'});
	    var dir = {};
	    for(file in result) {
		dir[file] = result[file]._ts;
	    }
	    res.end(JSON.stringify(dir));
	}));
    }
    function notModified(req, result) {
	var ifNoneMatch = req.headers['if-none-match'];
	if(!ifNoneMatch) return false;
	return ifNoneMatch == '"' + result._lastChangeTS + '"';
    }
};
