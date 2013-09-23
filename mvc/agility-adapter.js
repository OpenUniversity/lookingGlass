function createSynchedContainer(templateSelector, containerSelector, path, query, options) {
    var synchronizing = false;

    var html = $(templateSelector).html();
    var container = $$({}, html, {
	'click .create': function(ev) {
	    var js = $(ev.target).attr('data-new');
	    if(!js) return;
	    var obj = eval('(' + js + ')');
	    obj._name = obj._name || randomName() + '.json';
	    this.append(wrapObject(obj, container), '.content');
	},
    });
    var syncInterval = options.syncInterval || 1000;
    setInterval(queryAndSync, syncInterval);
    $$.document.append(container, containerSelector);

    function queryAndSync() {
	$.ajax(path + query, {
	    success: function(dir) {
		synchronize(container, dir);
	    },
	    error: function(xhr, status, err) {
		console.error(status + ': ' + err);
	    },
	});
    }

    function synchronize(container, dir) {
	synchronizing = true;
	try {
	    container.each(function() {
		var local = this.model.get();
		var name = local._name;
		if(dir[name]) {
		    var remote = dir[name];
		    if(typeof(remote) != 'object') return;
		    if(remote._ts > local._ts) {
			remote._name = name;
			this.model.set(remote, {silent: true});
			this.view.sync();
		    }
		    delete dir[name];
		} else {
		    this.destroy();
		}
	    });
	    for(var name in dir) {
		var remote = dir[name];
		if(typeof(remote) != 'object') continue;
		remote._name = name;
		container.append(wrapObject(remote, container), '.content');
	    }
	} catch(e) {
	    synchronizing = false;
	    throw e;
	}
	synchronizing = false;
    }

    function wrapObject(obj, container) {
	var type = obj.type;
	type = type || container.view.$('.content').attr('data-type');
	type = type || 'default';
	var html = $('#' + type + '-template').html();
	return $$(obj, html, {
	    'click .remove': function() {
		this.destroy();
	    },
	    'change': function() {
		if(!synchronizing) updateFileOnServer(path, this);
	    },
	    'create': function() {
		if(!synchronizing) updateFileOnServer(path, this);
	    },
	    'destroy': function() {
		if(!synchronizing) deleteFileOnServer(path, this);
	    }
	});
    }

    function updateFileOnServer(path, mvc) {
	var obj = mvc.model.get();
	var name = obj._name;
	$.ajax(path + name, {
	    type: 'PUT',
	    contentType: 'application/json',
	    data: JSON.stringify(obj),
	    error: function(xhr, text, err) {
		console.error(err + '\n' + text);
	    }
	});
    }
    function deleteFileOnServer(path, mvc) {
	var obj = mvc.model.get();
	var name = obj._name;
	$.ajax(path + name, {
	    type: 'DELETE',
	    error: function(xhr, text, err) {
		console.error(err + '\n' + text);
	    }
	});
    }
    function randomName() {
	var num = Math.floor((1 + Math.random()) * 0x10000);
	return ('' + num).substr(1);
    }
}
