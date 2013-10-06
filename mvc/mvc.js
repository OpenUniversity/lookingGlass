$.fn.findAll = function(selector) {
    return this.find(selector).add(this.filter(selector));
};

$(function() {
    var synchronizing = false;
    var counter = 0x10000;
    var registerContainers = function(root) {
	root.findAll('.container[data-path]').each(function() {
	    registerContainer($(this));
	});
    };
	
    function registerContainer(self) {					   
	if(self.parents('.template').length > 0) return; // Ignore containers inside templates
	var interval = self.attr('data-interval') || 10000;
	var lastChange;
	var pathParts = getPathParts(self);
	var path = pathParts.path;
	var query = pathParts.query;
	if(self.data('mvc')) {
	    return;
	}
	self.data('mvc', {});

	if(!self.attr('id')) {
	    self.attr('id', uniqueID());
	}
	
	var intervalID = setInterval(fetchAndSync, interval);
	self.data('intervalID', intervalID);
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
			if(!jQuery.contains(document.documentElement, self[0])) return;
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

    }
    registerContainers($('body'));

    function getPathParts(self) {
	var dataPath = expandParams(self.attr('data-path'), self);
	var pathParts = (new RegExp("^(.*\/)([^/]*)$")).exec(dataPath);
	return {path: pathParts[1],
		query: pathParts[2]};
    }

    function expandParams(str, self) {
	var regex = /\{([^}]*)\}/g;
	var match = regex.exec(str);
	var rep = [];
	while(match) {
	    var expr = match[1];
	    rep.push([match[0], exprValue(expr, self)]);
	    match = regex.exec(str);
	}
	for(var i = 0; i < rep.length; i++) {
	    str = str.replace(rep[i][0], rep[i][1]);
	}
	return str;
    }

    function exprValue(expr, self) {
	var regex = /\$([a-zA-Z0-9_\-]+)/g;
	var match = regex.exec(expr);
	var rep = [];
	while(match) {
	    var argName = match[1];
	    rep.push([match[0], JSON.stringify(paramValue(argName, self))]);
	    match = regex.exec(expr);
	}
	for(var i = 0; i < rep.length; i++) {
	    expr = expr.replace(rep[i][0], rep[i][1]);
	}
	return eval('(' + expr + ')');
    }

    function paramValue(name, self) {
	var parentForms = self.parents('.form');
	for(var i = 0; i < parentForms.length; i++) {
	    var field = $(parentForms[i]).find('[data-bind=' + name + ']');
	    if(field.length) {
		return field.val() || field.html();
	    }
	}
	throw new Error('No such field: ' + name);
    }

    $('body').on('click', '.create[data-container]', function() {
	var containerSel = $(this).attr('data-container');
	var container = $(this).parents('.form, html').first().find(containerSel);
	if(container.length != 1) {
	    throw new Error('Bad container selector: ' + containerSel);
	}
	var constructor = expandParams($(this).attr('data-new') || '', $(this));
	var obj = eval('({' + constructor + '})');
	var mvc = container.data('mvc');
	var key = generateKey(getPathParts(container).query);
	mvc[key] = wrapObject(obj, key, container);
	container.find('.show-if-empty').hide();
    });

    $('body').on('click', '.refresh', function() {
	var form = $(this).parents('.form')[0];
	if(!form) return;
	$(form).find('.container').each(function() {
	    if(!jQuery.contains(document.documentElement, this)) return;
	    var container = $(this);
	    var intervalID = container.data('intervalID');
	    clearInterval(intervalID);
	    try {
		synchronizing = true;
		var mvc = container.data('mvc');
		for(key in mvc) {
		    mvc[key].destroy();
		}
		container.data('mvc', false);
		registerContainer(container);
		synchronizing = false;
	    } catch(e) {
		synchronizing = false;
		throw e;
	    }
	});
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
	var agilityObj = $$(obj, template, controller);
	$$.document.append(agilityObj, '#' + self.attr('id'));
	registerContainers(agilityObj.view.$());
	return agilityObj;
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

