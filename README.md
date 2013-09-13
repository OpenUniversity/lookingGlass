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
     - [GrowingInterval](#util-growinginterval)
   - [jsMapper](#jsmapper)
   - [MapMatcher](#mapmatcher)
     - [put](#mapmatcher-put)
     - [remove](#mapmatcher-remove)
   - [MongoFS](#mongofs)
     - [as StorageDriver](#mongofs-as-storagedriver)
       - [.transaction(trans, callback(err, result))](#mongofs-as-storagedriver-transactiontrans-callbackerr-result)
         - [get](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-get)
         - [put](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-put)
         - [remove](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-remove)
         - [getIfExists](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-getifexists)
         - [getLatest](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-getlatest)
         - [tsCond](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-tscond)
         - [accum](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-accum)
         - [accumReset](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-accumreset)
   - [Dispatcher](#dispatcher)
     - [transaction(trans, callback(err, result))](#dispatcher-transactiontrans-callbackerr-result)
     - [dispatch(task, callback(err, tasks))](#dispatcher-dispatchtask-callbackerr-tasks)
       - [transaction](#dispatcher-dispatchtask-callbackerr-tasks-transaction)
       - [map](#dispatcher-dispatchtask-callbackerr-tasks-map)
       - [unmap](#dispatcher-dispatchtask-callbackerr-tasks-unmap)
   - [ClusterNode](#clusternode)
     - [transaction(trans, callback(err, result))](#clusternode-transactiontrans-callbackerr-result)
     - [start()](#clusternode-start)
     - [wait(tracking, callback(err))](#clusternode-waittracking-callbackerr)
   - [Trampoline](#trampoline)
     - [transaction](#trampoline-transaction)
     - [dispatch](#trampoline-dispatch)
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
    map: mapping,
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
    map: mapping,
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
    map: mapping,
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

<a name="mapmatcher"></a>
# MapMatcher
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

<a name="mapmatcher-put"></a>
## put
should add a _tasks entry to the result, containing a list of mappings.

```js
util.seq([
		// Adding a .map file to a directory.
		function(_) { mm.transaction({path: '/a/b/', put: {'foo.map': {m:1}}, _ts: '0100'}, _); },
		// Adding a .json file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'bar.json': {x:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'map',                  // A mapping
			 path: '/a/b/bar.json',        // Path to the .json file
			 map: {m:1, _ts: '0100'},      // The content of the .map file
			 content: {x:1, _ts: '0101'},  // The content of the .json file
			 _ts: '0101X',                 // The timestamp of the transaction triggerring the mapping   
			                               // with an X suffix, to make it just one bit later than the
			                               // unmapping transactions
			}
		    ]);
		    _();
		},
], done)();
```

should add a mapping entry for each .map file in the directory when adding a .json file.

```js
util.seq([
		// Adding three .map file to a directory.
		function(_) { mm.transaction({path: '/a/b/', put: {'1.map': {m:1}, '2.map': {m:2}, '3.map': {m:3}}, _ts: '0100'}, _); },
		// Adding a .json file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'x.json': {x:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'map', path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:1, _ts: '0100'}, _ts: '0101X'},
			{type: 'map', path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:2, _ts: '0100'}, _ts: '0101X'},
			{type: 'map', path: '/a/b/x.json', content: {x:1, _ts: '0101'}, map: {m:3, _ts: '0100'}, _ts: '0101X'},
		    ]);
		    _();
		},
], done)();
```

should add a mapping entry for each .json file in the directory when adding a .map file.

```js
util.seq([
		// Adding three .json files
		function(_) { mm.transaction({path: '/a/b/', put: {'1.json': {x:1}, '2.json': {x:2}, '3.json': {x:3}}, _ts: '0100'}, _); },
		// Adding a .map file and collecing the result
		function(_) { mm.transaction({path: '/a/b/', put: {'m..map': {m:1}}, _ts: '0101'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'map', path: '/a/b/1.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0101'}, _ts: '0101X'},
			{type: 'map', path: '/a/b/2.json', content: {x:2, _ts: '0100'}, map: {m:1, _ts: '0101'}, _ts: '0101X'},
			{type: 'map', path: '/a/b/3.json', content: {x:3, _ts: '0100'}, map: {m:1, _ts: '0101'}, _ts: '0101X'},
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

should create a .d entry in the parent directory if the directory is new.

```js
util.seq([
		function(_) { mm.transaction({path: '/new/dir/', put: {a:{}}, _ts: '0100'}, _.to('result')); },
		function(_) { trampoline(this.result._tasks, _); },
		function(_) { mm.transaction({path: '/new/', get: ['dir.d']}, _); },
], done)();
```

should create a task for each subdirectory, to propagate .map files up.

```js
util.seq([
		function(_) { mm.transaction({path: '/a/b/c/', put: {g:{}, h:{}}, _ts: '0098'}, _.to('c')); },
		function(_) { trampoline(this.c._tasks, _); },
		function(_) { mm.transaction({path: '/a/b/d/', put: {g:{}, h:{}}, _ts: '0099'}, _.to('d')); },
		function(_) { trampoline(this.d._tasks, _); },
		function(_) { mm.transaction({path: '/a/b/', put: {'foo.map':{m:1}}, _ts: '0100'}, _.to('result')); },
		function(_) { assert.deepEqual(this.result._tasks, [
		    {type: 'transaction', path: '/a/b/c/', put: {'foo.map': {m:1, _ts:'0100'}}, _ts: '0100'},
		    {type: 'transaction', path: '/a/b/d/', put: {'foo.map': {m:1, _ts:'0100'}}, _ts: '0100'},
		]); _(); },
		
], done)();
function trampoline(input, callback) {
		if(!input || !input.length) {
		    return callback();
		}
		assert.equal(input[0].type, 'transaction');
		mm.transaction(input[0], util.protect(callback, function(err, result) {
		    var next = input.slice(1);
		    if(result._tramp) next = next.concat(result._tasks);
		    trampoline(next, callback);
		}));
}
```

should create a task for propagating .map files to a new directory when a .d file is added.

```js
util.seq([
		function(_) { mm.transaction({path: '/a/b/', put: {'foo.map':{m:1}, 'bar.map': {m:2}}, _ts: '0100'}, _); },
		function(_) { mm.transaction({path: '/a/b/', put: {'c.d': {}}, _ts: '0101'}, _.to('result')); },
		function(_) { assert.deepEqual(this.result._tasks, [
		    {type: 'transaction', path: '/a/b/c/', put: {'bar.map': {m:2, _ts: '0100'}}, _ts: '0100'},
		    {type: 'transaction', path: '/a/b/c/', put: {'foo.map': {m:1, _ts: '0100'}}, _ts: '0100'},
		]); _(); },
		
], done)();
```

should create an unmap task for the old content of a file when modifying an existing .json file.

```js
util.seq([
		// Create the initial content and two .map files
		function(_) { mm.transaction({path:'/a/b/', put:{'a.json': {x:1}, 'b.map': {m:1}, 'c.map': {m:2}}, _ts: '0100'}, _); },
		// Modify the .json file
		function(_) { mm.transaction({path: '/a/b/', put:{'a.json': {x:2}}, _ts: '0200'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			// Unmap old content (b.map)
			{type: 'unmap', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0100'}, _ts: '0200'},
			// Map new content (b.map)
			{type: 'map', path: '/a/b/a.json', content: {x:2, _ts: '0200'}, map: {m:1, _ts: '0100'}, _ts: '0200X'},
			// c.map
			{type: 'unmap', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:2, _ts: '0100'}, _ts: '0200'},
			{type: 'map', path: '/a/b/a.json', content: {x:2, _ts: '0200'}, map: {m:2, _ts: '0100'}, _ts: '0200X'},
		    ]);
		    _();
		},
], done)();
```

should create an unmap task for the old content of a file when modifying an existing .map file.

```js
util.seq([
		// Create the initial content and .map file
		function(_) { mm.transaction({path:'/a/b/', put:{'a.json': {x:1}, 'b.json': {x:2}, 'c.map': {m:1}}, _ts: '0100'}, _); },
		// Modify the .map file
		function(_) { mm.transaction({path: '/a/b/', put:{'c.map': {m:2}}, _ts: '0200'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			// Unmap old content (a.json)
			{type: 'unmap', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0100'}, _ts: '0200'},
			// Map new content (a.json)
			{type: 'map', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:2, _ts: '0200'}, _ts: '0200X'},
			// b.json
			{type: 'unmap', path: '/a/b/b.json', content: {x:2, _ts: '0100'}, map: {m:1, _ts: '0100'}, _ts: '0200'},
			{type: 'map', path: '/a/b/b.json', content: {x:2, _ts: '0100'}, map: {m:2, _ts: '0200'}, _ts: '0200X'},
		    ]);
		    _();
		},
], done)();
```

should support the case where the .map and .json files are introduced in order opposite to their timestamps.

```js
util.seq([
		function(_) { mm.transaction({path: '/a/b/', put: {'a.json': {x:1}}, _ts: '0200'}, _); },
		function(_) { mm.transaction({path: '/a/b/', put: {'b.map': {m:1}}, _ts: '0100'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			// The timestamp is a combination of the future .json file and the new .map file
			{type: 'map', path: '/a/b/a.json', content: {x:1, _ts: '0200', _future: true}, map: {m:1, _ts: '0100'}, _ts: '02000100X'},
		    ]); _();
		},
		
], done)();
```

<a name="mapmatcher-remove"></a>
## remove
should create an unmap task for each removed .json file, for each existing .map file.

```js
util.seq([
		function(_) { mm.transaction({path: '/a/b/', put: {'a.json': {x:1}, 'b.map': {m:1}}, _ts: '0100'}, _); },
		function(_) { mm.transaction({path: '/a/b/', remove: ['a.json'], _ts: '0200'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'unmap', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0100'}, _ts: '0200'}
		    ]);
		    _();
		},
], done)();
```

should create an unmap task for each removed .map file, for each existing .json file.

```js
util.seq([
		function(_) { mm.transaction({path: '/a/b/', put: {'a.json': {x:1}, 'b.map': {m:1}}, _ts: '0100'}, _); },
		function(_) { mm.transaction({path: '/a/b/', remove: ['b.map'], _ts: '0200'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'unmap', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0100'}, _ts: '0200'}
		    ]);
		    _();
		},
], done)();
```

should create transaction tasks to remove .map files from child directories, when a .map file is removed.

```js
util.seq([
		function(_) { mm.transaction({path: '/a/b/c/', put: {foo: {}}, _ts: '0100'}, _.to('r1')); },
		function(_) { trampoline(this.r1._tasks, _); },
		function(_) { mm.transaction({path: '/a/b/d/', put: {foo: {}}, _ts: '0101'}, _.to('r2')); },
		function(_) { trampoline(this.r2._tasks, _); },
		function(_) { mm.transaction({path: '/a/b/', put: {'a.map': {m:1}}, _ts: '0102'}, _.to('r3')); },
		function(_) { trampoline(this.r3._tasks, _); },
		function(_) { mm.transaction({path: '/a/b/', remove: ['a.map'], _ts: '0200'}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result._tasks, [
			{type: 'transaction', path: '/a/b/c/', remove: ['a.map'], _ts: '0200'},
			{type: 'transaction', path: '/a/b/d/', remove: ['a.map'], _ts: '0200'},
		    ]);
		    _();
		},
], done)();
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

should return all files which names end with .[suffix], if given *.[suffix].

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

should not return deleted files in wildcard searches.

```js
util.seq([
			function(_) { driver.transaction({path: '/a/b/', put: {'foo().json': {x:1}, 'bar{}.json': {x:2}}}, _); },
			function(_) { driver.transaction({path: '/a/b/', remove: ['foo().json']}, _); },
			function(_) { driver.transaction({path: '/a/b/', get: ['*.json']}, _.to('result')); },
			function(_) {
			    assert(!this.result['foo().json'], 'foo().json should not be listed (it was removed)');
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

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-getlatest"></a>
#### getLatest
should return the latest version of each file, regardless of the transaction timestamp.

```js
util.seq([
			function(_) { driver.transaction({path: '/foo/bar/', put: {x: {y:1}}, _ts: '0100'}, _); },
			function(_) { driver.transaction({path: '/foo/bar/', put: {x: {y:2}}, _ts: '0200'}, _); },
			function(_) { driver.transaction({path: '/foo/bar/', getLatest: ['x'], _ts: '0150'}, _.to('result')); },
			function(_) {
			    assert.equal(this.result['x:latest'].y, 2);
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
<a name="dispatcher-transactiontrans-callbackerr-result"></a>
## transaction(trans, callback(err, result))
should proxy transactions to the underlying layer.

```js
util.seq([
		function(_) { disp.transaction({path: '/a/b/', put: {c: {x:1}}, _ts: '0100'}, _); },
		function(_) { disp.transaction({path: '/a/b/', get: ['c']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result.c, {x:1, _ts: '0100'});
		    _();
		},
], done)();
```

<a name="dispatcher-dispatchtask-callbackerr-tasks"></a>
## dispatch(task, callback(err, tasks))
<a name="dispatcher-dispatchtask-callbackerr-tasks-transaction"></a>
### transaction
should handle "transaction" tasks by performing a transaction on the storage.

```js
util.seq([
    function(_) { disp.dispatch({type: 'transaction', path: '/a/b/', put: {c: {x:1}}, _ts: '0100'}, _); },
    function(_) { storage.transaction({path: '/a/b/', get: ['c']}, _.to('result')); },
    function(_) {
	assert.deepEqual(this.result.c, {x:1, _ts: '0100'});
	_();
    },
], done)();
```

should return any further tasks.

```js
util.seq([
    function(_) { disp.dispatch({type: 'transaction', path: '/a/b/', put: {'a.json': {x:1}}, _ts: '0100'}, _); },
    function(_) { disp.dispatch({type: 'transaction', path: '/a/b/', put: {'b.map': {m:1}}, _ts: '0101'}, _.to('tasks')); },
    function(_) {
	assert.deepEqual(this.tasks, [
	    {type: 'map', path: '/a/b/a.json', content: {x:1, _ts: '0100'}, map: {m:1, _ts: '0101'}, _ts: '0101X'},
	]);
	_();
    },
], done)();
```

<a name="dispatcher-dispatchtask-callbackerr-tasks-map"></a>
### map
should be referred to the corresponding mapper, returning transactions with put operations.

```js
disp.dispatch({type: 'map',
	       path: '/a/b/c',
	       content: {foo: 'bar'},
	       map: {_mapper: 'mirror',
		     origPath: '/a/b/',
		     newPath: '/P/Q/'},
	       _ts: '0123'}, 
	      util.protect(done, function(err, tasks) {
		  assert.deepEqual(tasks, [
		      {type: 'transaction',
		       path: '/P/Q/',
		       put: {c: {foo: 'bar'}},
		       _ts: '0123'}
		  ]);
		  done();
	      }));
```

should return an accum transaction, if the mapper returns content as a number.

```js
disp.dispatch({type: 'map',
	       path: '/a/b/c',
	       content: {text: 'hello world'},
	       map: {_mapper: 'javascript',
		     func: wordCount.toString()},
	       _ts: '0123'}, 
	      util.protect(done, function(err, tasks) {
		  assert.deepEqual(tasks, [
		      {type: 'transaction',
		       path: '/wordCount/',
		       accum: {hello: 1},
		       _ts: '0123'},
		      {type: 'transaction',
		       path: '/wordCount/',
		       accum: {world: 1},
		       _ts: '0123'},
		  ]);
		  done();
	      }));
function wordCount(path, content) {
    var words = content.text.split(/[ \t]+/);
    for(var i = 0; i < words.length; i++) {
	emit('/wordCount/' + words[i], 1);
    }
}
```

<a name="dispatcher-dispatchtask-callbackerr-tasks-unmap"></a>
### unmap
should be referred to the corresponding mapper, returning transactions with remove operations.

```js
disp.dispatch({type: 'unmap',
	       path: '/a/b/c',
	       content: {foo: 'bar'},
	       map: {_mapper: 'mirror',
		     origPath: '/a/b/',
		     newPath: '/P/Q/'},
	       _ts: '0123'}, 
	      util.protect(done, function(err, tasks) {
		  assert.deepEqual(tasks, [
		      {type: 'transaction',
		       path: '/P/Q/',
		       remove: ['c'],
		       _ts: '0123'}
		  ]);
		  done();
	      }));
```

should return an accum transaction with negative increment, if the mapper returns content as a number.

```js
disp.dispatch({type: 'unmap',
	       path: '/a/b/c',
	       content: {text: 'hello world'},
	       map: {_mapper: 'javascript',
		     func: wordCount.toString()},
	       _ts: '0123'}, 
	      util.protect(done, function(err, tasks) {
		  assert.deepEqual(tasks, [
		      {type: 'transaction',
		       path: '/wordCount/',
		       accum: {hello: -1},
		       _ts: '0123'},
		      {type: 'transaction',
		       path: '/wordCount/',
		       accum: {world: -1},
		       _ts: '0123'},
		  ]);
		  done();
	      }));
```

<a name="clusternode"></a>
# ClusterNode
should support map of map scenarios.

```js
node1.start();
// We build a tweeter-like data model, with /follow/<user>/<followee> files indicating
// following relationships, /tweet/<user>/* files containing individual tweets, and
// timelines being mapped to /timeline/<user>/*
util.seq([
    function(_) { tweeterExample(node1, _); },
    function(_) { node1.transaction({path: '/timeline/alice/', get: ['*.json']}, _.to('result')); },
    function(_) {
	assert(this.result['0101.json'], 'tweet should exist');
	assert.equal(this.result['0101.json'].text, 'Hi, I\'m bob');
	assert.equal(this.result['0101.json'].from, 'bob');
	_();
    },
], done)();

function tweeterExample(node, done) {
    var mapFunction = function(path, content) {
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
    };
    util.seq([
	function(_) { node.transaction({path: '/follow/', put: {'tweet.map': {
	    _mapper: 'javascript',
	    func: mapFunction.toString(),
	}}, _ts: '0010'}, _.to('w1')); },
	function(_) { node.transaction({path: '/tweet/alice/', put: {'a.json': {text: 'Hi, I\'m alice'}}, _ts: '0100'}, _.to('w2')); },
	function(_) { node.transaction({path: '/tweet/bob/', put: {'b.json': {text: 'Hi, I\'m bob'}}, _ts: '0101'}, _.to('w3')); },
	function(_) { node.transaction({path: '/follow/alice/', put: {'bob.json': {who: 'bob'}}, _ts: '0123'}, _.to('w4')); },
	function(_) { node.wait(this.w1, _); },
	function(_) { node.wait(this.w2, _); },
	function(_) { node.wait(this.w3, _); },
	function(_) { node.wait(this.w4, _); },
    ], done)();
}
```

should unmap when a file creating a mapping, is removed.

```js
node1.start();
util.seq([
    function(_) { tweeterExample(node1, _); },
    function(_) { node1.transaction({path: '/follow/alice/', remove: ['bob.json']}, _.to('w1')); },
    function(_) { node1.wait(this.w1, _); },
    function(_) { node1.transaction({path: '/timeline/alice/', get: ['*.json']}, _.to('result')); },
    function(_) {
	assert(!this.result['0101.json'], 'Bob\'s tweet should not be found there');
	_();
    },
], done)();
```

should cover for work by the following two cluster nodes (two being configurable) in lexicographic order.

```js
node1.start(); // node3 has not be started.  It is considered to be down.
util.seq([
    function(_) { tweeterExample(node3, _); },
    function(_) { node3.transaction({path: '/follow/alice/', remove: ['bob.json']}, _.to('w1')); },
    function(_) { node1.wait(this.w1, _); },
    function(_) { node1.transaction({path: '/timeline/alice/', get: ['*.json']}, _.to('result')); },
    function(_) {
	assert(!this.result['0101.json'], 'Bob\'s tweet should not be found there');
	_();
    },
], done)();
```

should cover nodes cyclicly.

```js
node3.start(); // node1 has not be started.  It is considered to be down.
util.seq([
    function(_) { tweeterExample(node1, _); },
    function(_) { node1.transaction({path: '/follow/alice/', remove: ['bob.json']}, _.to('w1')); },
    function(_) { node3.wait(this.w1, _); },
    function(_) { node3.transaction({path: '/timeline/alice/', get: ['*.json']}, _.to('result')); },
    function(_) {
	assert(!this.result['0101.json'], 'Bob\'s tweet should not be found there');
	_();
    },
], done)();
```

<a name="clusternode-transactiontrans-callbackerr-result"></a>
## transaction(trans, callback(err, result))
should relay the transaction to the underlying storage (regardless of node).

```js
util.seq([
		function(_) { node1.transaction({path: '/a/b/', put: {'c.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { node2.transaction({path: '/a/b/', get: ['c.json']}, _.to('result')); },
		function(_) { assert.deepEqual(this.result['c.json'], {foo: 'bar', _ts: '0100'}); _(); },
], done)();
```

should write returned tasks to the tracker, in the form: /node/[nodeID]/[taskID].pending.

```js
util.seq([
		function(_) { node1.transaction({path: '/a/b/', put: {'c.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { tracker.transaction({path: '/node/node1/', get: ['*']}, _.to('result')); },
		function(_) {
		    var beenThere = false;
		    for(var key in this.result) {
			if(key.substr(key.length - 8) == '.pending') {
			    var task = this.result[key].task;
			    assert.deepEqual(task, {type: 'transaction',
						    path: '/a/',
						    put: {'b.d': {}},
						    _ts: '0100',
						    _tracking: task._tracking,
						    _id: task._id});
			    beenThere = true;
			}
		    }
		    assert(beenThere, 'should encounter a task');
		    _();
		},
], done)();
```

<a name="clusternode-start"></a>
## start()
should cause the node to automatically take .pending tasks and execute them.

```js
util.seq([
		function(_) { node1.transaction({path: '/a/b/', put: {'c.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { node1.start(); _(); },
		function(_) { setTimeout(_, 100); }, // enough time to work
		function(_) { node2.transaction({path: '/a/', get: ['b.d']}, _.to('result')); },
		function(_) { assert(this.result['b.d'], 'directory must exist'); _(); },
], done)();
```

<a name="clusternode-waittracking-callbackerr"></a>
## wait(tracking, callback(err))
should call the callback once all processing for the transaction associated with the tracking object is done.

```js
node1.start();
util.seq([
		function(_) { node1.transaction({path: '/a/', put: {'m.map': {_mapper: 'mirror',
									      origPath: '/a/',
									      newPath: '/X/Y/'}}, _ts: '0100'}, _.to('t2')); },
		function(_) { node1.transaction({path: '/a/b/', put: {'a.json': {x:1}, 'b.json': {x:2}}, _ts: '0200'}, _.to('t1')); },
		function(_) { node1.wait(this.t1, _); },
		function(_) { node1.wait(this.t2, _); },
		function(_) { node1.transaction({path: '/X/Y/b/', get: ['*.json']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result['a.json'], {x:1, _ts: '02000100X', _future: true});
		    assert.deepEqual(this.result['b.json'], {x:2, _ts: '02000100X', _future: true});
		    _();
		},
], done)();
```

<a name="trampoline"></a>
# Trampoline
<a name="trampoline-transaction"></a>
## transaction
should relay transactions to the underlying storage, and return the result.

```js
util.seq([
		function(_) { tramp.transaction({path: '/a/b/', put: {'c.json': {foo:'bar'}}, _ts: '0100'}, _); },
		function(_) { tramp.transaction({path: '/a/b/', get: ['c.json']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result['c.json'], {foo: 'bar', _ts: '0100'});
		    _();
		},
		
], done)();
```

should perform subsequent tasks before calling the callback, given the timeout is not exceeded.

```js
util.seq([
		function(_) { tramp.transaction({path: '/a/b/', put: {'a.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { tramp.transaction({path: '/a/', put: {'b.map': {_mapper: 'mirror',
										origPath: '/a/',
										newPath: '/A/'}}, _ts: '0101'}, _); },
		function(_) { tramp.transaction({path: '/A/b/', get: ['a.json']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result['a.json'], {foo: 'bar', _ts: '0101X'}); _();
		},
		
], done)();
```

should not exceed the given timeout (by too much).

```js
var shortTramp = new Trampoline(disp, 50); // only two milliseconds
function infiniteMapper(path, content) {
		// foo.json -> fooX.json
		emit(path.substr(0, path.length - 5) + 'X.json', content);
}
util.seq([
		function(_) { shortTramp.transaction({path: '/a/b/', put: {'a.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { this.startTime = (new Date()).getTime(); _(); },
		function(_) { shortTramp.transaction({path: '/a/', put: {'b.map': {_mapper: 'javascript',
										   func: infiniteMapper.toString()}}, _ts: '0101'}, _); },
		function(_) { this.endTime = (new Date()).getTime(); _(); },
		function(_) {
		    assert(this.endTime - this.startTime <= 100, 'should stop on time  (' + (this.endTime - this.startTime) + ' ms)');
		    _();
		},
		
], done)();
```

should update result._tasks so that the residual tasks can be resumed once the timeout was exceeded.

```js
var shortTramp = new Trampoline(disp, 0); // not enough time to do anything
util.seq([
		function(_) { tramp.transaction({path: '/a/b/', put: {'a.json': {foo: 'bar'}}, _ts: '0100'}, _); },
		function(_) { shortTramp.transaction({path: '/a/', put: {'b.map': {_mapper: 'mirror',
										   origPath: '/a/',
										   newPath: '/A/'}}, _ts: '0101'}, _.to('result')); },
		function(_) { var cb = util.parallel(this.result._tasks.length, _);
			      for(var i = 0; i < this.result._tasks.length; i++) {
				  tramp.dispatch(this.result._tasks[i], cb);
			      }
			    },
		
		function(_) { tramp.transaction({path: '/A/b/', get: ['a.json']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result['a.json'], {foo: 'bar', _ts: '0101X'}); _();
		},
		
], done)();
```

<a name="trampoline-dispatch"></a>
## dispatch
should relay tasks to the underlying dispatcher.

```js
util.seq([
		function(_) { tramp.dispatch({type: 'transaction', path: '/a/b/', put: {'c.json': {foo:'bar'}}, _ts: '0100'}, _); },
		function(_) { tramp.transaction({path: '/a/b/', get: ['c.json']}, _.to('result')); },
		function(_) {
		    assert.deepEqual(this.result['c.json'], {foo: 'bar', _ts: '0100'});
		    _();
		},
		
], done)();
```

should re-dispatch tasks returned from dispatched tasks, until no tasks are left, given it is done within the timeout.

```js
util.seq([
		function(_) { tramp.dispatch({type: 'transaction', path: '/a/b/', put: {'c.json': {foo:'bar'}}, _ts: '0100'}, _); },
		function(_) { tramp.transaction({path: '/a/', get: ['b.d']}, _.to('result')); },
		function(_) {
		    assert(this.result['b.d'], 'the directory entry must exist');
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
        map: {origPath: '/a/b/', newPath: '/X/Y/'},
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
should stopre JSON object so that GET can retrieve them.

```js
var URL = 'http://localhost:47837/foo/bar';
util.seq([
		function(_) { util.httpJsonReq('PUT', URL, {
		    myFoo: 'myBar',
		}, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 201); _(); },
		function(_) { util.httpJsonReq('GET', URL, undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) {
		    assert.equal(this.statusCode, 200);
		    assert.equal(this.headers['content-type'], 'application/json');
		    assert.equal(this.resp.myFoo, 'myBar');
		    _();
		},
], done)();
```

should accept data of any content type.

```js
storeFileWithContentType('text/foobar', 'foo bar foo bar foo bar', done);

function storeFileWithContentType(contentType, content, done) {
		var client = http.createClient(47837, 'localhost');
		var request = client.request('PUT', '/a/b/foo.txt', {host: 'localhost', 'content-type': contentType});
		request.end(content);
		request.on('error', done);
		request.on('response', function(resp) {
		    assert.equal(resp.statusCode, 201);
		    resp.on('end', done);
		});
}
```

<a name="lookingglass-restful-api-get"></a>
## GET
should return a status of 404 when accessing a file that does not exist.

```js
util.seq([
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/file/that/does/not/exist', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 404); _(); },
], done)();
```

should return files stored with any content type, providing the content type given at storage.

```js
util.seq([
		function(_) { storeFileWithContentType('text/foobar', 'FOO-BAR', _); },
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/a/b/foo.txt', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) {
		    assert.equal(this.statusCode, 200);
		    assert.equal(this.headers['content-type'], 'text/foobar');
		    assert.equal(this.resp, 'FOO-BAR');
		    _();
		},
], done)();
```

should retrieve the content of a directory, if the path ends with a slash.

```js
util.seq([
		function(_) { util.httpJsonReq('PUT', 'http://localhost:47837/some/dir/a', {hello: 'world'}, _); },
		function(_) { util.httpJsonReq('PUT', 'http://localhost:47837/some/dir/b', {hola: 'mondi'}, _); },
		function(_) { util.httpJsonReq('PUT', 'http://localhost:47837/some/dir/c', {shalom: 'olam'}, _); },
		function(_) { util.httpJsonReq('PUT', 'http://localhost:47837/some/dir/d', {privet: 'mir'}, _); },
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/some/dir/', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) {
		    assert.equal(this.statusCode, 200);
		    assert(this.resp.a, 'a should exist');
		    assert(this.resp.b, 'b should exist');
		    assert(this.resp.c, 'c should exist');
		    assert(this.resp.d, 'd should exist');
		    _();
		},
], done)();
```

should provide timestamps for each file when retrieving a directory.

```js
util.seq([
		function(_) { util.httpJsonReq('POST', 'http://localhost:47837/some/dir/', {put: {a: {hello: 'world'}}, _ts: "0100"}, _); },
		function(_) { util.httpJsonReq('POST', 'http://localhost:47837/some/dir/', {put: {b: {hola: 'mondi'}}, _ts: "0101"}, _); },
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/some/dir/', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) {
		    assert.equal(this.statusCode, 200);
		    assert.equal(this.resp.a, '0100');
		    assert.equal(this.resp.b, '0101');
		    _();
		},
], done)();
```

<a name="lookingglass-restful-api-delete"></a>
## DELETE
should remove a file as response to a DELETE request.

```js
util.seq([
		function(_) { util.httpJsonReq('PUT', URL, { myFoo: 'myBar'}, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 201); _(); },
		function(_) { util.httpJsonReq('DELETE', URL, undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 200); _(); },
		function(_) { util.httpJsonReq('GET', URL, undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 404); _(); },
], done)();
```

<a name="lookingglass-restful-api-post"></a>
## POST
should perform the transaction enclosed in the body of the request.

```js
util.seq([
		function(_) { util.httpJsonReq('POST', 'http://localhost:47837/some/dir/', {
		    put: {foo: {bar: 'baz'}}
		}, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 200); _(); },
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/some/dir/foo', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) {
		    assert.equal(this.statusCode, 200);
		    assert.equal(this.resp.bar, 'baz');
		    _();
		},
		function(_) { util.httpJsonReq('POST', 'http://localhost:47837/some/dir/', {
		    remove: ['foo'],
		}, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 200); _(); },
		function(_) { util.httpJsonReq('GET', 'http://localhost:47837/some/dir/foo', undefined, _.to('statusCode', 'headers', 'resp')); },
		function(_) { assert.equal(this.statusCode, 404); _(); },
], done)();
```

