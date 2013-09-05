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
         - [getDir](#mongofs-as-storagedriver-transactiontrans-callbackerr-result-getdir)
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
    function(_) { driver.transaction({_ts: '02000', path: '/some/thing/new/', put:{foo: {bar: 'baz'}}}, _); },
    function(_) { driver.transaction({_ts: '01000', path: '/some/thing/new/', get: ['foo']}, _); },
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
			function(_) { driver.transaction({path: '/a/b/', put: {'foo.json': {x:1}, 'bar.json': {x:2}}}, _); },
			function(_) { driver.transaction({path: '/a/b/', get: ['*.json']}, _.to('result')); },
			function(_) {
			    assert(!this.result.c, 'c should not be listed');
			    assert(!this.result.d, 'd should not be listed');
			    assert(this.result['foo.json'], 'foo.json should be listed');
			    assert.equal(this.result['foo.json'].x, 1);
			    assert(this.result['bar.json'], 'bar.json should be listed');
			    assert.equal(this.result['bar.json'].x, 2);
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
should emit content actions only for the files that exist in the list.

```js
driver.transaction({path: '/a/b/', getIfExists: ['c', 'doesNotExist']}, util.protect(done, function(err, result) {
    assert.equal(result.c.x, 1);
			assert(!(result.doesNotExist), 'doesNotExist should not be returned');
    done();
}));
```

<a name="mongofs-as-storagedriver-transactiontrans-callbackerr-result-getdir"></a>
#### getDir
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

