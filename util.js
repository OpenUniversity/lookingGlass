exports.protect = function(done, func) {
	return function(err) {
		if(err) return done(err);
		try {
			return func.apply(this, arguments);
		} catch(e) {
			return done(e);
		}
	}
}

exports.shouldFail = function(done, desc, func) {
	return function(err) {
		if(!err) {
			return done(new Error(desc));
		}
		try {
			return func.apply(this, arguments);
		} catch(e) {
			return done(e);
		}
	}
}

function funcCompose(f, g) {
	return function() {
		f(g);
	}
}

exports.seq = function(funcs, done) {
	var f = done;
	for(var i = funcs.length - 1; i >= 0; i--) {
		f = exports.protect(done, funcCompose(funcs[i], f));
	}
	return f;
}

var MAX_UID = 0x1000000;

exports.timeUid = function() {
	var time = (new Date()).getTime().toString(16);
	var uid = Math.floor((1 + Math.random()) * MAX_UID).toString(16);
	uid = uid.substr(1); // The first character is always '1'
	return time + uid; // string concatenation
}

