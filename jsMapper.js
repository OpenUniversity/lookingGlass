exports.map = function(action, callback){
    var mapping = action.map;
    var actions = [];
    function emit(path, content) {
        actions.push({type: 'content', path: path, content: content});
    }
    var func = eval('(' + mapping.func + ')');
    func.call(mapping, action.path, action.content);
    callback(undefined, actions);
};
