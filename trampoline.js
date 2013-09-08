exports.Trampoline = function(disp, timeout) {
    this.transaction = function(trans, callback) {
	disp.transaction(trans, callback);
    };
};