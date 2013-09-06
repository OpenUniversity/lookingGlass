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
   - [MatchMaker](#matchmaker)
     - [put](#matchmaker-put)
   - [MongoFS](#mongofs)
     - [as StorageDriver](#mongofs-as-storagedriver)
       - [.transaction(trans, callback(err, result))](#mongofs-as-storagedriver-transactiontrans-callbackerr-result)
         - [get](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-get)
         - [put](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-put)
         - [map](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-map)
           - [with put](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-map-with-put)
           - [with remove](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-map-with-remove)
         - [unmap](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-unmap)
         - [remove](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-remove)
         - [getIfExists](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-getifexists)
         - [tsCond](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-tscond)
         - [accum](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-accum)
         - [accumReset](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-accumreset)
   - [Dispatcher](#dispatcher)
     - [.transaction(trans, callback(err, actions))](#dispatcher-transactiontrans-callbackerr-actions)
     - [.tick(path, callback(err, job))](#dispatcher-tickpath-callbackerr-job)
     - [tock(job, callback(err))](#dispatcher-tockjob-callbackerr)
     - [.start() and .stop()](#dispatcher-start-and-stop)
     - [.wait(ts, callback(err))](#dispatcher-waitts-callbackerr)
     - [mapping](#dispatcher-mapping)
   - [MirrorMapper](#mirrormapper)
   - [lookingGlass RESTful API](#lookingglass-restful-api)
     - [PUT](#lookingglass-restful-api-put)
     - [GET](#lookingglass-restful-api-get)
     - [DELETE](#lookingglass-restful-api-delete)
     - [POST](#lookingglass-restful-api-post)
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

<a name="matchmaker"></a>
# MatchMaker
should proxy transactions to the underlying storage.

```js
util.seq([
    function(_) { mm.transaction({path: '/a/b/', put:{'c.json':{x:1}}}, _); },
    function(_) { storage.transaction({path: '/a/b/', get:['*']}, _.to('result')); },
    function(_) {
	assert(this.result['c.json'], 'c.json should exist in storage');
	assert.equal(this.result['c.json'].x, 1);
	_();
    },
], done)();
```

<a name="matchmaker-put"></a>
## put
should add a _map entry to the result, containing a list of mappings.

```js
util.seq([
		// Adding a .map file to a directory, directly in storage.
		function(_) { storage.transaction({path: '/a/b/', put: {'foo.map': {m:1}}, _ts: '0100'}, _); },
		// Adding a .json file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'bar.json': {x:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert(this.result._map, 'A _map entry should be added to the result');
		    assert(Array.isArray(this.result._map), 'it should be an array');
		    assert.equal(this.result._map.length, 1, 'it should have one entry');
		    assert.equal(this.result._map[0].path, '/a/b/bar.json', 'it should indicate the path of the .json file');
		    assert.deepEqual(this.result._map[0].content, {x:1, _ts: '0101'}, 'it should have the content of the .json file');
		    assert.deepEqual(this.result._map[0].map, {m:1, _ts: '0100'}, 'and the .map file');
		    _();
		},
], done)();
```

should add a mapping entry for each .map file in the directory when adding a .json file.

```js
util.seq([
		// Adding three .map file to a directory, directly in storage.
		function(_) { storage.transaction({path: '/a/b/', put: {'1.map': {m:1}, '2.map': {m:2}, '3.map': {m:3}}, _ts: '0100'}, _); },
		// Adding a .json file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'x.json': {x:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._map, [
			{path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:1, _ts: '0100'}},
			{path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:2, _ts: '0100'}},
			{path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:3, _ts: '0100'}},
		    ]);
		    _();
		},
], done)();
```

should add a mapping entry for each .json file in the directory when adding a .map file.

```js
util.seq([
		// Adding three .json files directly in the storage
		function(_) { storage.transaction({path: '/a/b/', put: {'1.json': {x:1}, '2.json': {x:2}, '3.json': {x:3}}, _ts: '0100'}, _); },
		// Adding a .map file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'m..map': {m:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._map, [
			{path: '/a/b/1.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0101'}},
			{path: '/a/b/2.json', content: {x:2, _ts: '0100'}, map: {m:1, _ts: '0101'}},
			{path: '/a/b/3.json', content: {x:3, _ts: '0100'}, map: {m:1, _ts: '0101'}},
		    ]);
		    _();
		},
], done)();
```

should increment a counter (dir_exists) in the directory, so that it is only zero if the directory is new.

```js
util.seq([
		// If we add an element to a new directory
		function(_) { mm.transaction({path: '/new/dir/', put:{a:{}}}, _); },
		// and query its dir_exists accumulator,
		function(_) { mm.transaction({path: '/new/dir/', accum: {dir_exists:0}}, _.to('result')); },
		// we should get a value of 1, because there was one transaction on it.
		function(_) { assert.equal(this.result.dir_exists, 1); _(); },
		// If we query the accumulator on a directory that does not exist,
		function(_) { mm.transaction({path: '/new/dir2/', accum: {dir_exists:0}}, _.to('result')); },
		// we get 0
		function(_) { assert.equal(this.result.dir_exists, 0); _(); },
], done)();
```

should create a transaction entry in the _tramp field of the result to add a .d entry in the parent directory if the directory is new.

```js
util.seq([
		function(_) { mm.transaction({path: '/new/dir/', put: {a:{}}}, _.to('result')); },
		function(_) { assert.deepEqual(this.result._tramp, [
		    {path: '/new/', put: {'dir.d': {}}}
		]); _(); },
		
], done)();
```

should create a _tramp entry for each subdirectory, to propagate .map files up.

```js
util.seq([
		function(_) { mm.transaction({path: '/a/b/c/', put: {g:{}, h:{}}}, _.to('c')); },
		function(_) { trampoline(this.c._tramp, _); },
		function(_) { mm.transaction({path: '/a/b/d/', put: {g:{}, h:{}}}, _.to('d')); },
		function(_) { trampoline(this.d._tramp, _); },
		function(_) { mm.transaction({path: '/a/b/', put: {'foo.map':{m:1}}, _ts: '0100'}, _.to('result')); },
		function(_) { assert.deepEqual(this.result._tramp, [
		    {path: '/a/b/c/', put: {'foo.map': {m:1, _ts:'0100'}}, _ts: '0100'},
		    {path: '/a/b/d/', put: {'foo.map': {m:1, _ts:'0100'}}, _ts: '0100'},
		]); _(); },
		
], done)();
function trampoline(input, callback) {
		if(!input || !input.length) {
		    return callback();
		}
		mm.transaction(input[0], util.protect(callback, function(err, result) {
		    var next = input.slice(1);
		    if(result._tramp) next = next.concat(result._tramp);
		    trampoline(next, callback);
		}));
}
```

<a name="mongofs"></a>
# MongoFS
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
    function(_) { driver.transaction({path: path, get: [fileName]}, _.to('result')); },
    function(_) { assert.equal(this.result[fileName].foo, 'bar'); _(); },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result"></a>
### .transaction(trans, callback(err, result))
should allow for multiple get and put operations to be performed atomically.

```js
driver.transaction({
    path: '/a/b/',
    get: ['c', 'd'],
    put: {c: {x:3}, d: {x:4}}
}, util.protect(done, function(err, result) {
    // The values received from the 'get' operation are from before the transaction.
    assert.equal(result.c.x, 1);
    assert.equal(result.d.x, 2);
    driver.transaction({
        path: '/a/b/',
        get: ['c', 'd']
    }, util.protect(done, function(err, result) {
        assert.equal(result.c.x, 3);
        assert.equal(result.d.x, 4);
        // The new values have the same timestamp.
        assert.equal(result.c._ts, result.d._ts);
        done();
    }));
}));
```

should retrieve the value with the highest _ts value.

```js
util.seq([
    function(_) {driver.transaction({path: '/some/path/to/', put:{doc: {foo: 'bar'}}, _ts: '01000'}, _); },
    function(_) {driver.transaction({path: '/some/path/to/', put:{doc: {foo: 'baz'}}, _ts: '03000'}, _); },
    function(_) {driver.transaction({path: '/some/path/to/', put:{doc: {foo: 'bat'}}, _ts: '02000'}, _); },
    function(_) {driver.transaction({path: '/some/path/to/', get:['doc']}, _.to('result')); },
    function(_) {
        assert.equal(this.result.doc.foo, 'baz');
        _();
    }
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-get"></a>
#### get
should retrieve the value of a file.

```js
driver.transaction({path: '/Hello/', get: ['a']}, util.protect(done, function(err, result) {
    assert.equal(result.a.foo, 'bar');
    done();
}));
```

should retrieve the latest version prior to the transaction timestamp if one is stored.

```js
driver.transaction({_ts: '02500', path:'/bank1/account/', get: ['me']}, util.protect(done, function(err, result) {
        assert.equal(result.me.amount, 200); // Before the 03000 ts
        done();
}));
```

should retrieve the earliest stored version if latest prior to ts is not stored.

```js
driver.transaction({_ts: '01500', path:'/bank1/account/', get: ['me']}, util.protect(done, function(err, result) {
        assert.equal(result.me.amount, 200); // We only save two versions
        done();
}));
```

should not find the file if it was created past the transaction ts, as long as enough versions are stored.

```js
util.seq([
    function(_) { driver.transaction({_ts: '02000', path: '/some?/thing:/new!/', put:{'foo;': {bar: 'baz'}}}, _); },
    function(_) { driver.transaction({_ts: '01000', path: '/some?/thing:/new!/', get: ['foo;']}, _); },
    function(_) {
        done(new Error('File should not have been found'));
    }
], function(err) {
			try {
        assert(err.fileNotFound, 'File should not have been found');
        done();
			} catch(e) {
			    done(e);
			}
})();
```

should return all files if given *.

```js
util.seq([
			function(_) { driver.transaction({path: '/a/b/', get: '*'}, _.to('result')); },
			function(_) {
			    assert(this.result.c, 'c should be listed');
			    assert.equal(this.result.c.x, 1);
			    assert(this.result.d, 'd should be listed');
			    assert.equal(this.result.d.x, 2);
			    _();
			},
], done)();
```

should return all files which names end with .<suffix>, if given *.<suffix>.

```js
util.seq([
			function(_) { driver.transaction({path: '/a/b/', put: {'foo().json': {x:1}, 'bar{}.json': {x:2}}}, _); },
			function(_) { driver.transaction({path: '/a/b/', get: ['*.json']}, _.to('result')); },
			function(_) {
			    assert(!this.result.c, 'c should not be listed');
			    assert(!this.result.d, 'd should not be listed');
			    assert(this.result['foo().json'], 'foo().json should be listed');
			    assert.equal(this.result['foo().json'].x, 1);
			    assert(this.result['bar{}.json'], 'bar{}.json should be listed');
			    assert.equal(this.result['bar{}.json'].x, 2);
			    _();
			},
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-put"></a>
#### put
should write a file so that "get" retrieves it.

```js
util.seq([
    function(_) { driver.transaction({path: '/Hello/', put: {world: {x: 123}}}, _); },
    function(_) { driver.transaction({path: '/Hello/', get: ['world']}, _.to('result')); },
    function(_) { 
        assert.equal(this.result.world.x, 123);
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
    function(_) { driver.transaction({path: '/Hello/', get: ['file']}, _.to('result')); },
    function(_) { setTimeout(_, 2); },
    function(_) { 
        var after = util.timeUid();
        assert(this.result.file._ts > before, '_ts > before');
        assert(this.result.file._ts < after, '_ts < after');
        _();
    },
], done)();
```

should reflect the provided timestamp if one is given.

```js
util.seq([
    function(_) { driver.transaction({path: '/Hello/', put: {someOtherFile: {foo: 'bar'}}, _ts: '0100'}, _); },
    function(_) { driver.transaction({path: '/Hello/', get: ['someOtherFile']}, _.to('result')); },
    function(_) { 
        assert.equal(this.result.someOtherFile._ts, '0100');
        _();
    },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-map"></a>
#### map
<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-map-with-put"></a>
##### with put
<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-map-with-remove"></a>
##### with remove
<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-unmap"></a>
#### unmap
<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-remove"></a>
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
    function(_) { driver.transaction({path: path, get:['delete']}, _.to('result')); },
    function(_) { assert.equal(this.result['delete'].foo, 'bar'); _(); },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-getifexists"></a>
#### getIfExists
should return only the files that exist in the list.

```js
driver.transaction({path: '/a/b/', getIfExists: ['c', 'doesNotExist']}, util.protect(done, function(err, result) {
    assert.equal(result.c.x, 1);
			assert(!(result.doesNotExist), 'doesNotExist should not be returned');
    done();
}));
```

should handle wildcards, just like "get", and succeed even if a file does not exist.

```js
util.seq([
			function(_) { driver.transaction({path: '/a/b/', put: {'foo.a': {x:1}, 'bar.b': {x:2}}}, _); },
			function(_) { driver.transaction({path: '/a/b/', getIfExists: ['*.a', '*.c']}, _.to('result')); },
			function(_) {
			    assert(this.result['foo.a'], 'foo.a should be included in the results');
			    assert(!this.result['bar.b'], 'bar.b was not included in the query');
			    _();
			},
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-tscond"></a>
#### tsCond
should cause the transaction to be canceled if one of the given files does not have the corresponding ts value.

```js
util.seq([
    function(_) { driver.transaction({path: '/a/b/', tsCond: {c: 'wrongTS'}, put: {Y:{foo: 'bar'}}}, _); },
    function(_) { driver.transaction({path: '/a/b/', get: ['*']}, _.to('result')); },
    function(_) {
        assert(!this.result.Y, 'Y should not be created because the timestamp for c is wrong');
        _();
    },
], done)();
```

should allow the transaction to happen if the timestamps are accurate.

```js
util.seq([
    function(_) { driver.transaction({path: '/a/b/', get: ['c']}, _.to('c')); },
    function(_) { driver.transaction({path: '/a/b/', tsCond: {c: this.c.c._ts}, put: {Y:{foo: 'bar'}}}, _); },
    function(_) { driver.transaction({path: '/a/b/', get: ['*']}, _.to('result')); },
    function(_) {
        assert(this.result.Y, 'Y should be created because c has the correct timestamp');
        _();
    },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-accum"></a>
#### accum
should create files containing numbers, when given names that do not exist.

```js
util.seq([
    function(_) { driver.transaction({path: '/a/b/', accum: {num:3, ber:6}}, _); },
    function(_) { driver.transaction({path: '/a/b/', accum: {num:0, ber:0}}, _.to('result')); },
    function(_) {
			    assert.equal(this.result.num, 3);
			    assert.equal(this.result.ber, 6);
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
			    assert.equal(this.before.num, 3);
			    assert.equal(this.before.ber, 6);
			    assert.equal(this.after.num, 7);
			    assert.equal(this.after.ber, 4);
        _();
    },
], done)();
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-accumreset"></a>
#### accumReset
should reset the given accumulators, so that subsequent reads receive 0.

```js
util.seq([
    function(_) { driver.transaction({path: '/a/b/', accum: {NUM:3, BER:6}}, _); },
    function(_) { driver.transaction({path: '/a/b/', accumReset: ['NUM']}, _.to('resetResult')); },
    function(_) { driver.transaction({path: '/a/b/', accum: {NUM:0, BER:0}}, _.to('resultAfterReset')); },
    function(_) {
        assert.equal(this.resetResult.NUM, 3);
        assert.equal(this.resultAfterReset.NUM, 0);
        assert.equal(this.resultAfterReset.BER, 6);
        _();
    },
], done)();
```

<a name="dispatcher"></a>
# Dispatcher
<a name="dispatcher-transactiontrans-callbackerr-actions"></a>
## .transaction(trans, callback(err, actions))
<a name="dispatcher-tickpath-callbackerr-job"></a>
## .tick(path, callback(err, job))
<a name="dispatcher-tockjob-callbackerr"></a>
## tock(job, callback(err))
<a name="dispatcher-start-and-stop"></a>
## .start() and .stop()
<a name="dispatcher-waitts-callbackerr"></a>
## .wait(ts, callback(err))
<a name="dispatcher-mapping"></a>
## mapping
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

<a name="lookingglass-restful-api"></a>
# lookingGlass RESTful API
<a name="lookingglass-restful-api-put"></a>
## PUT
<a name="lookingglass-restful-api-get"></a>
## GET
<a name="lookingglass-restful-api-delete"></a>
## DELETE
<a name="lookingglass-restful-api-post"></a>
## POST
