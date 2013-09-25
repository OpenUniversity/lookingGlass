var util = require('../util.js');
var host = process.argv[2] || 'localhost:8080';

function followersTweets(path, content) {
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
    if(!followee) return;
    emit('/tweet/' + followee + '/' + follower + '.map', {
	_mapper: 'javascript',
	func: mapTweet.toString(),
	follower: follower,
    });
    emit('/timeline/' + followee + '/' + follower + '.isFollowing.json', {
	type: 'is-following',
	who: follower,
    });
}
createMapFile('/followers/tweet.map', followersTweets);

function tweetText(path, content) {
    var splitPath = path.split('/');
    var sender = splitPath[2];
    emit('/text/' + sender + '/' + content._ts + '.json', {text: content.text, 
							   path: path, 
							   content: content,
							   type: 'tweet-search-result',
							   user: sender});
}
createMapFile('/tweet/tweetText.map', tweetText);

function profileText(path, content) {
    var user = (new RegExp('^/profile/(.*)\\.json$')).exec(path)[1];
    if(!user) return;
    emit('/text/' + user + '/' + content._ts + '.json', {
	text: user + ';' + content.realName + ';' + content.aboutMe, 
	path: path,
	content: content,
	type: 'profile-search-result',
	user: user});
}
createMapFile('/profile/profileText.map', profileText);

function keywords(path, content) {
    var keywords = content.text.toLowerCase().split(/[^a-z]+/);
    for(var i = 0; i < keywords.length; i++) {
	var keyword = keywords[i];
	if(!keyword) continue;
	var summaryFrom = Math.max(i - 3, 0);
	var summaryTo = Math.min(i + 3, keywords.length);
	var summary = keywords.slice(summaryFrom, summaryTo).join(' ');
	var result = {path: content.path, 
		      summary: summary, 
		      type: content.type,
		      user: content.user};
	for(var key in content.content) {
	    result[key] = content.content[key];
	}
	emit('/keywords/' + keyword + '/' + content._ts + '.json', result);
    }
}
createMapFile('/text/keywords.map', keywords);

function createMapFile(path, func) {
    util.httpJsonReq('PUT', 'http://' + host + path, {_mapper: 'javascript', func: func.toString()}, function(err) {
	if(err) console.error(err);
	else console.log('done');
    });
}
