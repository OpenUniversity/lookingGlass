var http = require('http');
var util = require('./util.js');

exports.map = function(action, callback) {
    if(action.path.substr(0, action.map.origPath.length) == action.map.origPath) {
        var newPath = action.map.newPath + action.path.substr(action.map.origPath.length);
        return callback(undefined, [{type: 'content', content: action.content, path: newPath}]);
    }
    return callback(undefined, []);
}
