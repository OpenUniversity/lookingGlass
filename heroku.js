var Trampoline = require('./trampoline.js').Trampoline;
var Dispatcher = require('./dispatcher.js').Dispatcher;
var MapMatcher = require('./matchMaker.js').MapMatcher;
var MFS = require('./mongofs.js').MFS;
var util = require('./util.js');
var ClusterNode = require('./cluster.js').ClusterNode;
var LookingGlassServer = require('./restful.js').LookingGlassServer;

var mappers = {mirror: require('./mirrorMapper.js'),
	       javascript: require('./jsMapper.js')};

var mongoURL = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://127.0.0.1:27017/server';
var maxVers = 2;
var trace = false;
var port = process.env.PORT || 8080;

util.seq([
    function(_) { require('mongodb').MongoClient.connect(mongoURL, _.to('db')); },
    function(_) { findNodeName(_.to('nodeName')); },
    function(_) {
        var coll = this.db.collection('storage');
        var collTracker = this.db.collection('tracker');
        var storage = new MFS(coll, {maxVers: maxVers});
//	storage = new util.TracingDispatcher(storage, 'STORAGE');
        var tracker = new MFS(collTracker, {maxVers: 1});
	var matcher = new MapMatcher(storage);
        var disp = new Dispatcher(matcher, mappers);
	if(trace) {
	    disp = new util.TracingDispatcher(disp, 'DISP');
	    tracker = new util.TracingDispatcher(tracker, 'TRACKER');
	}
	console.log('Node name: ' + this.nodeName);
	var node = new ClusterNode(disp, tracker, this.nodeName);
	console.log('Listening on port ' + port);
	var server = new LookingGlassServer(node, port);
	server.start();
    },
], function(err) {
    if(err) {
	console.error(err);
    } else {
	console.log('Server is up an running');
    }
})();

function findNodeName(callback) {
    var fs = require('fs');
    fs.stat('.nodeName', function(err) {
	if(err) {
	    var name = 'node' + util.timeUid();
	    var nameFile = fs.createWriteStream('.nodeName');
	    nameFile.end(name);
	    nameFile.on('end', function() { callback(undefined, name); });
	    nameFile.on('error', callback);
	} else {
	    var name = '';
	    var nameFile = fs.createReadStream('.nodeName');
	    nameFile.setEncoding('ascii');
	    util.seq([
		function(_) { nameFile.on('data', function(data){name += data;}); nameFile.on('end', _); nameFile.on('error', _); },
		function(_) { callback(undefined, name); },
	    ], callback)();
	}
    });
    var name = '';
}