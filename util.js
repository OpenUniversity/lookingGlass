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

function funcCompose(f, g, obj) {
	var func = function() {
		f.call(obj, g);
	}
	return func;
}

exports.seq = function(funcs, done) {
	var obj = {};
	var f = done;
	var to = function() {
		var callback = this;
		var names = arguments;
		return function() {
			for(var i = 0; i < names.length; i++) {
				obj[names[i]] = arguments[i+1];
			}
			return callback.apply(obj, arguments);
		};
	};
	for(var i = funcs.length - 1; i >= 0; i--) {
		var newF = exports.protect(done, funcCompose(funcs[i], f, obj, []));
		newF.to = to;
		f = newF;
	}
	return f;
}

var MAX_UID = 0x100000000; // 36 bits

exports.timeUid = function() {
	var time = (new Date()).getTime().toString(16);
	var uid = Math.floor((1 + Math.random()) * MAX_UID).toString(16);
	uid = uid.substr(1); // The first character is always '1'
	return time + uid; // string concatenation
}

