exports.protect = function(done, func) {
	return function(err) {
		if(err) return done(err);
		try {
			return func.apply(this, arguments);
		} catch(e) {
			done(e);
			throw e;
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
