var http = require('http');
var util = require('./util.js');


exports.map = function(action, callback) {
	if(action.path.substr(0, action.mapping.origPath.length) == action.mapping.origPath) {
		var newPath = action.mapping.newPath + action.path.substr(action.mapping.origPath.length);
		return callback(undefined, [{type: 'content', content: action.content, path: newPath}]);
	}
	return callback(undefined, []);
}

exports.MirrorMapper = function(port) {
	var server = http.createServer(function (req, res) {
		var reqContent = '';
		util.seq([
			function(_) {
				req.setEncoding('utf8');
				req.on('data', function(data) { reqContent += data; });
				req.on('end', _);
			},
			function(_) { 
				res.writeHead(200, {'Content-Type': 'application/json'});
				var reqJson = JSON.parse(reqContent);
				res.end(JSON.stringify(calcResponse(reqJson)));
			},
		], function(err) {
			res.writeHead(500, {'Content-Type': 'text/plain'});
			res.end(err.toString());
		})();
	});
	this.start = function() {
		server.listen(port);
	};

	this.stop = function(callback) {
		server.close();
		server.on('close', callback);
	};

	function calcResponse(mapping) {
		if(mapping.path.substr(0, mapping.mapping.origPath.length) == mapping.mapping.origPath) {
			var newPath = mapping.mapping.newPath + mapping.path.substr(mapping.mapping.origPath.length);
			return [{type: 'content', content: mapping.content, path: newPath}];
		}
		return [];
	}
};