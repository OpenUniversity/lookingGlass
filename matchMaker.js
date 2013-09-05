exports.MatchMaker = function(storage) {
    this.transaction = function(trans, callback) {
	storage.transaction(trans, callback);
    };
}