$.fn.findAll = function(selector) {
    return this.find(selector).add(this.filter(selector));
};

$(function() {
    var synchronizing = false;
    var counter = 0x10000;
    var registerContainers = function(root) {
	root.findAll('.container[data-path]').each(function() {
	    if($(this).parents('.template').length > 0) return; // Ignore containers inside templates
	    var self = $(this);
	    var interval = self.attr('data-interval') || 10000;
	    var lastChange;
	    var pathParts = getPathParts(self);
	    var path = pathParts.path;
	    var query = pathParts.query;
	    self.data('mvc', {});

	    if(!self.attr('id')) {
		self.attr('id', uniqueID());
	    }
	    
	    setInterval(fetchAndSync, interval);
	    fetchAndSync();
	    
	    function fetchAndSync() {
		var trans = {
			getIfExists: [query],
		};
		if(lastChange) {
		    trans.ifChangedSince = lastChange;
		}
		$.ajax(path, {
		    type: 'POST',
		    contentType: 'application/json',
		    data: JSON.stringify(trans),
		    success: function(data) {
			if(!data._noChangesSince) {
			    sync(data);
			    lastChange = data._lastChangeTS;
			}
		    },
		    error: function(xhr, status, err) {
			console.error(status + ': ' + err);
		    },
		});
	    }

	    function sync(data) {
		var items = 0;
		var mvc = self.data('mvc');
		synchronizing = true;
		try {
		    for(var key in mvc) {
			var remote = data[key];
			if(remote) {
			    items++;
			    var local = mvc[key].model.get();
			    if(remote._ts > local._ts || !local._ts) {
				mvc[key].model.set(remote);
			    }
			    delete data[key];
			} else {
			    mvc[key].destroy();
			}
		    }
		    for(var key in data) {
			if(typeof data[key] != 'object') continue;
			items++;
			if(!mvc) mvc = {};
			mvc[key] = wrapObject(data[key], key, self);
			$$.document.append(mvc[key], '#' + self.attr('id'));
		    }
		} catch(e) {
		    synchronizing = false;
		    throw e;
		}
		synchronizing = false;
		self.data('mvc', mvc);
		if(items) {
		    self.find('.show-if-empty').hide();
		} else {
		    self.find('.show-if-empty').show();
		}
	    }

	});
    };
    registerContainers($('body'));

    function getPathParts(self) {
	var dataPath = self.attr('data-path');
	var pathParts = (new RegExp("^(.*\/)([^/]*)$")).exec(dataPath);
	return {path: pathParts[1],
		query: pathParts[2]};
    }

    $('body').on('click', '.create[data-container]', function() {
	var containerSel = $(this).attr('data-container');
	var container = $(containerSel);
	if(container.length != 1) {
	    throw new Error('Bad container selector: ' + containerSel);
	}
	var constructor = $(this).attr('data-new') || '';
	var obj = eval('({' + constructor + '})');
	var mvc = container.data('mvc');
	var key = generateKey(getPathParts(container).query);
	mvc[key] = wrapObject(obj, key, container);
	$$.document.append(mvc[key], containerSel);
	container.find('.show-if-empty').hide();
    });

    function wrapObject(obj, key, self) {
	var type = obj.type;
	type = type || self.attr('data-type');
	type = type || 'default';
	var template = $('#' + type + '-template').html();
	var path = getPathParts(self).path;
	var controller = {
	    'change': function() {
		if(!synchronizing) updateFileOnServer(path, key, this);
		registerContainers(this.view.$());
	    },
	    'create': function() {
		if(!synchronizing) updateFileOnServer(path, key, this);
		registerContainers(this.view.$());
	    },
	    'destroy': function() {
		if(!synchronizing) deleteFileOnServer(path, key, this);
		var mvc = self.data('mvc');
		delete mvc[key];
		self.data('mvc', mvc);
		if(hasNoFields(mvc)) {
		    self.find('.show-if-empty').show();
		}
	    }
	};
	var destroyEvent = self.attr('data-remove-event') || 'click .remove';
	controller[destroyEvent] = function() { this.destroy(); };
	return $$(obj, template, controller);
    }
    
    function hasNoFields(obj) {
	for(key in obj) {
	    return false;
	}
	return true;
    }

    function updateFileOnServer(path, key, mvc) {
	var obj = mvc.model.get();
	$.ajax(path + key, {
	    type: 'PUT',
	    contentType: 'application/json',
	    data: JSON.stringify(obj),
	    error: function(xhr, text, err) {
		console.error(err + '\n' + text);
	    }
	});
    }
    function deleteFileOnServer(path, key, mvc) {
	    console.log(path);
	    console.log(key);
	$.ajax(path + key, {
	    type: 'DELETE',
	    error: function(xhr, text, err) {
		console.error(err + '\n' + text);
	    }
	});
    }

    function generateKey(str) {
	return str.replace('*', uniqueID());
    }
    function uniqueID() {
	counter++;
	return (new Date()).getTime().toString(16) + (counter.toString(16).substr(1));
    }
});

