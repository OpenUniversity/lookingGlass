var util = require('./util.js');

exports.map = function(action, callback) {
	var mapper = action.mapping._mapper;
	if(!mapper) return callback(undefined, []);
	if(action.mapping._mapper.substr(0, 5) != 'http:') return callback(undefined, []);
	util.httpJsonReq('POST', mapper, action, util.protect(callback, function(err, status, headers, list) {
		if(status != 200) throw new Error('Bad status from mapper: ' + status);
		callback(undefined, list);
	}));
}

