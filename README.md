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
 
<a name="dispatcher"></a>
# Dispatcher
<a name="dispatcher-mapping"></a>
## mapping
should treat mapping results for which the path is a directory, as new mappings.

```js
// We build a tweeter-like data model, with /follow/<user>/<followee> files indicating
// following relationships, /tweet/<user>/* files containing individual tweets, and
// timelines being mapped to /timeline/<user>/*

var mapFunction = function(path, content) {
		var mapTweet = function(path, content) {
		    var splitPath = path.split('/');
		    var author = splitPath[2];
		    emit('/timeline/' + this.follower + '/' + content._ts, 
			 {text: content.text, from: author});
		};
		var splitPath = path.split('/');
		var follower = splitPath[2];
		var followee = splitPath[3];
		emit('/tweet/' + followee + '/', {
		    _mapper: 'javascript',
		    func: mapTweet.toString(),
		    follower: follower,
		});
};
util.seq([
		function(_) { this.w1 = disp.transaction({path: '/follow/', map: {
		    _mapper: 'javascript',
		    func: mapFunction.toString(),
		}}, _); },
		function(_) { this.w2 = disp.transaction({path: '/tweet/alice/', put: {a: {text: 'Hi, I\'m alice'}}}, _); },
		function(_) { this.w3 = disp.transaction({path: '/tweet/bob/', put: {b: {text: 'Hi, I\'m bob'}}}, _); },
		function(_) { this.w4 = disp.transaction({path: '/follow/alice/', put: {bob: {}}}, _); },
		function(_) { disp.wait(this.w1, _); },
		function(_) { disp.wait(this.w2, _); },
		function(_) { disp.wait(this.w3, _); },
		function(_) { disp.wait(this.w4, _); },
		function(_) { disp.transaction({path: '/timeline/alice/', getDir:{expandFiles:1}}, _.to('dir')); },
		function(_) {
		    var found = false;
		    for(var i = 0; i < this.dir.length; i++) {
			if(this.dir[i].type != 'content') continue;
			assert.equal(this.dir[i].content.text, 'Hi, I\'m bob');
			assert.equal(this.dir[i].content.from, 'bob');
			found = true;
		    }
		    assert(found, 'should find an entry in bob\'s timeline');
		    _();
		},
], done)();
```

