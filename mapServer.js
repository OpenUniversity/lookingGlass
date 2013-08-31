var http = require('http');
var util = require('./util.js');


exports.MapServer = function(port, mappers) {
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
                if(mappers[req.url]) {
                    mappers[req.url].map(reqJson, _.to('list'));
                } else {
                    mappers._default.map(reqJson, _.to('list'));
                }
            },
            function(_) { res.end(JSON.stringify(this.list)); }
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
