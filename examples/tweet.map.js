var util = require('../util.js');

var map = {_mapper: 'javascript', func: mapFunc.toString()};

function mapFunc(path, content) {
    // Put followee tweets in the follower's timeline
    var mapTweet = function(path, content) {
	var splitPath = path.split('/');
	var author = splitPath[2];
	emit('/timeline/' + this.follower + '/' + content._ts + '.json', 
	     {text: content.text, from: author});
    };
    // Create a mapping for each following relationship
    var splitPath = path.split('/');
    var follower = splitPath[2];
    var followee = content.who;
    emit('/tweet/' + followee + '/' + follower + '.map', {
	_mapper: 'javascript',
	func: mapTweet.toString(),
	follower: follower,
    });
}

util.httpJsonReq('PUT', 'http://localhost:8080/followers/tweet.map', map, function(err) {
    if(err) console.error(err);
    else console.log('done');
});