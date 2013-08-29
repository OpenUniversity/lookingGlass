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
var seed = 0x1000;

exports.timeUid = function() {
	var time = (new Date()).getTime().toString(16);
	var uid = Math.floor((1 + Math.random()) * MAX_UID).toString(16);
	uid = uid.substr(1); // The first character is always '1'
	seed++;
	return time + seed + uid; // string concatenation
}


exports.Encoder = function(allowedSpecial) {
	if(allowedSpecial.length < 3) {
		throw new Error('at least three special characters must be allowed. Given: "' + allowedSpecial + '"');
	}
	function buildEscapedCharString(allowed) {
		var chars = '';
		for(var i = 0; i < 128; i++) {
			var c = String.fromCharCode(i);
			if(allowed.indexOf(c) == -1) {
				chars += c;
			}
		}
		return chars;
	}
	var regularChars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	var allowed = regularChars + allowedSpecial.substr(0, allowedSpecial.length-1);
	var escapedChars = buildEscapedCharString(allowed);
	var esc = allowedSpecial.charAt(allowedSpecial.length - 1);

	this.encode = function(str) {
		var enc = '';
		for(var i = 0; i < str.length; i++) {
			var c = str.charAt(i);
			var index = escapedChars.indexOf(c);
			if(index != -1) {
				enc += esc + allowed.charAt(index);
			} else {
				enc += c;
			}
		}
		return enc;
	}
	
	this.decode = function(str) {
		var dec = '';
		for(var i = 0; i < str.length; i++) {
			var c = str.charAt(i);
			if(c == esc) {
				i++;
				c = str.charAt(i);
				dec += escapedChars.charAt(allowed.indexOf(c));
			} else {
				dec += c;
			}
		}
		return dec;
	}
	
};
exports.parallel = function(n, callback) {
	return function(err) {
		if(err) {
			n = -1;
			callback(err);
		}
		n--;
		if(n == 0) {
			callback();
		}
	}
};

exports.Worker = function(f, interval, maxInstances) {
	var lastTime = 0;
	var running = false;
	var numInstances = 0;
	this.start = function() {
		running = true;
		tick();
	};
	var tick = function() {
		var self = this;
		while(running) {
			var timeElapsed = (new Date()).getTime() - lastTime;
			if(timeElapsed < interval) {
				setTimeout(tick, interval - timeElapsed);
				break;
			}
			lastTime = (new Date()).getTime();
			if(!maxInstances || numInstances < maxInstances) {
				numInstances++;
				f(function() {numInstances--;});
			}
		}
	};
	this.stop = function() {
		running = false;
	};
};

exports.httpJsonReq = function(method, URL, content, callback) {
	var http = require('http');
	var url = require('url');
	var parsedURL = url.parse(URL);
	var client = http.createClient(parsedURL.port, parsedURL.hostname);
	var request = client.request(method, parsedURL.path, {host: parsedURL.host});
	if(content) {
		request.end(JSON.stringify(content));
	} else {
		request.end();
	}
	request.on('error', callback);
	request.on('response', function(resp) {
		var data = '';
		resp.setEncoding('utf8');
		resp.on('data', function(chunk) {
			data += chunk;
		});
		resp.on('end', exports.protect(function() {
			callback(undefined, resp.statusCode, resp.headers, JSON.parse(data));
		}));
	});
};

