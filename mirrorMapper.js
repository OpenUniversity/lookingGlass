var http = require('http');
var util = require('./util.js');

exports.map = function(action, callback) {
    if(action.path.substr(0, action.mapping.origPath.length) == action.mapping.origPath) {
        var newPath = action.mapping.newPath + action.path.substr(action.mapping.origPath.length);
        return callback(undefined, [{type: 'content', content: action.content, path: newPath}]);
    }
    return callback(undefined, []);
}
