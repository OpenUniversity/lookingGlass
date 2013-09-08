var assert = require("assert");
var util = require("../util.js");

function describeStorageDriver(driverContainer) {
    var driver
    before(function() {
        driver = driverContainer.driver;
    });
    describe('as StorageDriver', function() {
        it('should support any kind of characters in paths, with the exception that slash (/) and star (*)', function(done) {
            var path = '/!@#/$%^/&(){}/-=+_/';
            var fileName = ',.?<>[]';
            var put = {};
            put[fileName] = {foo: 'bar'};
            util.seq([
                function(_) { driver.transaction({path: path, put: put}, _); },
                function(_) { driver.transaction({path: path, get: [fileName]}, _.to('result')); },
                function(_) { assert.equal(this.result[fileName].foo, 'bar'); _(); },
            ], done)();
        });
        describe('.transaction(trans, callback(err, result))', function() {
            beforeEach(function(done) {
		driver.transaction({path: '/a/b/', put: {c: {x:1}, d:{x:2}}}, done);
            });
            describe('get', function() {
                before(function(done) {
                    util.seq([
                        function(_) { driver.transaction({_ts: '01000', path:'/bank1/account/', put: {me: {amount: 100}}}, _); },
                        function(_) { driver.transaction({_ts: '02000', path:'/bank1/account/', put: {me: {amount: 200}}}, _); },
                        function(_) { driver.transaction({_ts: '03000', path:'/bank1/account/', put: {me: {amount: 300}}}, _); },
                        function(_) { driver.transaction({path:'/Hello/', put: {a: {foo: 'bar'}, b:{foo: 'baz'}}}, _); },
                    ], done)();
                });
                it('should retrieve the value of a file', function(done) {
                    driver.transaction({path: '/Hello/', get: ['a']}, util.protect(done, function(err, result) {
                        assert.equal(result.a.foo, 'bar');
                        done();
                    }));
                });
                it('should retrieve the latest version prior to the transaction timestamp if one is stored', function(done) {
                    driver.transaction({_ts: '02500', path:'/bank1/account/', get: ['me']}, util.protect(done, function(err, result) {
                            assert.equal(result.me.amount, 200); // Before the 03000 ts
                            done();
                    }));
                });
                it('should retrieve the earliest stored version if latest prior to ts is not stored', function(done) {
                    driver.transaction({_ts: '01500', path:'/bank1/account/', get: ['me']}, util.protect(done, function(err, result) {
                            assert.equal(result.me.amount, 200); // We only save two versions
                            done();
                    }));
                });
                it('should not find the file if it was created past the transaction ts, as long as enough versions are stored', function(done) {
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
                });
		it('should return all files if given *', function(done) {
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
		});
		it('should return all files which names end with .[suffix], if given *.[suffix]', function(done) {
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
		});
		it('should not return deleted files in wildcard searches', function(done) {
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
		});
            });
            describe('put', function() {
                it('should write a file so that "get" retrieves it', function(done) {
                    util.seq([
                        function(_) { driver.transaction({path: '/Hello/', put: {world: {x: 123}}}, _); },
                        function(_) { driver.transaction({path: '/Hello/', get: ['world']}, _.to('result')); },
                        function(_) { 
                            assert.equal(this.result.world.x, 123);
                            _();
                        },
                    ], done)();
                });
                it('should assign a timestamp to a file if one is not provided', function(done) {
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
                });
                it('should reflect the provided timestamp if one is given', function(done) {
                    util.seq([
                        function(_) { driver.transaction({path: '/Hello/', put: {someOtherFile: {foo: 'bar'}}, _ts: '0100'}, _); },
                        function(_) { driver.transaction({path: '/Hello/', get: ['someOtherFile']}, _.to('result')); },
                        function(_) { 
                            assert.equal(this.result.someOtherFile._ts, '0100');
                            _();
                        },
                    ], done)();
                });
            });
            it('should allow for multiple get and put operations to be performed atomically', function(done) {
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
            });
            it('should retrieve the value with the highest _ts value', function(done) {
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
            });
            describe('remove', function() {
                var path;
                beforeEach(function(done) {
                    var seed = Math.floor(Math.random() * 1000000) + '';
                    path = '/seeded/' + seed + '/';
                    util.seq([
                        function(_) { driver.transaction({path: path, put: {delete: {foo: 'bar'}}, _ts: '01000'}, _); },
                        function(_) { driver.transaction({path: path + 'foo/', put: {bar: {baz:'bat'}}, _ts: '033330'}, _); },
                        function(_) { driver.transaction({path: path + 'foo/', map: {m:7}, _ts: '033333'}, _); },
                    ], done)();
                    
                });
                it('should remove a file of the given path', function(done) {
                    util.seq([
                        function(_) { driver.transaction({path: path, remove:['delete']}, _); },
                        function(_) { driver.transaction({path: path, get:['delete']}, util.shouldFail(done, 'File should not exist', function(err) {
                            assert(err.fileNotFound, 'File should not exist');
                            _();
                        })); },
                    ], done)();
                });
                it('should remove a file only if the removal timestamp is greater than the latest', function(done) {
                    util.seq([
                        function(_) { driver.transaction({path: path, remove: ['delete'], _ts: '00900'}, _); },
                        function(_) { driver.transaction({path: path, get:['delete']}, _.to('result')); },
                        function(_) { assert.equal(this.result['delete'].foo, 'bar'); _(); },
                    ], done)();
                });
            });
            describe('getIfExists', function() {
                it('should return only the files that exist in the list', function(done) {
                    driver.transaction({path: '/a/b/', getIfExists: ['c', 'doesNotExist']}, util.protect(done, function(err, result) {
                        assert.equal(result.c.x, 1);
			assert(!(result.doesNotExist), 'doesNotExist should not be returned');
                        done();
                    }));
                });
		it('should handle wildcards, just like "get", and succeed even if a file does not exist', function(done) {
		    util.seq([
			function(_) { driver.transaction({path: '/a/b/', put: {'foo.a': {x:1}, 'bar.b': {x:2}}}, _); },
			function(_) { driver.transaction({path: '/a/b/', getIfExists: ['*.a', '*.c']}, _.to('result')); },
			function(_) {
			    assert(this.result['foo.a'], 'foo.a should be included in the results');
			    assert(!this.result['bar.b'], 'bar.b was not included in the query');
			    _();
			},
		    ], done)();
		});
            });
	    describe('getLatest', function() {
		it('should return the latest version of each file, regardless of the transaction timestamp', function(done) {
		    util.seq([
			function(_) { driver.transaction({path: '/foo/bar/', put: {x: {y:1}}, _ts: '0100'}, _); },
			function(_) { driver.transaction({path: '/foo/bar/', put: {x: {y:2}}, _ts: '0200'}, _); },
			function(_) { driver.transaction({path: '/foo/bar/', getLatest: ['x'], _ts: '0150'}, _.to('result')); },
			function(_) {
			    assert.equal(this.result['x:latest'].y, 2);
			    _();
			},
		    ], done)();
		});
	    });
            describe('tsCond', function() {
                it('should cause the transaction to be canceled if one of the given files does not have the corresponding ts value', function(done) {
                    util.seq([
                        function(_) { driver.transaction({path: '/a/b/', tsCond: {c: 'wrongTS'}, put: {Y:{foo: 'bar'}}}, _); },
                        function(_) { driver.transaction({path: '/a/b/', get: ['*']}, _.to('result')); },
                        function(_) {
                            assert(!this.result.Y, 'Y should not be created because the timestamp for c is wrong');
                            _();
                        },
                    ], done)();
                });
                it('should allow the transaction to happen if the timestamps are accurate', function(done) {
                    util.seq([
                        function(_) { driver.transaction({path: '/a/b/', get: ['c']}, _.to('c')); },
                        function(_) { driver.transaction({path: '/a/b/', tsCond: {c: this.c.c._ts}, put: {Y:{foo: 'bar'}}}, _); },
                        function(_) { driver.transaction({path: '/a/b/', get: ['*']}, _.to('result')); },
                        function(_) {
                            assert(this.result.Y, 'Y should be created because c has the correct timestamp');
                            _();
                        },
                    ], done)();
                });
            });
            describe('accum', function() {
                it('should create files containing numbers, when given names that do not exist', function(done) {
                    util.seq([
                        function(_) { driver.transaction({path: '/a/b/', accum: {num:3, ber:6}}, _); },
                        function(_) { driver.transaction({path: '/a/b/', accum: {num:0, ber:0}}, _.to('result')); },
                        function(_) {
			    assert.equal(this.result.num, 3);
			    assert.equal(this.result.ber, 6);
                            _();
                        },
                    ], done)();
                });
                it('should add the given number to each file, and emit the previous value', function(done) {
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
                });
            });
            describe('accumReset', function() {
                it('should reset the given accumulators, so that subsequent reads receive 0', function(done) {
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
                });
            });
        });
    });
}

exports.describeStorageDriver = describeStorageDriver;

