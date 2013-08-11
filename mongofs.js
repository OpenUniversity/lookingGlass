function MFS(coll) {
	this.coll = coll;
}

MFS.prototype.get = function(path, callback) {
	var splitPath = path.split('/');
	var fileName = splitPath[splitPath.length - 1];
	var dirPath = splitPath.slice(0, splitPath.length - 1).join('/') + '/';
	var proj = {};
	proj[fileName] = {$slice: -1};
	this.coll.find({_id: dirPath}).toArray(function(err, docs) {
		if(err) return callback(err);
		callback(undefined, docs[0][fileName][0]);
	});
}

exports.MFS = MFS;

