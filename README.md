# TOC
   - [util](#util)
     - [seq(funcs, done)](#util-seqfuncs-done)
       - [_.to(names...)](#util-seqfuncs-done-_tonames)
     - [timeUid()](#util-timeuid)
     - [Encoder(allowedSpecial)](#util-encoderallowedspecial)
       - [.encode(str)](#util-encoderallowedspecial-encodestr)
       - [.decode(enc)](#util-encoderallowedspecial-decodeenc)
     - [parallel(n, callback)](#util-paralleln-callback)
     - [Worker](#util-worker)
   - [jsMapper](#jsmapper)
   - [MongoFS](#mongofs)
     - [.get(path, callback(err, file))](#mongofs-getpath-callbackerr-file)
     - [.put(path, file, callback(err))](#mongofs-putpath-file-callbackerr)
     - [.batchPut(keyVals, callback(err))](#mongofs-batchputkeyvals-callbackerr)
     - [.getDir(path, expandFiles, callback(err, content))](#mongofs-getdirpath-expandfiles-callbackerr-content)
     - [.remove(path, timestamp, callback(err))](#mongofs-removepath-timestamp-callbackerr)
     - [.createMapping(path, mapping, callback(err, actions))](#mongofs-createmappingpath-mapping-callbackerr-actions)
       - [with .put()](#mongofs-createmappingpath-mapping-callbackerr-actions-with-put)
       - [with .remove()](#mongofs-createmappingpath-mapping-callbackerr-actions-with-remove)
     - [.removeMapping(path, tsid, callback(err, actions))](#mongofs-removemappingpath-tsid-callbackerr-actions)
     - [as StorageDriver](#mongofs-as-storagedriver)
       - [.transaction(trans, callback(err, actions))](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions)
         - [get](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-get)
         - [put](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-put)
         - [map](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-map)
           - [with put](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-map-with-put)
           - [with remove](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-map-with-remove)
         - [unmap](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-unmap)
         - [remove](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-remove)
         - [getIfExists](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-getifexists)
         - [getDir](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-getdir)
         - [tsCond](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-tscond)
         - [accum](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-accum)
         - [accumReset](#mongofs-as-storagedriver-transactiontrans-callbackerr-actions-accumreset)
   - [Dispatcher](#dispatcher)
     - [.transaction(trans, callback(err, actions))](#dispatcher-transactiontrans-callbackerr-actions)
     - [.tick(path, callback(err, job))](#dispatcher-tickpath-callbackerr-job)
     - [tock(job, callback(err))](#dispatcher-tockjob-callbackerr)
     - [.start() and .stop()](#dispatcher-start-and-stop)
     - [.wait(ts, callback(err))](#dispatcher-waitts-callbackerr)
     - [mapping](#dispatcher-mapping)
   - [MirrorMapper](#mirrormapper)
<a name=""></a>
 
<a name="util"></a>
# util
<a name="util-seqfuncs-done"></a>
## seq(funcs, done)
should return a function that runs asynchronous functions in funcs in order.

```js
var d;
var f = util.seq([
    function(_) {d = done; setTimeout(_, 10);},
    function(_) {d();}
], function() {});
f();
```

should handle errors by calling done with the error.

```js
util.seq([
    function(_) {_(new Error('someError'));},
    function(_) {assert(0, 'This should not be called'); _()}
], function(err) { assert.equal(err.message, 'someError'); done(); })();
```

should handle exceptions thrown by functions by calling done with the exception.

```js
util.seq([
    function(_) { throw new Error('someError');},
    function(_) {assert(0, 'This should not be called'); _()}
], function(err) { assert.equal(err.message, 'someError'); done(); })();
```

should call done with no error if all is successful.

```js
util.seq([
    function(_) {setTimeout(_, 10);},
    function(_) {setTimeout(_, 10);},
    function(_) {setTimeout(_, 10);}
], done)();
```

<a name="util-seqfuncs-done-_tonames"></a>
### _.to(names...)
should return a function that places the corresponding arguments in "this" (skipping err).

```js
util.seq([
    function(_) { _.to('a', 'b', 'c')(undefined, 1, 2, 3); },
    function(_) { assert.equal(this.a, 1); _(); },
    function(_) { assert.equal(this.b, 2); _(); },
    function(_) { assert.equal(this.c, 3); _(); },
], done)();
```

<a name="util-timeuid"></a>
## timeUid()
should return a unique string.

```js
var vals = {};
for(var i = 0; i < 10000; i++) {
    var tuid = util.timeUid();
    assert.equal(typeof(tuid), 'string');
    assert(!(tuid in vals), 'Value not unique');
    vals[tuid] = 1;
}
```

should return a larger value when called over one millisecond later.

```js
var a, b;
util.seq([
    function(_) { a = util.timeUid(); setTimeout(_, 2); },
    function(_) { b = util.timeUid(); setTimeout(_, 2); },
    function(_) { assert(b > a, 'Later value is not larger than earlier'); _();},
], done)();
```

<a name="util-encoderallowedspecial"></a>
## Encoder(allowedSpecial)
<a name="util-encoderallowedspecial-encodestr"></a>
### .encode(str)
should encode str in a way that will only include letters, digits or characters from allowedSpecial.

```js
var specialChars = '!@#$%^&*()_+<>?,./~`\'"[]{}\\|';
var allowed = '_-+';
var encoder = new util.Encoder(allowed);
var enc = encoder.encode('abc' + specialChars + 'XYZ');
for(var i = 0; i < specialChars.length; i++) {
    if(allowed.indexOf(specialChars.charAt(i)) != -1) continue; // Ignore allowed characters
    assert.equal(enc.indexOf(specialChars.charAt(i)), -1);
}
```

should throw an exception if less than three special characters are allowed.

```js
assert.throws(function() {
    util.encode('foo bar', '_+');
}, 'at least three special characters must be allowed');
```

<a name="util-encoderallowedspecial-decodeenc"></a>
### .decode(enc)
should decode a string encoded with .encode().

```js
var encoder = new util.Encoder(allowed);
var str = 'This is a test' + specialChars + ' woo hoo\n';
assert.equal(encoder.decode(encoder.encode(str)), str);
```

<a name="util-paralleln-callback"></a>
## parallel(n, callback)
should return a callback function that will call "callback" after it has been called n times.

```js
var c = util.parallel(100, done);
for(var i = 0; i < 200; i++) {
    setTimeout(c, 20);
}
```

should call the callback immediately with an error if an error is given to the parallel callback.

```js
var c = util.parallel(4, function(err) {
    assert(err, 'This should fail');
    done();
});
c();
c();
c(new Error('Some error'));
c(); // This will not call the callback
```

<a name="util-worker"></a>
## Worker
should call a given function iteratively, in given intervals, until stopped.

```js
var n = 0;
function f(callback) {
    n++;
    callback();
}
var worker = new util.Worker(f, 10 /*ms intervals*/);
worker.start();
setTimeout(util.protect(done, function() {
    worker.stop();
    assert(n >= 9 && n <= 11, 'n should be 10 +- 1 (' + n + ')');
    done();
}), 100);
```

should assure that no more than a given number of instances of the function are running at any given time.

```js
var n = 0;
function f(callback) {
    n++;
    setTimeout(callback, 50); // Each run will take 50 ms
}
var worker = new util.Worker(f, 10 /*ms intervals*/, 2 /* instances in parallel */);
worker.start();
setTimeout(util.protect(done, function() {
    worker.stop();
    // Two parallel 50 ms instances over 100 ms gives us 4 instances.
    assert(n >= 3 && n <= 5, 'n should be 4 +- 1 (' + n + ')');
    done();
}), 100);
```

<a name="jsmapper"></a>
# jsMapper
should receive a javascript function as the mapping's "func" field and call it with the entry as its "this".

```js
mappingFunction = function() {
    this.beenHere = true;
}
var mapping = {func: mappingFunction.toString()};
jsMapper.map({
    type: 'map',
    mapping: mapping,
    content: {foo: 'bar'},
    path: '/a/b/c',
}, function(err, list) {
    assert(mapping.beenHere, 'indication that the mapping function has been executed');
    done();
});
```

should pass the function the path and the content to be mapped.

```js
mappingFunction = function(path, content) {
    this.path = path;
    this.content = content;
}
var mapping = {func: mappingFunction.toString()};
jsMapper.map({
    type: 'map',
    mapping: mapping,
    content: {foo: 'bar'},
    path: '/a/b/c',
}, function(err, list) {
    assert.equal(mapping.path, '/a/b/c');
    assert.equal(mapping.content.foo, 'bar');
    done();
});
```

should provide an emit() function that contributes content actions to the output.

```js
mappingFunction = function(path, content) {
    emit('/foo/bar', {foo: 'bar'});
    emit('/a/b/c/d', {abc: 123});
}
var mapping = {func: mappingFunction.toString()};
jsMapper.map({
    type: 'map',
    mapping: mapping,
    content: {foo: 'bar'},
    path: '/a/b/c',
}, function(err, list) {
    assert.equal(list.length, 2);
    assert.equal(list[0].type, 'content');
    assert.equal(list[0].path, '/foo/bar');
    assert.equal(list[0].content.foo, 'bar');
    assert.equal(list[1].type, 'content');
    assert.equal(list[1].path, '/a/b/c/d');
    assert.equal(list[1].content.abc, 123);
    done();
});
```

<a name="mongofs"></a>
# MongoFS
should retrieve the value with the highest _ts value.

```js
util.seq([
    function(_) {mfs.put('/some/path/to/doc', {foo: 'bar', _ts: '01000'}, _); },
    function(_) {mfs.put('/some/path/to/doc', {foo: 'baz', _ts: '03000'}, _); },
    function(_) {mfs.put('/some/path/to/doc', {foo: 'bat', _ts: '02000'}, _); },
    function(_) {
        mfs.get('/some/path/to/doc', protect(done, function(err, file) {
            assert.equal(file.foo, 'baz');
            _();
        }));
    }
], done)();
```

should support any kind of characters in paths, with the exception that slash (/) and star (*).

```js
var path = '/!@#/$%^/&()/-=+_/,.?<>';
util.seq([
    function(_) { mfs.put(path, {foo: 'bar'}, _); },
    function(_) { mfs.get(path, _.to('content')); },
    function(_) { assert.equal(this.content.foo, 'bar'); _(); },
], done)();
```

<a name="mongofs-getpath-callbackerr-file"></a>
## .get(path, callback(err, file))
should retrieve the value of a file.

```js
mfs.get('/hello/a', protect(done, function(err, result) {
    assert.equal(result.foo, 'bar');
    done();
}));
```

should retrieve the last value in the array, regardless of the _ts value.

```js
mfs.get('/hello/b', protect(done, function(err, result) {
    assert.equal(result.value, 'last');
    done();
}));
```

<a name="mongofs-putpath-file-callbackerr"></a>
## .put(path, file, callback(err))
should write a file so that get() retrieves it.

```js
mfs.put('/hello/world', {hello: 'world'}, protect(done, function(err) {
    mfs.get('/hello/world', protect(done, function(err, file) {
        assert.equal(file.hello, 'world', done);
        done();
    }));
}));
```

should assign a timestamp to a file if one is not provided.

```js
mfs.put('/hello/file', {key: 123}, protect(done, function(err) {
    mfs.get('/hello/file', protect(done, function(err, file) {
        var ts = file._ts;
        assert(ts, 'file timestamp');
        var now = util.timeUid();
        assert(now > ts, 'now > ts');
        done();
    }));
}));
```

should reflect the provided timestamp if one is given.

```js
mfs.put('/hello/someOtherFile', {foo: 'bar', _ts: '0100'}, protect(done, function(err) {
    mfs.get('/hello/someOtherFile', protect(done, function(err, file) {
        assert.equal(file._ts, '0100');
        done();
    }));
}));
```

<a name="mongofs-batchputkeyvals-callbackerr"></a>
## .batchPut(keyVals, callback(err))
should put files for all key/value pairs in the given object.

```js
var valuesToInsert = {'/a/b/c': {foo:'bar'}, '/g/h': {hello: 'world'}, '/tee/pee': {a: 1, b: 2, _ts: '0800'}};
mfs.batchPut(valuesToInsert, protect(done, function(err) {
    mfs.get('/a/b/c', protect(done, function(err, file) {
        assert.equal(file.foo, 'bar');
        mfs.get('/g/h', protect(done, function(err, file) {
            assert.equal(file.hello, 'world');
            mfs.get('/tee/pee', protect(done, function(err, file) {
                assert.equal(file.b, 2);
                done();
            }));
        }));
    }));
}));
```

<a name="mongofs-getdirpath-expandfiles-callbackerr-content"></a>
## .getDir(path, expandFiles, callback(err, content))
should retrieve the names of all files and sub-dirs in the directory.

```js
mfs.getDir('/a/', false, protect(done, function(err, content) {
    assert(content['b/'], 'b/');
    assert(content['j/'], 'j/');
    done();
}));
```

should retrieve the values of all files in the directory, if expandFiles is set to true.

```js
mfs.getDir('/a/b/', true, protect(done, function(err, content) {
    assert.equal(content.c.a, 1);
    assert.equal(content.d.a, 2);
    assert.equal(content.e.a, 3);
    done();
}));
```

<a name="mongofs-removepath-timestamp-callbackerr"></a>
## .remove(path, timestamp, callback(err))
should remove a file of the given path.

```js
mfs.remove('/file/to/delete', undefined, protect(done, function(err) {
    mfs.get('/file/to/delete', util.shouldFail(done, 'File should not exist', function(err) {
        assert(err.fileNotFound, 'File should not exist');
        done();
    }));
}));
```

sould remove a file only if the removal timestamp is greater than the latest.

```js
mfs.remove('/file/to/delete', 900, protect(done, function(err) {
    mfs.get('/file/to/delete', protect(done, function(err, value) {
        assert.equal(value.foo, 'bar');
        done();
    }));
}));
```

<a name="mongofs-createmappingpath-mapping-callbackerr-actions"></a>
## .createMapping(path, mapping, callback(err, actions))
should add an entry in the ".m" sub-document of the directory.

```js
mfs.createMapping('/a/b/', {map: 123}, protect(done, function(err, actions) {
    coll.find({_id: '/a/b/'}).toArray(protect(done, function(err, array) {
        assert.equal(array.length, 1);
        assert(array[0].m, 'mapping sub-doc must exist');
        for(var key in array[0].m) {
            // This should be the only one...
            assert.equal(array[0].m[key].map, 123);
        }
        done();
    }));
}));
```

should emit actions including the mapping for all files in the directory.

```js
mfs.createMapping('/a/b/', {map: 123}, protect(done, function(err, actions) {
    var mappings = actionsToMappings(actions);
    assert(mappings['map:/a/b/c'], 'Valid mapping for /a/b/c');
    assert(mappings['map:/a/b/d'], 'Valid mapping for /a/b/d');
    assert(mappings['map:/a/b/e'], 'Valid mapping for /a/b/e');
    done();
}));
```

should emit actions so that when sending the "tramp" actions back, we get mappings for all files in the sub-tree.

```js
mfs.createMapping('/a/b/', {map: 123}, protect(done, function(err, actions) {
    trampoline(mfs, actions, protect(done, function(err, actions) {
        var mappings = actionsToMappings(actions);
        assert(mappings['map:/a/b/c'], 'Valid mapping for /a/b/c');
        assert(mappings['map:/a/b/d'], 'Valid mapping for /a/b/d');
        assert(mappings['map:/a/b/e'], 'Valid mapping for /a/b/e');
        assert(mappings['map:/a/b/f/g'], 'Valid mapping for /a/b/f/g');
        done();
    }));
}));
```

should work whether or not the directory already exists.

```js
mfs.createMapping('/qwe/rty/', {foo: 'bar'}, protect(done, function(err, actions) {
    mfs.put('/qwe/rty/uio', {baz: 'bat'}, protect(done, function(err, actions2) {
        assert.equal(actions2.length, 1);
        assert.equal(actions2[0].type, 'map');
        assert.equal(actions2[0].mapping.foo, 'bar');
        assert.equal(actions2[0].path, '/qwe/rty/uio');
        done();
    }));
}));
```

<a name="mongofs-createmappingpath-mapping-callbackerr-actions-with-put"></a>
### with .put()
should cause subsequent calls to .put() emit the mapping for the new object.

```js
mfs.put('/a/b/g', {a:7}, protect(done, function(err, actions) {
    for(var i = 0; i < actions.length; i++) {
        if(actions[i].type == 'map' && 
            actions[i].mapping.map == 333 && 
            actions[i].path == '/a/b/g') {
            return done();
        }
    }
    done(new Error('Could not find action relating to this mapping. Found: ' + JSON.stringify(actions)));
}));
```

should cause put() that overrides an existing value provide mapping for the new value and unmapping for the old one.

```js
util.seq([
    function(_) { mfs.put('/x?/y', {value: 'old'}, _); },
    function(_) { mfs.createMapping('/x?/', {map: 1}, _.to('actions')); },
    function(_) { trampoline(mfs, this.actions, _); },
    function(_) { setTimeout(_, 2); },
    function(_) { mfs.put('/x?/y', {value: 'new'}, _.to('actions')); },
    function(_) {
        var mappings = actionsToMappings(this.actions);
        assert(mappings['map:/x?/y'], 'New value mapped');
        assert.equal(mappings['map:/x?/y'].content.value, 'new');
        assert(mappings['unmap:/x?/y'], 'Old value unmapped');
        assert.equal(mappings['unmap:/x?/y'].content.value, 'old');
        _();
    },
], done)();
```

<a name="mongofs-createmappingpath-mapping-callbackerr-actions-with-remove"></a>
### with .remove()
should emit unmapping of the removed content.

```js
mfs.remove('/a/b/c', undefined, protect(done, function(err, actions){
    assert(actions.length >= 1, 'there should be at least one unmap');
    for(var i = 0; i < actions.length; i++) {
        assert.equal(actions[i].type, 'unmap');
        assert.equal(actions[i].path, '/a/b/c');
    }
    done();
}));
```

<a name="mongofs-removemappingpath-tsid-callbackerr-actions"></a>
## .removeMapping(path, tsid, callback(err, actions))
should remove the mapping with tsid from path, and produce actions to undo its effect.

```js
util.seq([
    function(_) { mfs.removeMapping('/e/f!/', mapping._ts, _.to('actions')); },
    function(_) { trampoline(mfs, this.actions, _.to('actions')); },
    function(_) { 
        var mapping = actionsToMappings(this.actions);
        assert(mapping['unmap:/e/f!/g'], 'unmap:/e/f!/g');
        assert(mapping['unmap:/e/f!/h'], 'unmap:/e/f!/h');
        assert(mapping['unmap:/e/f!/i/j'], 'unmap:/e/f!/i/j');
        assert(mapping['unmap:/e/f!/i/k'], 'unmap:/e/f!/i/k');
        _();
    },
], done)();
```

<a name="mongofs-as-storagedriver"></a>
## as StorageDriver
should support any kind of characters in paths, with the exception that slash (/) and star (*).

```js
var path = '/!@#/$%^/&(){}/-=+_/';
var fileName = ',.?<>[]';
var put = {};
put[fileName] = {foo: 'bar'};
util.seq([
    function(_) { driver.transaction({path: path, put: put}, _); },
    function(_) { driver.transaction({path: path, get: [fileName]}, _.to('actions')); },
    function(_) { assert.equal(actionsToContent(this.actions, path + fileName).foo, 'bar'); _(); },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions"></a>
### .transaction(trans, callback(err, actions))
should allow for multiple get and put operations to be performed atomically.

```js
driver.transaction({
    path: '/a/b/',
    get: ['c', 'd'],
    put: {c: {x:3}, d: {x:4}}
}, util.protect(done, function(err, actions) {
    var contentMap = actionsToContentMap(actions);
    // The values received from the 'get' operation are from before the transaction.
    assert.equal(contentMap['/a/b/c'].x, 1);
    assert.equal(contentMap['/a/b/d'].x, 2);
    driver.transaction({
        path: '/a/b/',
        get: ['c', 'd']
    }, util.protect(done, function(err, actions) {
        var contentMap = actionsToContentMap(actions);
        assert.equal(contentMap['/a/b/c'].x, 3);
        assert.equal(contentMap['/a/b/d'].x, 4);
        // The new values have the same timestamp.
        assert.equal(contentMap['/a/b/c']._ts, contentMap['/a/b/d']._ts);
        done();
    }));
}));
function actionsToContentMap(results) {
    var contentMap = {}
    for(var i = 0; i < results.length; i++) {
        if(results[i].type == 'content') {
            contentMap[results[i].path] = results[i].content;
        }
    }
    return contentMap;
}
```

should retrieve the value with the highest _ts value.

```js
util.seq([
    function(_) {driver.transaction({path: '/some/path/to/', put:{doc: {foo: 'bar'}}, _ts: '01000'}, _); },
    function(_) {driver.transaction({path: '/some/path/to/', put:{doc: {foo: 'baz'}}, _ts: '03000'}, _); },
    function(_) {driver.transaction({path: '/some/path/to/', put:{doc: {foo: 'bat'}}, _ts: '02000'}, _); },
    function(_) {driver.transaction({path: '/some/path/to/', get:['doc']}, _.to('actions')); },
    function(_) {
        driver.get('/some/path/to/doc', util.protect(done, function(err, file) {
            assert.equal(file.foo, 'baz');
            _();
        }));
    }
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-get"></a>
#### get
should retrieve the value of a file.

```js
function actionsToContent(actions, path) {
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'content');
    assert.equal(actions[0].path, path);
    return actions[0].content;
}
driver.transaction({path: '/Hello/', get: ['a']}, util.protect(done, function(err, actions) {
    var content = actionsToContent(actions, '/Hello/a');
    assert.equal(content.foo, 'bar');
    done();
}));
```

should retrieve the latest version prior to the transaction timestamp if one is stored.

```js
driver.transaction({_ts: '02500', path:'/bank1/account/', get: ['me']}, util.protect(done, function(err, actions) {
        var content = actionsToContent(actions, '/bank1/account/me');
        assert.equal(actions[0].content.amount, 200); // Before the 03000 ts
        done();
}));
```

should retrieve the earliest stored version if latest prior to ts is not stored.

```js
driver.transaction({_ts: '01500', path:'/bank1/account/', get: ['me']}, util.protect(done, function(err, actions) {
        var content = actionsToContent(actions, '/bank1/account/me');
        assert.equal(actions[0].content.amount, 200); // We only save two versions
        done();
}));
```

should not find the file if it was created past the transaction ts, as long as enough versions are stored.

```js
util.seq([
    function(_) { driver.transaction({_ts: '02000', path: '/some/thing/new/', put:{foo: {bar: 'baz'}}}, _); },
    function(_) { driver.transaction({_ts: '01000', path: '/some/thing/new/', get: ['foo']}, _); },
    function(_) {
        done(new Error('File should not have been found'));
    }
], function(err) {
    assert(err.fileNotFound, 'File should not have been found');
    done();
})();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-put"></a>
#### put
should write a file so that "get" retrieves it.

```js
util.seq([
    function(_) { driver.transaction({path: '/Hello/', put: {world: {x: 123}}}, _); },
    function(_) { driver.transaction({path: '/Hello/', get: ['world']}, _.to('actions')); },
    function(_) { 
        var content = actionsToContent(this.actions, '/Hello/world');
        assert.equal(content.x, 123);
        _();
    },
], done)();
```

should assign a timestamp to a file if one is not provided.

```js
var before = util.timeUid();
util.seq([
    function(_) { setTimeout(_, 2); },
    function(_) { driver.transaction({path: '/Hello/', put: {file: {x: 444}}}, _); },
    function(_) { driver.transaction({path: '/Hello/', get: ['file']}, _.to('actions')); },
    function(_) { setTimeout(_, 2); },
    function(_) { 
        var after = util.timeUid();
        var content = actionsToContent(this.actions, '/Hello/file');
        assert(content._ts > before, '_ts > before');
        assert(content._ts < after, '_ts < after');
        _();
    },
], done)();
```

should reflect the provided timestamp if one is given.

```js
util.seq([
    function(_) { driver.transaction({path: '/Hello/', put: {someOtherFile: {foo: 'bar'}}, _ts: '0100'}, _); },
    function(_) { driver.transaction({path: '/Hello/', get: ['someOtherFile']}, _.to('actions')); },
    function(_) { 
        var content = actionsToContent(this.actions, '/Hello/someOtherFile');
        assert.equal(content._ts, '0100');
        _();
    },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-map"></a>
#### map
should emit actions including the mapping for all files in the directory.

```js
driver.transaction({path: '/a/b/', map: {foo: 'bar'}}, util.protect(done, function(err, actions) {
    var mappings = actionsToMappings(actions);
    assert(mappings['map:/a/b/c'], 'Valid mapping for /a/b/c');
    assert(mappings['map:/a/b/d'], 'Valid mapping for /a/b/d');
    assert(mappings['map:/a/b/e'], 'Valid mapping for /a/b/e');
    assert.equal(mappings['map:/a/b/c'].mapping.foo, 'bar');
    done();
}));
function actionsToMappings(actions) {
    var mappings = {};
    for(var i = 0; i < actions.length; i++) {
        var action = actions[i];
        mappings[action.type + ':' + action.path] = action;
    }
    return mappings;
}
```

should emit actions so that when sending the "tramp" actions back, we get mappings for all files in the sub-tree.

```js
driver.transaction({path: '/a/b/', map: {foo: 'bar'}}, util.protect(done, function(err, actions) {
    trampoline(driver, actions, util.protect(done, function(err, actions) {
        var mappings = actionsToMappings(actions);
        assert(mappings['map:/a/b/c'], 'Valid mapping for /a/b/c');
        assert(mappings['map:/a/b/d'], 'Valid mapping for /a/b/d');
        assert(mappings['map:/a/b/e'], 'Valid mapping for /a/b/e');
        assert(mappings['map:/a/b/f/g'], 'Valid mapping for /a/b/f/g');
        assert.equal(mappings['map:/a/b/f/g'].mapping.foo, 'bar');
        done();
    }));
}));
```

should work whether or not the directory already exists.

```js
util.seq([
    function(_) { driver.transaction({path: '/Qwe/rty/', map: {foo: 'bar'}}, _); },
    function(_) { driver.transaction({path: '/Qwe/rty/', put: {uio: {baz: 'bat'}}}, _.to('actions2')); },
    function(_) {
        assert.equal(this.actions2.length, 1);
        assert.equal(this.actions2[0].type, 'map');
        assert.equal(this.actions2[0].mapping.foo, 'bar');
        assert.equal(this.actions2[0].path, '/Qwe/rty/uio');
        done();
    },
], done)();
```

should propagate to future subdirectories.

```js
util.seq([
    function(_) { driver.transaction({path: '/QWe/rty/', map: {foo: 'bar'}}, _.to('rawActions1')); },
    function(_) { trampoline(driver, this.rawActions1, _.to('actions1')); },
    function(_) { driver.transaction({path: '/QWe/rty/abc/', put: {uio: {baz: 'bat'}}}, _.to('rawActions2')); },
    function(_) { trampoline(driver, this.rawActions2, _.to('actions2')); },
    function(_) {
        var actions = this.actions1.concat(this.actions2);
        assert.equal(actions.length, 1);
        assert.equal(actions[0].type, 'map');
        assert.equal(actions[0].mapping.foo, 'bar');
        assert.equal(actions[0].path, '/QWe/rty/abc/uio');
        done();
    },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-map-with-put"></a>
##### with put
should cause subsequent puts emit the mapping for the new object.

```js
driver.transaction({path: '/a/b/', put: {g: {a:7}}}, util.protect(done, function(err, actions) {
    for(var i = 0; i < actions.length; i++) {
        if(actions[i].type == 'map' && 
            actions[i].mapping.map == 333 && 
            actions[i].path == '/a/b/g') {
            return done();
        }
    }
    done(new Error('Could not find action relating to this mapping. Found: ' + JSON.stringify(actions)));
}));
```

should cause puts that overrides an existing value provide mapping for the new value and unmapping for the old one.

```js
util.seq([
    function(_) { driver.transaction({path: '/x?/', put:{y: {value: 'old'}}}, _); },
    function(_) { driver.transaction({path: '/x?/', map:{map: 1}}, _.to('actions')); },
    function(_) { trampoline(driver, this.actions, _); },
    function(_) { setTimeout(_, 2); },
    function(_) { driver.transaction({path: '/x?/', put:{y: {value: 'new'}}}, _.to('actions')); },
    function(_) {
        var mappings = actionsToMappings(this.actions);
        assert(mappings['map:/x?/y'], 'New value mapped');
        assert.equal(mappings['map:/x?/y'].content.value, 'new');
        assert(mappings['unmap:/x?/y'], 'Old value unmapped');
        assert.equal(mappings['unmap:/x?/y'].content.value, 'old');
        _();
    },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-map-with-remove"></a>
##### with remove
should emit unmapping of the removed content.

```js
driver.transaction({path: '/a/b/', remove: ['c']}, util.protect(done, function(err, actions){
    assert(actions.length >= 1, 'there should be at least one unmap');
    for(var i = 0; i < actions.length; i++) {
        assert.equal(actions[i].type, 'unmap');
        assert.equal(actions[i].path, '/a/b/c');
    }
    done();
}));
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-unmap"></a>
#### unmap
should remove the mapping with ts from path, and produce actions to undo its effect.

```js
util.seq([
    function(_) { driver.transaction({path: '/e/f!/', unmap: [mapping._ts]}, _.to('actions')); },
    function(_) { trampoline(driver, this.actions, _.to('actions')); },
    function(_) { 
        var mappings = actionsToMappings(this.actions);
        assert(mappings['unmap:/e/f!/g'], 'unmap:/e/f!/g');
        assert(mappings['unmap:/e/f!/h'], 'unmap:/e/f!/h');
        assert(mappings['unmap:/e/f!/i/j'], 'unmap:/e/f!/i/j');
        assert(mappings['unmap:/e/f!/i/k'], 'unmap:/e/f!/i/k');
        _();
    },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-remove"></a>
#### remove
should remove a file of the given path.

```js
util.seq([
    function(_) { driver.transaction({path: path, remove:['delete']}, _); },
    function(_) { driver.transaction({path: path, get:['delete']}, util.shouldFail(done, 'File should not exist', function(err) {
        assert(err.fileNotFound, 'File should not exist');
        _();
    })); },
], done)();
```

should remove a file only if the removal timestamp is greater than the latest.

```js
util.seq([
    function(_) { driver.transaction({path: path, remove: ['delete'], _ts: '00900'}, _); },
    function(_) { driver.transaction({path: path, get:['delete']}, _.to('actions')); },
    function(_) { assert.equal(actionsToContent(this.actions, path + 'delete').foo, 'bar'); _(); },
], done)();
```

should provide unmapping for them for each mapping that exists.

```js
driver.transaction({path: path + 'foo/', remove: ['bar']}, util.protect(done, function(err, actions) {
    assert(actions.length >= 1, 'there should be at least one result');
    var found = false;
    for(var i = 0; i < actions.length; i++) {
        assert.equal(actions[i].type, 'unmap');
        assert.equal(actions[i].path, path + 'foo/bar');
        if(actions[i].mapping.m == 7) {
            found = true;
        }
        assert.equal(actions[i].content.baz, 'bat');
    }
    assert(found, 'Should find the mapping');
    done();
}));
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-getifexists"></a>
#### getIfExists
should emit content actions only for the files that exist in the list.

```js
driver.transaction({path: '/a/b/', getIfExists: ['c', 'doesNotExist']}, util.protect(done, function(err, actions) {
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'content');
    assert.equal(actions[0].path, '/a/b/c');
    assert.equal(actions[0].content.x, 1);
    done();
}));
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-getdir"></a>
#### getDir
should emit dir actions for all files in the directory.

```js
driver.transaction({path: '/a/b/', getDir: {}}, util.protect(done, function(err, actions) {
    var dir = {};
    for(var i = 0; i < actions.length; i++) {
        if(actions[i].type == 'dir') {
            dir[actions[i].path] = 1;
        }
    }
    assert(dir['/a/b/c'], '/a/b/c should exist');
    assert(dir['/a/b/d'], '/a/b/d should exist');
    done();
}));
```

should behave properly when used in conjunction with get.

```js
driver.transaction({path: '/a/b/', getDir: {}, get: ['d']}, util.protect(done, function(err, actions) {
    var dir = actionsToDir(actions);
    assert(dir['/a/b/c'], '/a/b/c should exist');
    assert(dir['/a/b/d'], '/a/b/d should exist');
    done();
}));
function actionsToDir(actions) {
    var dir = {};
    for(var i = 0; i < actions.length; i++) {
        if(actions[i].type == 'dir') {
            dir[actions[i].path] = 1;
        }
    }
    return dir;
}
```

should emit content entries with file contents when using the expandFiles option.

```js
driver.transaction({path: '/a/b/', getDir: {expandFiles:1}}, util.protect(done, function(err, actions) {
    var dir = {};
    for(var i = 0; i < actions.length; i++) {
        if(actions[i].type == 'content') {
            dir[actions[i].path] = actions[i].content;
        }
    }
    assert.equal(dir['/a/b/c'].x, 1);
    assert.equal(dir['/a/b/d'].x, 2);
    done();
}));
```

should not emit files that have been deleted.

```js
util.seq([
    function(_) { driver.transaction({path: '/foo/bar', put:{baz:{x:2}}}, _); },
    function(_) { driver.transaction({path: '/foo/bar', remove:['baz']}, _); },
    function(_) { driver.transaction({path: '/foo/bar', getDir:{}}, _.to('dir')); },
    function(_) { assert.equal(this.dir.length, 0); _(); },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-tscond"></a>
#### tsCond
should cause the transaction to be canceled if one of the given files does not have the corresponding ts value.

```js
util.seq([
    function(_) { driver.transaction({path: '/a/b/', tsCond: {c: 'wrongTS'}, put: {Y:{foo: 'bar'}}}, _); },
    function(_) { driver.transaction({path: '/a/b/', getDir: {}}, _.to('actions')); },
    function(_) {
        var dir = actionsToDir(this.actions);
        assert(!dir['/a/b/Y'], 'Y should not be created because the timestamp for c is wrong');
        _();
    },
], done)();
```

should allow the transaction to happen if the timestamps are accurate.

```js
util.seq([
    function(_) { driver.transaction({path: '/a/b/', get: ['c']}, _.to('c')); },
    function(_) { driver.transaction({path: '/a/b/', tsCond: {c: this.c[0].content._ts}, put: {Y:{foo: 'bar'}}}, _); },
    function(_) { driver.transaction({path: '/a/b/', getDir: {}}, _.to('actions')); },
    function(_) {
        var dir = actionsToDir(this.actions);
        assert(dir['/a/b/Y'], 'Y should be created because c has the correct timestamp');
        _();
    },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-accum"></a>
#### accum
should create files containing numbers, when given names that do not exist.

```js
util.seq([
    function(_) { driver.transaction({path: '/a/b/', accum: {num:3, ber:6}}, _); },
    function(_) { driver.transaction({path: '/a/b/', accum: {num:0, ber:0}}, _.to('actions')); },
    function(_) {
        assert.equal(this.actions.length, 2);
        assert.equal(this.actions[0].type, 'content');
        assert.equal(this.actions[0].path, '/a/b/num');
        assert.equal(this.actions[0].content, 3);
        assert.equal(this.actions[1].type, 'content');
        assert.equal(this.actions[1].path, '/a/b/ber');
        assert.equal(this.actions[1].content, 6);
        _();
    },
], done)();
```

should add the given number to each file, and emit the previous value.

```js
util.seq([
    function(_) { driver.transaction({path: '/a/b/', accum: {num:4, ber:-2}}, _.to('before')); },
    function(_) { driver.transaction({path: '/a/b/', accum: {num:0, ber:0}}, _.to('after')); },
    function(_) {
        assert.equal(this.before.length, 2);
        assert.equal(this.before[0].path, '/a/b/num');
        assert.equal(this.before[0].content, 3);
        assert.equal(this.before[1].path, '/a/b/ber');
        assert.equal(this.before[1].content, 6);
        assert.equal(this.after.length, 2);
        assert.equal(this.after[0].path, '/a/b/num');
        assert.equal(this.after[0].content, 7);
        assert.equal(this.after[1].path, '/a/b/ber');
        assert.equal(this.after[1].content, 4);
        _();
    },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-actions-accumreset"></a>
#### accumReset
should reset the given accumulators, so that subsequent reads receive 0.

```js
util.seq([
    function(_) { driver.transaction({path: '/a/b/', accum: {NUM:3, BER:6}}, _); },
    function(_) { driver.transaction({path: '/a/b/', accumReset: ['NUM']}, _.to('resetActions')); },
    function(_) { driver.transaction({path: '/a/b/', accum: {NUM:0, BER:0}}, _.to('actionsAfterReset')); },
    function(_) {
        assert.equal(this.resetActions.length, 1);
        assert.equal(this.resetActions[0].path, '/a/b/NUM');
        assert.equal(this.resetActions[0].content, 3);
        assert.equal(this.actionsAfterReset.length, 2);
        assert.equal(this.actionsAfterReset[0].path, '/a/b/NUM');
        assert.equal(this.actionsAfterReset[0].content, 0);
        assert.equal(this.actionsAfterReset[1].path, '/a/b/BER');
        assert.equal(this.actionsAfterReset[1].content, 6);
        _();
    },
], done)();
```

<a name="dispatcher"></a>
# Dispatcher
<a name="dispatcher-transactiontrans-callbackerr-actions"></a>
## .transaction(trans, callback(err, actions))
should handle transactions that do not require futher action by forwaring them to storage.

```js
util.seq([
    function(_) { disp.transaction({_ts: '01000', path:'/a/b/', put:{c:{a:1}, d:{a:2}}}, _.to('put1')); },
    function(_) { assert.deepEqual(this.put1, []); _();},
    function(_) { disp.transaction({_ts: '01001', path:'/a/b/e/', put:{f:{a:3}, g:{a:4}}}, _.to('put2')); },
    function(_) { assert.deepEqual(this.put2, []); _();},
    function(_) { storage.transaction({path:'/a/b/', get:['c', 'd']}, _.to('actions')); },
    function(_) { assert.deepEqual(this.actions, [
        {type: 'content', path: '/a/b/c', content: {a:1, _ts: '01000'}},
        {type: 'content', path: '/a/b/d', content: {a:2, _ts: '01000'}},
    ]); _();},
    function(_) { storage.transaction({path:'/a/b/e/', get:['f', 'g']}, _.to('actions')); },
    function(_) { assert.deepEqual(this.actions, [
        {type: 'content', path: '/a/b/e/f', content: {a:3, _ts: '01001'}},
        {type: 'content', path: '/a/b/e/g', content: {a:4, _ts: '01001'}},
    ]); _();},
], done)();
```

should write actions that require further treatment to the tracker, in a path provided by the scheduler.

```js
util.seq([
    function(_) { disp.transaction({_ts: '01000', path:'/a/b/', put:{c:{a:1}, d:{a:2}}}, _); },
    function(_) { disp.transaction({_ts: '01001', path:'/a/b/e/', put:{f:{a:3}, g:{a:4}}}, _); },
    function(_) { disp.transaction({path: '/a/b/', map: {m:1}}, _.to('mapActions')); },
    function(_) { assert.deepEqual(this.mapActions, []); _(); },
    function(_) { tracker.transaction({
        path: scheduler.getPath(), // We use a scheduler that always returns the same path
        getDir:{expandFiles:1}}, 
        _.to('actions')); },
    function(_) {
        var mappings = {};
        for(var i = 0; i < this.actions.length; i++) {
            if(this.actions[i].type != 'content') continue;
            var content = this.actions[i].content;
            if(content.type == 'map') {
                assert.equal(content.mapping.m, 1);
            } else {
                assert.equal(content.map.m, 1);
            }
            mappings[content.type + ':' + content.path] = content;
        }
        assert(mappings['tramp:/a/b/e/'], 'tramp:/a/b/e/');
        assert(mappings['map:/a/b/c'], 'map:/a/b/c');
        assert(mappings['map:/a/b/d'], 'map:/a/b/d');
        _();
    },
], done)();
```

<a name="dispatcher-tickpath-callbackerr-job"></a>
## .tick(path, callback(err, job))
should select a pending task from the tracker, mark it in progress and emit it in the callback.

```js
util.seq([
    function(_) { disp.tick(thePath, _.to('job')); },
    function(_) { tracker.transaction({path: thePath, getDir: {}}, _.to('dir')); },
    function(_) {
        var inProgress = 0;
        for(var i = 0; i < this.dir.length; i++) {
            var entry = this.dir[i];
            assert.equal(entry.type, 'dir');
            if(entry.path == thePath + '^' + this.job.name) {
                inProgress++;
            }
        }
        assert.equal(inProgress, 1);
        _();
    },
], done)();
```

should select a different job on each call.

```js
var jobs = {};
var test = function(done) {
    util.seq([
        function(_) { disp.tick(thePath, _.to('job')); },
        function(_) {
            assert(this.job, 'A job must be found');
            assert(!jobs[this.job.name], 'Each job must be unique');
            jobs[this.job.name] = 1;
            _();
        },
    ], done)();
}
var c = util.parallel(3, done);
test(c);
test(c);
test(c);
```

should emit undefined as a job if no job is found.

```js
disp.tick('/wrong/path/', util.protect(done, function(err, job) {
    assert(!job, 'No job should be emitted');
    done();
}));
```

should take the path from the scheduler if not provided.

```js
disp.tick(undefined, util.protect(done, function(err, job) {
    assert(job, 'Found job');
    done();
}));
```

<a name="dispatcher-tockjob-callbackerr"></a>
## tock(job, callback(err))
should perform the given job.

```js
util.seq([
    // Initially we should have a tramp action for propagating the mapping to /a/b/e/
    // waiting to be picked up.
    function(_) { disp.tick(undefined, _.to('job')); },
    function(_) { disp.tock(this.job, _); },
    // Now the action should be removed, and instead we should have mapping actions for
    // /a/b/e/f and /a/b/e/g
    function(_) { tracker.transaction({path: thePath, getDir: {expandFiles:1}}, _.to('dir')); },
    function(_) {
        var dir = {};
        var count = 0;
        for(var i = 0; i < this.dir.length; i++) {
            if(this.dir[i].type != 'content') continue;
            var content = this.dir[i].content;
            if(typeof(content) != 'object') continue;
            count++;
            assert.equal(content.type, 'map');
            assert.equal(content.mapping.m, 1);
            dir[content.path] = content.content;
        }
        assert.equal(count, 2);
        assert.deepEqual(dir['/a/b/e/f'], {a:3, _ts:'01001'});
        assert.deepEqual(dir['/a/b/e/g'], {a:4, _ts:'01001'});
        _();
    },
], done)();
```

<a name="dispatcher-start-and-stop"></a>
## .start() and .stop()
should cause the dispatcher to automatically take tasks and execute them.

```js
disp.start();
util.seq([
    function(_) { this.tracking = disp.transaction({path: '/a/b/', map: {m:1}}, _); },
    function(_) { disp.wait(this.tracking, _); },
    function(_) { storage.transaction({path:'/a/b/e/', put:{h:{a:5}}}, _.to('actions')); },
    function(_) {
        assert.equal(this.actions.length, 1);
        assert.equal(this.actions[0].type, 'map');
        assert.equal(this.actions[0].path, '/a/b/e/h');
        assert.equal(this.actions[0].content.a, 5);
        assert.equal(this.actions[0].mapping.m, 1);
        disp.stop();
        _();
    },
], done)();
```

<a name="dispatcher-waitts-callbackerr"></a>
## .wait(ts, callback(err))
should trigger the callback after all work related to this ts has been complete.

```js
util.seq([
    function(_) { this.trackMap = disp.transaction({
        _ts: '01002',
        path:'/a/b/', 
        map:{_mapper: 'http://localhost:12345/mirror', origPath: '/a/b/', newPath: '/P/Q/'},
    }, _); },
    function(_) { disp.wait(this.trackMap, _); }, // Let the mapping propagate
    function(_) { this.trackPut = disp.transaction({_ts: '01003', path:'/a/b/h/', put:{i:{a:5}}}, _); },
    function(_) { disp.wait(this.trackPut, _); }, // Let the new value get mapped
    function(_) { disp.transaction({path: '/P/Q/h/', get:['i']}, _.to('i')); },
    function(_) {
        assert.equal(this.i.length, 1);
        assert.equal(this.i[0].content.a, 5);
        _();
    },
], done)();
```

<a name="dispatcher-mapping"></a>
## mapping
should handle map operations with _mapping fields containing HTTP URLs by redirecting them to RESTful mappers.

```js
util.seq([
    function(_) { this.tracker = disp.transaction({
        path:'/a/b/', 
        map:{_mapper: 'http://localhost:12345/mirror', origPath: '/a/b/', newPath: '/P/Q/'},
    }, _); },
    function(_) { disp.wait(this.tracker, _); }, // Let the mapping propagate
    function(_) { disp.transaction({path: '/P/Q/', get:['c']}, _.to('c')); },
    function(_) { disp.transaction({path: '/P/Q/e/', get:['g']}, _.to('g')); },
    function(_) {
        assert.equal(this.c.length, 1);
        assert.equal(this.c[0].content.a, 1);
        assert.equal(this.g.length, 1);
        assert.equal(this.g[0].content.a, 4);
        _();
    },
], done)();
```

should handle map operations with _mapping="mirror" by mirrorring data.

```js
util.seq([
    function(_) { this.tracker = disp.transaction({
        path:'/a/b/', 
        map:{_mapper: 'mirror', origPath: '/a/b/', newPath: '/P/Q/'},
    }, _); },
    function(_) { disp.wait(this.tracker, _); }, // Let the mapping propagate
    function(_) { disp.transaction({path: '/P/Q/', get:['c']}, _.to('c')); },
    function(_) { disp.transaction({path: '/P/Q/e/', get:['g']}, _.to('g')); },
    function(_) {
        assert.equal(this.c.length, 1);
        assert.equal(this.c[0].content.a, 1);
        assert.equal(this.g.length, 1);
        assert.equal(this.g[0].content.a, 4);
        _();
    },
], done)();
```

should handle unmap operations by removing mirrored data.

```js
util.seq([
    function(_) { this.tracker = disp.transaction({
        path:'/a/b/', 
        map:{_mapper: 'mirror', origPath: '/a/b/', newPath: '/P/Q/'},
    }, _); },
    function(_) { disp.wait(this.tracker, _); }, // Let the mapping propagate
    function(_) { disp.transaction({path: '/P/Q/', get:['c']}, _.to('c')); },
    function(_) { disp.transaction({path: '/P/Q/e/', get:['g']}, _.to('g')); },
    function(_) {
        assert.equal(this.c.length, 1);
        assert.equal(this.c[0].content.a, 1);
        assert.equal(this.g.length, 1);
        assert.equal(this.g[0].content.a, 4);
        _();
    },
    function(_) { this.track = disp.transaction({path: '/a/b/', remove:['c']}, _.to('c')); },
    function(_) { disp.wait(this.track, _); },
    function(_) { disp.transaction({path: '/P/Q/', getIfExists:['c']}, _.to('c')); },
    function(_) {
        assert.equal(this.c.length, 0); // 'c' does not exist anymore
        _();
    },
], done)();
```

should support the javascript mapper.

```js
util.seq([
    function(_) { this.mapTracker = disp.transaction({
        path:'/text/',
        map:{
            _mapper: 'http://localhost:12345/javascript',
            func: (function(path, content) {
                if(content[this.field]) {
                    var text = content[this.field];
                    var hash = encodeURIComponent(path);
                    var words = text.split(/[ \t]+/);
                    for(var i = 0; i < words.length; i++) {
                        emit('/searchIdx/' + words[i] + '/' + hash, {_link: path});
                    }
                }
            }).toString(),
            field: 'desc',
        },
    }, _); },
    function(_) { this.putTracker = disp.transaction({path: '/text/', put:{
        a: {desc: 'the first letter in the alphabet'},
        b: {desc: 'the second letter in the alphabet'},
        z: {desc: 'the last letter in the alphabet'},
    }}, _); },
    function(_) { disp.wait(this.mapTracker, _); },
    function(_) { disp.wait(this.putTracker, _); },
    function(_) { disp.transaction({path:'/searchIdx/first/', getDir:{expandFiles:1}}, _.to('first')); },
    function(_) {
        for(var i = 0; i < this.first.length; i++) {
            if(this.first[i].type == 'content') {
                assert.equal(this.first[0].content._link, '/text/a');
            }
        }
        _();
    },
    function(_) { disp.transaction({path:'/searchIdx/alphabet/', getDir:{}}, _.to('alphabet')); },
    function(_) {
        assert.equal(this.alphabet.length, 3); // All three files
        _();
    },
    function(_) { this.removeTracker = disp.transaction({path: '/text/', remove: ['a']}, _); },
    function(_) { disp.wait(this.removeTracker, _); },
    function(_) { disp.transaction({path:'/searchIdx/first/', getDir:{}}, _.to('first')); },
    function(_) { disp.transaction({path:'/searchIdx/alphabet/', getDir:{}}, _.to('alphabet')); },
    function(_) {
        assert.equal(this.first.length, 0); // "a" has been deleted
        assert.equal(this.alphabet.length, 2);
        _();
    },
], done)();
```

<a name="mirrormapper"></a>
# MirrorMapper
should returns content objects identical to the source, except changing the path.

```js
util.seq([
    function(_) { util.httpJsonReq('POST', 'http://localhost:' + port + '/mirror', {
        type: 'map',
        mapping: {origPath: '/a/b/', newPath: '/X/Y/'},
        path: '/a/b/c/d',
        content: {foo: 'bar'},
    }, _.to('status', 'headers', 'response')); },
    function(_) {
        assert.equal(this.status, 200);
        assert.equal(this.headers['content-type'], 'application/json');
        assert.equal(this.response.length, 1);
        assert.equal(this.response[0].type, 'content');
        assert.equal(this.response[0].path, '/X/Y/c/d');
        assert.equal(this.response[0].content.foo, 'bar');
        _();
    },
], done)();
```

