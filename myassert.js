var assert = require('assert');

exports.equal = function(a, b, done) {
	try {
		assert.equal(a, b);
	} catch(e) {
		done(e);
		throw e;
	}
};

exports.ifError = function(err, done) {
	try {
		return assert.ifError(err);
	} catch(e) {
		done(e);
		throw e;
	}
};
