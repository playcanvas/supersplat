var DracoDecoderModule = (() => {
    var _scriptDir = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : undefined;
    if (typeof __filename !== 'undefined') _scriptDir = _scriptDir || __filename;
    return function (DracoDecoderModule = {}) {
        var Module = typeof DracoDecoderModule != 'undefined' ? DracoDecoderModule : {};
        var readyPromiseResolve, readyPromiseReject;
        Module['ready'] = new Promise((resolve, reject) => {
            readyPromiseResolve = resolve;
            readyPromiseReject = reject;
        });
        var isRuntimeInitialized = false;
        var isModuleParsed = false;
        Module['onRuntimeInitialized'] = function () {
            isRuntimeInitialized = true;
            if (isModuleParsed) {
                if (typeof Module['onModuleLoaded'] === 'function') {
                    Module['onModuleLoaded'](Module);
                }
            }
        };
        Module['onModuleParsed'] = function () {
            isModuleParsed = true;
            if (isRuntimeInitialized) {
                if (typeof Module['onModuleLoaded'] === 'function') {
                    Module['onModuleLoaded'](Module);
                }
            }
        };
        function isVersionSupported(versionString) {
            if (typeof versionString !== 'string') return false;
            const version = versionString.split('.');
            if (version.length < 2 || version.length > 3) return false;
            if (version[0] == 1 && version[1] >= 0 && version[1] <= 5) return true;
            if (version[0] != 0 || version[1] > 10) return false;
            return true;
        }
        Module['isVersionSupported'] = isVersionSupported;
        var moduleOverrides = Object.assign({}, Module);
        var arguments_ = [];
        var thisProgram = './this.program';
        var quit_ = (status, toThrow) => {
            throw toThrow;
        };
        var ENVIRONMENT_IS_WEB = typeof window == 'object';
        var ENVIRONMENT_IS_WORKER = typeof importScripts == 'function';
        var ENVIRONMENT_IS_NODE =
            typeof process == 'object' &&
            typeof process.versions == 'object' &&
            typeof process.versions.node == 'string';
        var scriptDirectory = '';
        function locateFile(path) {
            if (Module['locateFile']) {
                return Module['locateFile'](path, scriptDirectory);
            }
            return scriptDirectory + path;
        }
        var read_, readAsync, readBinary, setWindowTitle;
        if (ENVIRONMENT_IS_NODE) {
            var fs = require('fs');
            var nodePath = require('path');
            if (ENVIRONMENT_IS_WORKER) {
                scriptDirectory = nodePath.dirname(scriptDirectory) + '/';
            } else {
                scriptDirectory = __dirname + '/';
            }
            read_ = (filename, binary) => {
                filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
                return fs.readFileSync(filename, binary ? undefined : 'utf8');
            };
            readBinary = filename => {
                var ret = read_(filename, true);
                if (!ret.buffer) {
                    ret = new Uint8Array(ret);
                }
                return ret;
            };
            readAsync = (filename, onload, onerror, binary = true) => {
                filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
                fs.readFile(filename, binary ? undefined : 'utf8', (err, data) => {
                    if (err) onerror(err);
                    else onload(binary ? data.buffer : data);
                });
            };
            if (!Module['thisProgram'] && process.argv.length > 1) {
                thisProgram = process.argv[1].replace(/\\/g, '/');
            }
            arguments_ = process.argv.slice(2);
            quit_ = (status, toThrow) => {
                process.exitCode = status;
                throw toThrow;
            };
            Module['inspect'] = () => '[Emscripten Module object]';
        } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
            if (ENVIRONMENT_IS_WORKER) {
                scriptDirectory = self.location.href;
            } else if (typeof document != 'undefined' && document.currentScript) {
                scriptDirectory = document.currentScript.src;
            }
            if (_scriptDir) {
                scriptDirectory = _scriptDir;
            }
            if (scriptDirectory.indexOf('blob:') !== 0) {
                scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, '').lastIndexOf('/') + 1);
            } else {
                scriptDirectory = '';
            }
            {
                read_ = url => {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', url, false);
                    xhr.send(null);
                    return xhr.responseText;
                };
                if (ENVIRONMENT_IS_WORKER) {
                    readBinary = url => {
                        var xhr = new XMLHttpRequest();
                        xhr.open('GET', url, false);
                        xhr.responseType = 'arraybuffer';
                        xhr.send(null);
                        return new Uint8Array(xhr.response);
                    };
                }
                readAsync = (url, onload, onerror) => {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', url, true);
                    xhr.responseType = 'arraybuffer';
                    xhr.onload = () => {
                        if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
                            onload(xhr.response);
                            return;
                        }
                        onerror();
                    };
                    xhr.onerror = onerror;
                    xhr.send(null);
                };
            }
            setWindowTitle = title => (document.title = title);
        } else {
        }
        var out = Module['print'] || console.log.bind(console);
        var err = Module['printErr'] || console.warn.bind(console);
        Object.assign(Module, moduleOverrides);
        moduleOverrides = null;
        if (Module['arguments']) arguments_ = Module['arguments'];
        if (Module['thisProgram']) thisProgram = Module['thisProgram'];
        if (Module['quit']) quit_ = Module['quit'];
        var wasmBinary;
        if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];
        var noExitRuntime = Module['noExitRuntime'] || true;
        if (typeof WebAssembly != 'object') {
            abort('no native wasm support detected');
        }
        var wasmMemory;
        var ABORT = false;
        var EXITSTATUS;
        function assert(condition, text) {
            if (!condition) {
                abort(text);
            }
        }
        var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
        function updateMemoryViews() {
            var b = wasmMemory.buffer;
            Module['HEAP8'] = HEAP8 = new Int8Array(b);
            Module['HEAP16'] = HEAP16 = new Int16Array(b);
            Module['HEAP32'] = HEAP32 = new Int32Array(b);
            Module['HEAPU8'] = HEAPU8 = new Uint8Array(b);
            Module['HEAPU16'] = HEAPU16 = new Uint16Array(b);
            Module['HEAPU32'] = HEAPU32 = new Uint32Array(b);
            Module['HEAPF32'] = HEAPF32 = new Float32Array(b);
            Module['HEAPF64'] = HEAPF64 = new Float64Array(b);
        }
        var wasmTable;
        var __ATPRERUN__ = [];
        var __ATINIT__ = [];
        var __ATPOSTRUN__ = [];
        var runtimeInitialized = false;
        function preRun() {
            if (Module['preRun']) {
                if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
                while (Module['preRun'].length) {
                    addOnPreRun(Module['preRun'].shift());
                }
            }
            callRuntimeCallbacks(__ATPRERUN__);
        }
        function initRuntime() {
            runtimeInitialized = true;
            callRuntimeCallbacks(__ATINIT__);
        }
        function postRun() {
            if (Module['postRun']) {
                if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
                while (Module['postRun'].length) {
                    addOnPostRun(Module['postRun'].shift());
                }
            }
            callRuntimeCallbacks(__ATPOSTRUN__);
        }
        function addOnPreRun(cb) {
            __ATPRERUN__.unshift(cb);
        }
        function addOnInit(cb) {
            __ATINIT__.unshift(cb);
        }
        function addOnPostRun(cb) {
            __ATPOSTRUN__.unshift(cb);
        }
        var runDependencies = 0;
        var runDependencyWatcher = null;
        var dependenciesFulfilled = null;
        function addRunDependency(id) {
            runDependencies++;
            if (Module['monitorRunDependencies']) {
                Module['monitorRunDependencies'](runDependencies);
            }
        }
        function removeRunDependency(id) {
            runDependencies--;
            if (Module['monitorRunDependencies']) {
                Module['monitorRunDependencies'](runDependencies);
            }
            if (runDependencies == 0) {
                if (runDependencyWatcher !== null) {
                    clearInterval(runDependencyWatcher);
                    runDependencyWatcher = null;
                }
                if (dependenciesFulfilled) {
                    var callback = dependenciesFulfilled;
                    dependenciesFulfilled = null;
                    callback();
                }
            }
        }
        function abort(what) {
            if (Module['onAbort']) {
                Module['onAbort'](what);
            }
            what = 'Aborted(' + what + ')';
            err(what);
            ABORT = true;
            EXITSTATUS = 1;
            what += '. Build with -sASSERTIONS for more info.';
            var e = new WebAssembly.RuntimeError(what);
            readyPromiseReject(e);
            throw e;
        }
        var dataURIPrefix = 'data:application/octet-stream;base64,';
        function isDataURI(filename) {
            return filename.startsWith(dataURIPrefix);
        }
        function isFileURI(filename) {
            return filename.startsWith('file://');
        }
        var wasmBinaryFile;
        wasmBinaryFile = 'draco_decoder.wasm';
        if (!isDataURI(wasmBinaryFile)) {
            wasmBinaryFile = locateFile(wasmBinaryFile);
        }
        function getBinary(file) {
            try {
                if (file == wasmBinaryFile && wasmBinary) {
                    return new Uint8Array(wasmBinary);
                }
                if (readBinary) {
                    return readBinary(file);
                }
                throw 'both async and sync fetching of the wasm failed';
            } catch (err) {
                abort(err);
            }
        }
        function getBinaryPromise(binaryFile) {
            if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
                if (typeof fetch == 'function' && !isFileURI(binaryFile)) {
                    return fetch(binaryFile, {credentials: 'same-origin'})
                        .then(response => {
                            if (!response['ok']) {
                                throw "failed to load wasm binary file at '" + binaryFile + "'";
                            }
                            return response['arrayBuffer']();
                        })
                        .catch(() => getBinary(binaryFile));
                } else {
                    if (readAsync) {
                        return new Promise((resolve, reject) => {
                            readAsync(binaryFile, response => resolve(new Uint8Array(response)), reject);
                        });
                    }
                }
            }
            return Promise.resolve().then(() => getBinary(binaryFile));
        }
        function instantiateArrayBuffer(binaryFile, imports, receiver) {
            return getBinaryPromise(binaryFile)
                .then(binary => {
                    return WebAssembly.instantiate(binary, imports);
                })
                .then(instance => {
                    return instance;
                })
                .then(receiver, reason => {
                    err('failed to asynchronously prepare wasm: ' + reason);
                    abort(reason);
                });
        }
        function instantiateAsync(binary, binaryFile, imports, callback) {
            if (
                !binary &&
                typeof WebAssembly.instantiateStreaming == 'function' &&
                !isDataURI(binaryFile) &&
                !isFileURI(binaryFile) &&
                !ENVIRONMENT_IS_NODE &&
                typeof fetch == 'function'
            ) {
                return fetch(binaryFile, {credentials: 'same-origin'}).then(response => {
                    var result = WebAssembly.instantiateStreaming(response, imports);
                    return result.then(callback, function (reason) {
                        err('wasm streaming compile failed: ' + reason);
                        err('falling back to ArrayBuffer instantiation');
                        return instantiateArrayBuffer(binaryFile, imports, callback);
                    });
                });
            } else {
                return instantiateArrayBuffer(binaryFile, imports, callback);
            }
        }
        function createWasm() {
            var info = {a: wasmImports};
            function receiveInstance(instance, module) {
                var exports = instance.exports;
                Module['asm'] = exports;
                wasmMemory = Module['asm']['e'];
                updateMemoryViews();
                wasmTable = Module['asm']['g'];
                addOnInit(Module['asm']['f']);
                removeRunDependency('wasm-instantiate');
                return exports;
            }
            addRunDependency('wasm-instantiate');
            function receiveInstantiationResult(result) {
                receiveInstance(result['instance']);
            }
            if (Module['instantiateWasm']) {
                try {
                    return Module['instantiateWasm'](info, receiveInstance);
                } catch (e) {
                    err('Module.instantiateWasm callback failed with error: ' + e);
                    readyPromiseReject(e);
                }
            }
            instantiateAsync(wasmBinary, wasmBinaryFile, info, receiveInstantiationResult).catch(readyPromiseReject);
            return {};
        }
        function callRuntimeCallbacks(callbacks) {
            while (callbacks.length > 0) {
                callbacks.shift()(Module);
            }
        }
        function ExceptionInfo(excPtr) {
            this.excPtr = excPtr;
            this.ptr = excPtr - 24;
            this.set_type = function (type) {
                HEAPU32[(this.ptr + 4) >> 2] = type;
            };
            this.get_type = function () {
                return HEAPU32[(this.ptr + 4) >> 2];
            };
            this.set_destructor = function (destructor) {
                HEAPU32[(this.ptr + 8) >> 2] = destructor;
            };
            this.get_destructor = function () {
                return HEAPU32[(this.ptr + 8) >> 2];
            };
            this.set_caught = function (caught) {
                caught = caught ? 1 : 0;
                HEAP8[(this.ptr + 12) >> 0] = caught;
            };
            this.get_caught = function () {
                return HEAP8[(this.ptr + 12) >> 0] != 0;
            };
            this.set_rethrown = function (rethrown) {
                rethrown = rethrown ? 1 : 0;
                HEAP8[(this.ptr + 13) >> 0] = rethrown;
            };
            this.get_rethrown = function () {
                return HEAP8[(this.ptr + 13) >> 0] != 0;
            };
            this.init = function (type, destructor) {
                this.set_adjusted_ptr(0);
                this.set_type(type);
                this.set_destructor(destructor);
            };
            this.set_adjusted_ptr = function (adjustedPtr) {
                HEAPU32[(this.ptr + 16) >> 2] = adjustedPtr;
            };
            this.get_adjusted_ptr = function () {
                return HEAPU32[(this.ptr + 16) >> 2];
            };
            this.get_exception_ptr = function () {
                var isPointer = ___cxa_is_pointer_type(this.get_type());
                if (isPointer) {
                    return HEAPU32[this.excPtr >> 2];
                }
                var adjusted = this.get_adjusted_ptr();
                if (adjusted !== 0) return adjusted;
                return this.excPtr;
            };
        }
        var exceptionLast = 0;
        var uncaughtExceptionCount = 0;
        function ___cxa_throw(ptr, type, destructor) {
            var info = new ExceptionInfo(ptr);
            info.init(type, destructor);
            exceptionLast = ptr;
            uncaughtExceptionCount++;
            throw exceptionLast;
        }
        function _abort() {
            abort('');
        }
        function _emscripten_memcpy_big(dest, src, num) {
            HEAPU8.copyWithin(dest, src, src + num);
        }
        function getHeapMax() {
            return 2147483648;
        }
        function emscripten_realloc_buffer(size) {
            var b = wasmMemory.buffer;
            try {
                wasmMemory.grow((size - b.byteLength + 65535) >>> 16);
                updateMemoryViews();
                return 1;
            } catch (e) {}
        }
        function _emscripten_resize_heap(requestedSize) {
            var oldSize = HEAPU8.length;
            requestedSize = requestedSize >>> 0;
            var maxHeapSize = getHeapMax();
            if (requestedSize > maxHeapSize) {
                return false;
            }
            let alignUp = (x, multiple) => x + ((multiple - (x % multiple)) % multiple);
            for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
                var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
                overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
                var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
                var replacement = emscripten_realloc_buffer(newSize);
                if (replacement) {
                    return true;
                }
            }
            return false;
        }
        function lengthBytesUTF8(str) {
            var len = 0;
            for (var i = 0; i < str.length; ++i) {
                var c = str.charCodeAt(i);
                if (c <= 127) {
                    len++;
                } else if (c <= 2047) {
                    len += 2;
                } else if (c >= 55296 && c <= 57343) {
                    len += 4;
                    ++i;
                } else {
                    len += 3;
                }
            }
            return len;
        }
        function stringToUTF8Array(str, heap, outIdx, maxBytesToWrite) {
            if (!(maxBytesToWrite > 0)) return 0;
            var startIdx = outIdx;
            var endIdx = outIdx + maxBytesToWrite - 1;
            for (var i = 0; i < str.length; ++i) {
                var u = str.charCodeAt(i);
                if (u >= 55296 && u <= 57343) {
                    var u1 = str.charCodeAt(++i);
                    u = (65536 + ((u & 1023) << 10)) | (u1 & 1023);
                }
                if (u <= 127) {
                    if (outIdx >= endIdx) break;
                    heap[outIdx++] = u;
                } else if (u <= 2047) {
                    if (outIdx + 1 >= endIdx) break;
                    heap[outIdx++] = 192 | (u >> 6);
                    heap[outIdx++] = 128 | (u & 63);
                } else if (u <= 65535) {
                    if (outIdx + 2 >= endIdx) break;
                    heap[outIdx++] = 224 | (u >> 12);
                    heap[outIdx++] = 128 | ((u >> 6) & 63);
                    heap[outIdx++] = 128 | (u & 63);
                } else {
                    if (outIdx + 3 >= endIdx) break;
                    heap[outIdx++] = 240 | (u >> 18);
                    heap[outIdx++] = 128 | ((u >> 12) & 63);
                    heap[outIdx++] = 128 | ((u >> 6) & 63);
                    heap[outIdx++] = 128 | (u & 63);
                }
            }
            heap[outIdx] = 0;
            return outIdx - startIdx;
        }
        function intArrayFromString(stringy, dontAddNull, length) {
            var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
            var u8array = new Array(len);
            var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
            if (dontAddNull) u8array.length = numBytesWritten;
            return u8array;
        }
        var wasmImports = {b: ___cxa_throw, a: _abort, d: _emscripten_memcpy_big, c: _emscripten_resize_heap};
        var asm = createWasm();
        var ___wasm_call_ctors = function () {
            return (___wasm_call_ctors = Module['asm']['f']).apply(null, arguments);
        };
        var _emscripten_bind_VoidPtr___destroy___0 = (Module['_emscripten_bind_VoidPtr___destroy___0'] = function () {
            return (_emscripten_bind_VoidPtr___destroy___0 = Module['_emscripten_bind_VoidPtr___destroy___0'] =
                Module['asm']['h']).apply(null, arguments);
        });
        var _emscripten_bind_DecoderBuffer_DecoderBuffer_0 = (Module['_emscripten_bind_DecoderBuffer_DecoderBuffer_0'] =
            function () {
                return (_emscripten_bind_DecoderBuffer_DecoderBuffer_0 = Module[
                    '_emscripten_bind_DecoderBuffer_DecoderBuffer_0'
                ] =
                    Module['asm']['i']).apply(null, arguments);
            });
        var _emscripten_bind_DecoderBuffer_Init_2 = (Module['_emscripten_bind_DecoderBuffer_Init_2'] = function () {
            return (_emscripten_bind_DecoderBuffer_Init_2 = Module['_emscripten_bind_DecoderBuffer_Init_2'] =
                Module['asm']['j']).apply(null, arguments);
        });
        var _emscripten_bind_DecoderBuffer___destroy___0 = (Module['_emscripten_bind_DecoderBuffer___destroy___0'] =
            function () {
                return (_emscripten_bind_DecoderBuffer___destroy___0 = Module[
                    '_emscripten_bind_DecoderBuffer___destroy___0'
                ] =
                    Module['asm']['k']).apply(null, arguments);
            });
        var _emscripten_bind_AttributeTransformData_AttributeTransformData_0 = (Module[
            '_emscripten_bind_AttributeTransformData_AttributeTransformData_0'
        ] = function () {
            return (_emscripten_bind_AttributeTransformData_AttributeTransformData_0 = Module[
                '_emscripten_bind_AttributeTransformData_AttributeTransformData_0'
            ] =
                Module['asm']['l']).apply(null, arguments);
        });
        var _emscripten_bind_AttributeTransformData_transform_type_0 = (Module[
            '_emscripten_bind_AttributeTransformData_transform_type_0'
        ] = function () {
            return (_emscripten_bind_AttributeTransformData_transform_type_0 = Module[
                '_emscripten_bind_AttributeTransformData_transform_type_0'
            ] =
                Module['asm']['m']).apply(null, arguments);
        });
        var _emscripten_bind_AttributeTransformData___destroy___0 = (Module[
            '_emscripten_bind_AttributeTransformData___destroy___0'
        ] = function () {
            return (_emscripten_bind_AttributeTransformData___destroy___0 = Module[
                '_emscripten_bind_AttributeTransformData___destroy___0'
            ] =
                Module['asm']['n']).apply(null, arguments);
        });
        var _emscripten_bind_GeometryAttribute_GeometryAttribute_0 = (Module[
            '_emscripten_bind_GeometryAttribute_GeometryAttribute_0'
        ] = function () {
            return (_emscripten_bind_GeometryAttribute_GeometryAttribute_0 = Module[
                '_emscripten_bind_GeometryAttribute_GeometryAttribute_0'
            ] =
                Module['asm']['o']).apply(null, arguments);
        });
        var _emscripten_bind_GeometryAttribute___destroy___0 = (Module[
            '_emscripten_bind_GeometryAttribute___destroy___0'
        ] = function () {
            return (_emscripten_bind_GeometryAttribute___destroy___0 = Module[
                '_emscripten_bind_GeometryAttribute___destroy___0'
            ] =
                Module['asm']['p']).apply(null, arguments);
        });
        var _emscripten_bind_PointAttribute_PointAttribute_0 = (Module[
            '_emscripten_bind_PointAttribute_PointAttribute_0'
        ] = function () {
            return (_emscripten_bind_PointAttribute_PointAttribute_0 = Module[
                '_emscripten_bind_PointAttribute_PointAttribute_0'
            ] =
                Module['asm']['q']).apply(null, arguments);
        });
        var _emscripten_bind_PointAttribute_size_0 = (Module['_emscripten_bind_PointAttribute_size_0'] = function () {
            return (_emscripten_bind_PointAttribute_size_0 = Module['_emscripten_bind_PointAttribute_size_0'] =
                Module['asm']['r']).apply(null, arguments);
        });
        var _emscripten_bind_PointAttribute_GetAttributeTransformData_0 = (Module[
            '_emscripten_bind_PointAttribute_GetAttributeTransformData_0'
        ] = function () {
            return (_emscripten_bind_PointAttribute_GetAttributeTransformData_0 = Module[
                '_emscripten_bind_PointAttribute_GetAttributeTransformData_0'
            ] =
                Module['asm']['s']).apply(null, arguments);
        });
        var _emscripten_bind_PointAttribute_attribute_type_0 = (Module[
            '_emscripten_bind_PointAttribute_attribute_type_0'
        ] = function () {
            return (_emscripten_bind_PointAttribute_attribute_type_0 = Module[
                '_emscripten_bind_PointAttribute_attribute_type_0'
            ] =
                Module['asm']['t']).apply(null, arguments);
        });
        var _emscripten_bind_PointAttribute_data_type_0 = (Module['_emscripten_bind_PointAttribute_data_type_0'] =
            function () {
                return (_emscripten_bind_PointAttribute_data_type_0 = Module[
                    '_emscripten_bind_PointAttribute_data_type_0'
                ] =
                    Module['asm']['u']).apply(null, arguments);
            });
        var _emscripten_bind_PointAttribute_num_components_0 = (Module[
            '_emscripten_bind_PointAttribute_num_components_0'
        ] = function () {
            return (_emscripten_bind_PointAttribute_num_components_0 = Module[
                '_emscripten_bind_PointAttribute_num_components_0'
            ] =
                Module['asm']['v']).apply(null, arguments);
        });
        var _emscripten_bind_PointAttribute_normalized_0 = (Module['_emscripten_bind_PointAttribute_normalized_0'] =
            function () {
                return (_emscripten_bind_PointAttribute_normalized_0 = Module[
                    '_emscripten_bind_PointAttribute_normalized_0'
                ] =
                    Module['asm']['w']).apply(null, arguments);
            });
        var _emscripten_bind_PointAttribute_byte_stride_0 = (Module['_emscripten_bind_PointAttribute_byte_stride_0'] =
            function () {
                return (_emscripten_bind_PointAttribute_byte_stride_0 = Module[
                    '_emscripten_bind_PointAttribute_byte_stride_0'
                ] =
                    Module['asm']['x']).apply(null, arguments);
            });
        var _emscripten_bind_PointAttribute_byte_offset_0 = (Module['_emscripten_bind_PointAttribute_byte_offset_0'] =
            function () {
                return (_emscripten_bind_PointAttribute_byte_offset_0 = Module[
                    '_emscripten_bind_PointAttribute_byte_offset_0'
                ] =
                    Module['asm']['y']).apply(null, arguments);
            });
        var _emscripten_bind_PointAttribute_unique_id_0 = (Module['_emscripten_bind_PointAttribute_unique_id_0'] =
            function () {
                return (_emscripten_bind_PointAttribute_unique_id_0 = Module[
                    '_emscripten_bind_PointAttribute_unique_id_0'
                ] =
                    Module['asm']['z']).apply(null, arguments);
            });
        var _emscripten_bind_PointAttribute___destroy___0 = (Module['_emscripten_bind_PointAttribute___destroy___0'] =
            function () {
                return (_emscripten_bind_PointAttribute___destroy___0 = Module[
                    '_emscripten_bind_PointAttribute___destroy___0'
                ] =
                    Module['asm']['A']).apply(null, arguments);
            });
        var _emscripten_bind_AttributeQuantizationTransform_AttributeQuantizationTransform_0 = (Module[
            '_emscripten_bind_AttributeQuantizationTransform_AttributeQuantizationTransform_0'
        ] = function () {
            return (_emscripten_bind_AttributeQuantizationTransform_AttributeQuantizationTransform_0 = Module[
                '_emscripten_bind_AttributeQuantizationTransform_AttributeQuantizationTransform_0'
            ] =
                Module['asm']['B']).apply(null, arguments);
        });
        var _emscripten_bind_AttributeQuantizationTransform_InitFromAttribute_1 = (Module[
            '_emscripten_bind_AttributeQuantizationTransform_InitFromAttribute_1'
        ] = function () {
            return (_emscripten_bind_AttributeQuantizationTransform_InitFromAttribute_1 = Module[
                '_emscripten_bind_AttributeQuantizationTransform_InitFromAttribute_1'
            ] =
                Module['asm']['C']).apply(null, arguments);
        });
        var _emscripten_bind_AttributeQuantizationTransform_quantization_bits_0 = (Module[
            '_emscripten_bind_AttributeQuantizationTransform_quantization_bits_0'
        ] = function () {
            return (_emscripten_bind_AttributeQuantizationTransform_quantization_bits_0 = Module[
                '_emscripten_bind_AttributeQuantizationTransform_quantization_bits_0'
            ] =
                Module['asm']['D']).apply(null, arguments);
        });
        var _emscripten_bind_AttributeQuantizationTransform_min_value_1 = (Module[
            '_emscripten_bind_AttributeQuantizationTransform_min_value_1'
        ] = function () {
            return (_emscripten_bind_AttributeQuantizationTransform_min_value_1 = Module[
                '_emscripten_bind_AttributeQuantizationTransform_min_value_1'
            ] =
                Module['asm']['E']).apply(null, arguments);
        });
        var _emscripten_bind_AttributeQuantizationTransform_range_0 = (Module[
            '_emscripten_bind_AttributeQuantizationTransform_range_0'
        ] = function () {
            return (_emscripten_bind_AttributeQuantizationTransform_range_0 = Module[
                '_emscripten_bind_AttributeQuantizationTransform_range_0'
            ] =
                Module['asm']['F']).apply(null, arguments);
        });
        var _emscripten_bind_AttributeQuantizationTransform___destroy___0 = (Module[
            '_emscripten_bind_AttributeQuantizationTransform___destroy___0'
        ] = function () {
            return (_emscripten_bind_AttributeQuantizationTransform___destroy___0 = Module[
                '_emscripten_bind_AttributeQuantizationTransform___destroy___0'
            ] =
                Module['asm']['G']).apply(null, arguments);
        });
        var _emscripten_bind_AttributeOctahedronTransform_AttributeOctahedronTransform_0 = (Module[
            '_emscripten_bind_AttributeOctahedronTransform_AttributeOctahedronTransform_0'
        ] = function () {
            return (_emscripten_bind_AttributeOctahedronTransform_AttributeOctahedronTransform_0 = Module[
                '_emscripten_bind_AttributeOctahedronTransform_AttributeOctahedronTransform_0'
            ] =
                Module['asm']['H']).apply(null, arguments);
        });
        var _emscripten_bind_AttributeOctahedronTransform_InitFromAttribute_1 = (Module[
            '_emscripten_bind_AttributeOctahedronTransform_InitFromAttribute_1'
        ] = function () {
            return (_emscripten_bind_AttributeOctahedronTransform_InitFromAttribute_1 = Module[
                '_emscripten_bind_AttributeOctahedronTransform_InitFromAttribute_1'
            ] =
                Module['asm']['I']).apply(null, arguments);
        });
        var _emscripten_bind_AttributeOctahedronTransform_quantization_bits_0 = (Module[
            '_emscripten_bind_AttributeOctahedronTransform_quantization_bits_0'
        ] = function () {
            return (_emscripten_bind_AttributeOctahedronTransform_quantization_bits_0 = Module[
                '_emscripten_bind_AttributeOctahedronTransform_quantization_bits_0'
            ] =
                Module['asm']['J']).apply(null, arguments);
        });
        var _emscripten_bind_AttributeOctahedronTransform___destroy___0 = (Module[
            '_emscripten_bind_AttributeOctahedronTransform___destroy___0'
        ] = function () {
            return (_emscripten_bind_AttributeOctahedronTransform___destroy___0 = Module[
                '_emscripten_bind_AttributeOctahedronTransform___destroy___0'
            ] =
                Module['asm']['K']).apply(null, arguments);
        });
        var _emscripten_bind_PointCloud_PointCloud_0 = (Module['_emscripten_bind_PointCloud_PointCloud_0'] =
            function () {
                return (_emscripten_bind_PointCloud_PointCloud_0 = Module['_emscripten_bind_PointCloud_PointCloud_0'] =
                    Module['asm']['L']).apply(null, arguments);
            });
        var _emscripten_bind_PointCloud_num_attributes_0 = (Module['_emscripten_bind_PointCloud_num_attributes_0'] =
            function () {
                return (_emscripten_bind_PointCloud_num_attributes_0 = Module[
                    '_emscripten_bind_PointCloud_num_attributes_0'
                ] =
                    Module['asm']['M']).apply(null, arguments);
            });
        var _emscripten_bind_PointCloud_num_points_0 = (Module['_emscripten_bind_PointCloud_num_points_0'] =
            function () {
                return (_emscripten_bind_PointCloud_num_points_0 = Module['_emscripten_bind_PointCloud_num_points_0'] =
                    Module['asm']['N']).apply(null, arguments);
            });
        var _emscripten_bind_PointCloud___destroy___0 = (Module['_emscripten_bind_PointCloud___destroy___0'] =
            function () {
                return (_emscripten_bind_PointCloud___destroy___0 = Module[
                    '_emscripten_bind_PointCloud___destroy___0'
                ] =
                    Module['asm']['O']).apply(null, arguments);
            });
        var _emscripten_bind_Mesh_Mesh_0 = (Module['_emscripten_bind_Mesh_Mesh_0'] = function () {
            return (_emscripten_bind_Mesh_Mesh_0 = Module['_emscripten_bind_Mesh_Mesh_0'] = Module['asm']['P']).apply(
                null,
                arguments
            );
        });
        var _emscripten_bind_Mesh_num_faces_0 = (Module['_emscripten_bind_Mesh_num_faces_0'] = function () {
            return (_emscripten_bind_Mesh_num_faces_0 = Module['_emscripten_bind_Mesh_num_faces_0'] =
                Module['asm']['Q']).apply(null, arguments);
        });
        var _emscripten_bind_Mesh_num_attributes_0 = (Module['_emscripten_bind_Mesh_num_attributes_0'] = function () {
            return (_emscripten_bind_Mesh_num_attributes_0 = Module['_emscripten_bind_Mesh_num_attributes_0'] =
                Module['asm']['R']).apply(null, arguments);
        });
        var _emscripten_bind_Mesh_num_points_0 = (Module['_emscripten_bind_Mesh_num_points_0'] = function () {
            return (_emscripten_bind_Mesh_num_points_0 = Module['_emscripten_bind_Mesh_num_points_0'] =
                Module['asm']['S']).apply(null, arguments);
        });
        var _emscripten_bind_Mesh___destroy___0 = (Module['_emscripten_bind_Mesh___destroy___0'] = function () {
            return (_emscripten_bind_Mesh___destroy___0 = Module['_emscripten_bind_Mesh___destroy___0'] =
                Module['asm']['T']).apply(null, arguments);
        });
        var _emscripten_bind_Metadata_Metadata_0 = (Module['_emscripten_bind_Metadata_Metadata_0'] = function () {
            return (_emscripten_bind_Metadata_Metadata_0 = Module['_emscripten_bind_Metadata_Metadata_0'] =
                Module['asm']['U']).apply(null, arguments);
        });
        var _emscripten_bind_Metadata___destroy___0 = (Module['_emscripten_bind_Metadata___destroy___0'] = function () {
            return (_emscripten_bind_Metadata___destroy___0 = Module['_emscripten_bind_Metadata___destroy___0'] =
                Module['asm']['V']).apply(null, arguments);
        });
        var _emscripten_bind_Status_code_0 = (Module['_emscripten_bind_Status_code_0'] = function () {
            return (_emscripten_bind_Status_code_0 = Module['_emscripten_bind_Status_code_0'] =
                Module['asm']['W']).apply(null, arguments);
        });
        var _emscripten_bind_Status_ok_0 = (Module['_emscripten_bind_Status_ok_0'] = function () {
            return (_emscripten_bind_Status_ok_0 = Module['_emscripten_bind_Status_ok_0'] = Module['asm']['X']).apply(
                null,
                arguments
            );
        });
        var _emscripten_bind_Status_error_msg_0 = (Module['_emscripten_bind_Status_error_msg_0'] = function () {
            return (_emscripten_bind_Status_error_msg_0 = Module['_emscripten_bind_Status_error_msg_0'] =
                Module['asm']['Y']).apply(null, arguments);
        });
        var _emscripten_bind_Status___destroy___0 = (Module['_emscripten_bind_Status___destroy___0'] = function () {
            return (_emscripten_bind_Status___destroy___0 = Module['_emscripten_bind_Status___destroy___0'] =
                Module['asm']['Z']).apply(null, arguments);
        });
        var _emscripten_bind_DracoFloat32Array_DracoFloat32Array_0 = (Module[
            '_emscripten_bind_DracoFloat32Array_DracoFloat32Array_0'
        ] = function () {
            return (_emscripten_bind_DracoFloat32Array_DracoFloat32Array_0 = Module[
                '_emscripten_bind_DracoFloat32Array_DracoFloat32Array_0'
            ] =
                Module['asm']['_']).apply(null, arguments);
        });
        var _emscripten_bind_DracoFloat32Array_GetValue_1 = (Module['_emscripten_bind_DracoFloat32Array_GetValue_1'] =
            function () {
                return (_emscripten_bind_DracoFloat32Array_GetValue_1 = Module[
                    '_emscripten_bind_DracoFloat32Array_GetValue_1'
                ] =
                    Module['asm']['$']).apply(null, arguments);
            });
        var _emscripten_bind_DracoFloat32Array_size_0 = (Module['_emscripten_bind_DracoFloat32Array_size_0'] =
            function () {
                return (_emscripten_bind_DracoFloat32Array_size_0 = Module[
                    '_emscripten_bind_DracoFloat32Array_size_0'
                ] =
                    Module['asm']['aa']).apply(null, arguments);
            });
        var _emscripten_bind_DracoFloat32Array___destroy___0 = (Module[
            '_emscripten_bind_DracoFloat32Array___destroy___0'
        ] = function () {
            return (_emscripten_bind_DracoFloat32Array___destroy___0 = Module[
                '_emscripten_bind_DracoFloat32Array___destroy___0'
            ] =
                Module['asm']['ba']).apply(null, arguments);
        });
        var _emscripten_bind_DracoInt8Array_DracoInt8Array_0 = (Module[
            '_emscripten_bind_DracoInt8Array_DracoInt8Array_0'
        ] = function () {
            return (_emscripten_bind_DracoInt8Array_DracoInt8Array_0 = Module[
                '_emscripten_bind_DracoInt8Array_DracoInt8Array_0'
            ] =
                Module['asm']['ca']).apply(null, arguments);
        });
        var _emscripten_bind_DracoInt8Array_GetValue_1 = (Module['_emscripten_bind_DracoInt8Array_GetValue_1'] =
            function () {
                return (_emscripten_bind_DracoInt8Array_GetValue_1 = Module[
                    '_emscripten_bind_DracoInt8Array_GetValue_1'
                ] =
                    Module['asm']['da']).apply(null, arguments);
            });
        var _emscripten_bind_DracoInt8Array_size_0 = (Module['_emscripten_bind_DracoInt8Array_size_0'] = function () {
            return (_emscripten_bind_DracoInt8Array_size_0 = Module['_emscripten_bind_DracoInt8Array_size_0'] =
                Module['asm']['ea']).apply(null, arguments);
        });
        var _emscripten_bind_DracoInt8Array___destroy___0 = (Module['_emscripten_bind_DracoInt8Array___destroy___0'] =
            function () {
                return (_emscripten_bind_DracoInt8Array___destroy___0 = Module[
                    '_emscripten_bind_DracoInt8Array___destroy___0'
                ] =
                    Module['asm']['fa']).apply(null, arguments);
            });
        var _emscripten_bind_DracoUInt8Array_DracoUInt8Array_0 = (Module[
            '_emscripten_bind_DracoUInt8Array_DracoUInt8Array_0'
        ] = function () {
            return (_emscripten_bind_DracoUInt8Array_DracoUInt8Array_0 = Module[
                '_emscripten_bind_DracoUInt8Array_DracoUInt8Array_0'
            ] =
                Module['asm']['ga']).apply(null, arguments);
        });
        var _emscripten_bind_DracoUInt8Array_GetValue_1 = (Module['_emscripten_bind_DracoUInt8Array_GetValue_1'] =
            function () {
                return (_emscripten_bind_DracoUInt8Array_GetValue_1 = Module[
                    '_emscripten_bind_DracoUInt8Array_GetValue_1'
                ] =
                    Module['asm']['ha']).apply(null, arguments);
            });
        var _emscripten_bind_DracoUInt8Array_size_0 = (Module['_emscripten_bind_DracoUInt8Array_size_0'] = function () {
            return (_emscripten_bind_DracoUInt8Array_size_0 = Module['_emscripten_bind_DracoUInt8Array_size_0'] =
                Module['asm']['ia']).apply(null, arguments);
        });
        var _emscripten_bind_DracoUInt8Array___destroy___0 = (Module['_emscripten_bind_DracoUInt8Array___destroy___0'] =
            function () {
                return (_emscripten_bind_DracoUInt8Array___destroy___0 = Module[
                    '_emscripten_bind_DracoUInt8Array___destroy___0'
                ] =
                    Module['asm']['ja']).apply(null, arguments);
            });
        var _emscripten_bind_DracoInt16Array_DracoInt16Array_0 = (Module[
            '_emscripten_bind_DracoInt16Array_DracoInt16Array_0'
        ] = function () {
            return (_emscripten_bind_DracoInt16Array_DracoInt16Array_0 = Module[
                '_emscripten_bind_DracoInt16Array_DracoInt16Array_0'
            ] =
                Module['asm']['ka']).apply(null, arguments);
        });
        var _emscripten_bind_DracoInt16Array_GetValue_1 = (Module['_emscripten_bind_DracoInt16Array_GetValue_1'] =
            function () {
                return (_emscripten_bind_DracoInt16Array_GetValue_1 = Module[
                    '_emscripten_bind_DracoInt16Array_GetValue_1'
                ] =
                    Module['asm']['la']).apply(null, arguments);
            });
        var _emscripten_bind_DracoInt16Array_size_0 = (Module['_emscripten_bind_DracoInt16Array_size_0'] = function () {
            return (_emscripten_bind_DracoInt16Array_size_0 = Module['_emscripten_bind_DracoInt16Array_size_0'] =
                Module['asm']['ma']).apply(null, arguments);
        });
        var _emscripten_bind_DracoInt16Array___destroy___0 = (Module['_emscripten_bind_DracoInt16Array___destroy___0'] =
            function () {
                return (_emscripten_bind_DracoInt16Array___destroy___0 = Module[
                    '_emscripten_bind_DracoInt16Array___destroy___0'
                ] =
                    Module['asm']['na']).apply(null, arguments);
            });
        var _emscripten_bind_DracoUInt16Array_DracoUInt16Array_0 = (Module[
            '_emscripten_bind_DracoUInt16Array_DracoUInt16Array_0'
        ] = function () {
            return (_emscripten_bind_DracoUInt16Array_DracoUInt16Array_0 = Module[
                '_emscripten_bind_DracoUInt16Array_DracoUInt16Array_0'
            ] =
                Module['asm']['oa']).apply(null, arguments);
        });
        var _emscripten_bind_DracoUInt16Array_GetValue_1 = (Module['_emscripten_bind_DracoUInt16Array_GetValue_1'] =
            function () {
                return (_emscripten_bind_DracoUInt16Array_GetValue_1 = Module[
                    '_emscripten_bind_DracoUInt16Array_GetValue_1'
                ] =
                    Module['asm']['pa']).apply(null, arguments);
            });
        var _emscripten_bind_DracoUInt16Array_size_0 = (Module['_emscripten_bind_DracoUInt16Array_size_0'] =
            function () {
                return (_emscripten_bind_DracoUInt16Array_size_0 = Module['_emscripten_bind_DracoUInt16Array_size_0'] =
                    Module['asm']['qa']).apply(null, arguments);
            });
        var _emscripten_bind_DracoUInt16Array___destroy___0 = (Module[
            '_emscripten_bind_DracoUInt16Array___destroy___0'
        ] = function () {
            return (_emscripten_bind_DracoUInt16Array___destroy___0 = Module[
                '_emscripten_bind_DracoUInt16Array___destroy___0'
            ] =
                Module['asm']['ra']).apply(null, arguments);
        });
        var _emscripten_bind_DracoInt32Array_DracoInt32Array_0 = (Module[
            '_emscripten_bind_DracoInt32Array_DracoInt32Array_0'
        ] = function () {
            return (_emscripten_bind_DracoInt32Array_DracoInt32Array_0 = Module[
                '_emscripten_bind_DracoInt32Array_DracoInt32Array_0'
            ] =
                Module['asm']['sa']).apply(null, arguments);
        });
        var _emscripten_bind_DracoInt32Array_GetValue_1 = (Module['_emscripten_bind_DracoInt32Array_GetValue_1'] =
            function () {
                return (_emscripten_bind_DracoInt32Array_GetValue_1 = Module[
                    '_emscripten_bind_DracoInt32Array_GetValue_1'
                ] =
                    Module['asm']['ta']).apply(null, arguments);
            });
        var _emscripten_bind_DracoInt32Array_size_0 = (Module['_emscripten_bind_DracoInt32Array_size_0'] = function () {
            return (_emscripten_bind_DracoInt32Array_size_0 = Module['_emscripten_bind_DracoInt32Array_size_0'] =
                Module['asm']['ua']).apply(null, arguments);
        });
        var _emscripten_bind_DracoInt32Array___destroy___0 = (Module['_emscripten_bind_DracoInt32Array___destroy___0'] =
            function () {
                return (_emscripten_bind_DracoInt32Array___destroy___0 = Module[
                    '_emscripten_bind_DracoInt32Array___destroy___0'
                ] =
                    Module['asm']['va']).apply(null, arguments);
            });
        var _emscripten_bind_DracoUInt32Array_DracoUInt32Array_0 = (Module[
            '_emscripten_bind_DracoUInt32Array_DracoUInt32Array_0'
        ] = function () {
            return (_emscripten_bind_DracoUInt32Array_DracoUInt32Array_0 = Module[
                '_emscripten_bind_DracoUInt32Array_DracoUInt32Array_0'
            ] =
                Module['asm']['wa']).apply(null, arguments);
        });
        var _emscripten_bind_DracoUInt32Array_GetValue_1 = (Module['_emscripten_bind_DracoUInt32Array_GetValue_1'] =
            function () {
                return (_emscripten_bind_DracoUInt32Array_GetValue_1 = Module[
                    '_emscripten_bind_DracoUInt32Array_GetValue_1'
                ] =
                    Module['asm']['xa']).apply(null, arguments);
            });
        var _emscripten_bind_DracoUInt32Array_size_0 = (Module['_emscripten_bind_DracoUInt32Array_size_0'] =
            function () {
                return (_emscripten_bind_DracoUInt32Array_size_0 = Module['_emscripten_bind_DracoUInt32Array_size_0'] =
                    Module['asm']['ya']).apply(null, arguments);
            });
        var _emscripten_bind_DracoUInt32Array___destroy___0 = (Module[
            '_emscripten_bind_DracoUInt32Array___destroy___0'
        ] = function () {
            return (_emscripten_bind_DracoUInt32Array___destroy___0 = Module[
                '_emscripten_bind_DracoUInt32Array___destroy___0'
            ] =
                Module['asm']['za']).apply(null, arguments);
        });
        var _emscripten_bind_MetadataQuerier_MetadataQuerier_0 = (Module[
            '_emscripten_bind_MetadataQuerier_MetadataQuerier_0'
        ] = function () {
            return (_emscripten_bind_MetadataQuerier_MetadataQuerier_0 = Module[
                '_emscripten_bind_MetadataQuerier_MetadataQuerier_0'
            ] =
                Module['asm']['Aa']).apply(null, arguments);
        });
        var _emscripten_bind_MetadataQuerier_HasEntry_2 = (Module['_emscripten_bind_MetadataQuerier_HasEntry_2'] =
            function () {
                return (_emscripten_bind_MetadataQuerier_HasEntry_2 = Module[
                    '_emscripten_bind_MetadataQuerier_HasEntry_2'
                ] =
                    Module['asm']['Ba']).apply(null, arguments);
            });
        var _emscripten_bind_MetadataQuerier_GetIntEntry_2 = (Module['_emscripten_bind_MetadataQuerier_GetIntEntry_2'] =
            function () {
                return (_emscripten_bind_MetadataQuerier_GetIntEntry_2 = Module[
                    '_emscripten_bind_MetadataQuerier_GetIntEntry_2'
                ] =
                    Module['asm']['Ca']).apply(null, arguments);
            });
        var _emscripten_bind_MetadataQuerier_GetIntEntryArray_3 = (Module[
            '_emscripten_bind_MetadataQuerier_GetIntEntryArray_3'
        ] = function () {
            return (_emscripten_bind_MetadataQuerier_GetIntEntryArray_3 = Module[
                '_emscripten_bind_MetadataQuerier_GetIntEntryArray_3'
            ] =
                Module['asm']['Da']).apply(null, arguments);
        });
        var _emscripten_bind_MetadataQuerier_GetDoubleEntry_2 = (Module[
            '_emscripten_bind_MetadataQuerier_GetDoubleEntry_2'
        ] = function () {
            return (_emscripten_bind_MetadataQuerier_GetDoubleEntry_2 = Module[
                '_emscripten_bind_MetadataQuerier_GetDoubleEntry_2'
            ] =
                Module['asm']['Ea']).apply(null, arguments);
        });
        var _emscripten_bind_MetadataQuerier_GetStringEntry_2 = (Module[
            '_emscripten_bind_MetadataQuerier_GetStringEntry_2'
        ] = function () {
            return (_emscripten_bind_MetadataQuerier_GetStringEntry_2 = Module[
                '_emscripten_bind_MetadataQuerier_GetStringEntry_2'
            ] =
                Module['asm']['Fa']).apply(null, arguments);
        });
        var _emscripten_bind_MetadataQuerier_NumEntries_1 = (Module['_emscripten_bind_MetadataQuerier_NumEntries_1'] =
            function () {
                return (_emscripten_bind_MetadataQuerier_NumEntries_1 = Module[
                    '_emscripten_bind_MetadataQuerier_NumEntries_1'
                ] =
                    Module['asm']['Ga']).apply(null, arguments);
            });
        var _emscripten_bind_MetadataQuerier_GetEntryName_2 = (Module[
            '_emscripten_bind_MetadataQuerier_GetEntryName_2'
        ] = function () {
            return (_emscripten_bind_MetadataQuerier_GetEntryName_2 = Module[
                '_emscripten_bind_MetadataQuerier_GetEntryName_2'
            ] =
                Module['asm']['Ha']).apply(null, arguments);
        });
        var _emscripten_bind_MetadataQuerier___destroy___0 = (Module['_emscripten_bind_MetadataQuerier___destroy___0'] =
            function () {
                return (_emscripten_bind_MetadataQuerier___destroy___0 = Module[
                    '_emscripten_bind_MetadataQuerier___destroy___0'
                ] =
                    Module['asm']['Ia']).apply(null, arguments);
            });
        var _emscripten_bind_Decoder_Decoder_0 = (Module['_emscripten_bind_Decoder_Decoder_0'] = function () {
            return (_emscripten_bind_Decoder_Decoder_0 = Module['_emscripten_bind_Decoder_Decoder_0'] =
                Module['asm']['Ja']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_DecodeArrayToPointCloud_3 = (Module[
            '_emscripten_bind_Decoder_DecodeArrayToPointCloud_3'
        ] = function () {
            return (_emscripten_bind_Decoder_DecodeArrayToPointCloud_3 = Module[
                '_emscripten_bind_Decoder_DecodeArrayToPointCloud_3'
            ] =
                Module['asm']['Ka']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_DecodeArrayToMesh_3 = (Module['_emscripten_bind_Decoder_DecodeArrayToMesh_3'] =
            function () {
                return (_emscripten_bind_Decoder_DecodeArrayToMesh_3 = Module[
                    '_emscripten_bind_Decoder_DecodeArrayToMesh_3'
                ] =
                    Module['asm']['La']).apply(null, arguments);
            });
        var _emscripten_bind_Decoder_GetAttributeId_2 = (Module['_emscripten_bind_Decoder_GetAttributeId_2'] =
            function () {
                return (_emscripten_bind_Decoder_GetAttributeId_2 = Module[
                    '_emscripten_bind_Decoder_GetAttributeId_2'
                ] =
                    Module['asm']['Ma']).apply(null, arguments);
            });
        var _emscripten_bind_Decoder_GetAttributeIdByName_2 = (Module[
            '_emscripten_bind_Decoder_GetAttributeIdByName_2'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeIdByName_2 = Module[
                '_emscripten_bind_Decoder_GetAttributeIdByName_2'
            ] =
                Module['asm']['Na']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeIdByMetadataEntry_3 = (Module[
            '_emscripten_bind_Decoder_GetAttributeIdByMetadataEntry_3'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeIdByMetadataEntry_3 = Module[
                '_emscripten_bind_Decoder_GetAttributeIdByMetadataEntry_3'
            ] =
                Module['asm']['Oa']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttribute_2 = (Module['_emscripten_bind_Decoder_GetAttribute_2'] = function () {
            return (_emscripten_bind_Decoder_GetAttribute_2 = Module['_emscripten_bind_Decoder_GetAttribute_2'] =
                Module['asm']['Pa']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeByUniqueId_2 = (Module[
            '_emscripten_bind_Decoder_GetAttributeByUniqueId_2'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeByUniqueId_2 = Module[
                '_emscripten_bind_Decoder_GetAttributeByUniqueId_2'
            ] =
                Module['asm']['Qa']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetMetadata_1 = (Module['_emscripten_bind_Decoder_GetMetadata_1'] = function () {
            return (_emscripten_bind_Decoder_GetMetadata_1 = Module['_emscripten_bind_Decoder_GetMetadata_1'] =
                Module['asm']['Ra']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeMetadata_2 = (Module[
            '_emscripten_bind_Decoder_GetAttributeMetadata_2'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeMetadata_2 = Module[
                '_emscripten_bind_Decoder_GetAttributeMetadata_2'
            ] =
                Module['asm']['Sa']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetFaceFromMesh_3 = (Module['_emscripten_bind_Decoder_GetFaceFromMesh_3'] =
            function () {
                return (_emscripten_bind_Decoder_GetFaceFromMesh_3 = Module[
                    '_emscripten_bind_Decoder_GetFaceFromMesh_3'
                ] =
                    Module['asm']['Ta']).apply(null, arguments);
            });
        var _emscripten_bind_Decoder_GetTriangleStripsFromMesh_2 = (Module[
            '_emscripten_bind_Decoder_GetTriangleStripsFromMesh_2'
        ] = function () {
            return (_emscripten_bind_Decoder_GetTriangleStripsFromMesh_2 = Module[
                '_emscripten_bind_Decoder_GetTriangleStripsFromMesh_2'
            ] =
                Module['asm']['Ua']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetTrianglesUInt16Array_3 = (Module[
            '_emscripten_bind_Decoder_GetTrianglesUInt16Array_3'
        ] = function () {
            return (_emscripten_bind_Decoder_GetTrianglesUInt16Array_3 = Module[
                '_emscripten_bind_Decoder_GetTrianglesUInt16Array_3'
            ] =
                Module['asm']['Va']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetTrianglesUInt32Array_3 = (Module[
            '_emscripten_bind_Decoder_GetTrianglesUInt32Array_3'
        ] = function () {
            return (_emscripten_bind_Decoder_GetTrianglesUInt32Array_3 = Module[
                '_emscripten_bind_Decoder_GetTrianglesUInt32Array_3'
            ] =
                Module['asm']['Wa']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeFloat_3 = (Module['_emscripten_bind_Decoder_GetAttributeFloat_3'] =
            function () {
                return (_emscripten_bind_Decoder_GetAttributeFloat_3 = Module[
                    '_emscripten_bind_Decoder_GetAttributeFloat_3'
                ] =
                    Module['asm']['Xa']).apply(null, arguments);
            });
        var _emscripten_bind_Decoder_GetAttributeFloatForAllPoints_3 = (Module[
            '_emscripten_bind_Decoder_GetAttributeFloatForAllPoints_3'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeFloatForAllPoints_3 = Module[
                '_emscripten_bind_Decoder_GetAttributeFloatForAllPoints_3'
            ] =
                Module['asm']['Ya']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeIntForAllPoints_3 = (Module[
            '_emscripten_bind_Decoder_GetAttributeIntForAllPoints_3'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeIntForAllPoints_3 = Module[
                '_emscripten_bind_Decoder_GetAttributeIntForAllPoints_3'
            ] =
                Module['asm']['Za']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeInt8ForAllPoints_3 = (Module[
            '_emscripten_bind_Decoder_GetAttributeInt8ForAllPoints_3'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeInt8ForAllPoints_3 = Module[
                '_emscripten_bind_Decoder_GetAttributeInt8ForAllPoints_3'
            ] =
                Module['asm']['_a']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeUInt8ForAllPoints_3 = (Module[
            '_emscripten_bind_Decoder_GetAttributeUInt8ForAllPoints_3'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeUInt8ForAllPoints_3 = Module[
                '_emscripten_bind_Decoder_GetAttributeUInt8ForAllPoints_3'
            ] =
                Module['asm']['$a']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeInt16ForAllPoints_3 = (Module[
            '_emscripten_bind_Decoder_GetAttributeInt16ForAllPoints_3'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeInt16ForAllPoints_3 = Module[
                '_emscripten_bind_Decoder_GetAttributeInt16ForAllPoints_3'
            ] =
                Module['asm']['ab']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeUInt16ForAllPoints_3 = (Module[
            '_emscripten_bind_Decoder_GetAttributeUInt16ForAllPoints_3'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeUInt16ForAllPoints_3 = Module[
                '_emscripten_bind_Decoder_GetAttributeUInt16ForAllPoints_3'
            ] =
                Module['asm']['bb']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeInt32ForAllPoints_3 = (Module[
            '_emscripten_bind_Decoder_GetAttributeInt32ForAllPoints_3'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeInt32ForAllPoints_3 = Module[
                '_emscripten_bind_Decoder_GetAttributeInt32ForAllPoints_3'
            ] =
                Module['asm']['cb']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeUInt32ForAllPoints_3 = (Module[
            '_emscripten_bind_Decoder_GetAttributeUInt32ForAllPoints_3'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeUInt32ForAllPoints_3 = Module[
                '_emscripten_bind_Decoder_GetAttributeUInt32ForAllPoints_3'
            ] =
                Module['asm']['db']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetAttributeDataArrayForAllPoints_5 = (Module[
            '_emscripten_bind_Decoder_GetAttributeDataArrayForAllPoints_5'
        ] = function () {
            return (_emscripten_bind_Decoder_GetAttributeDataArrayForAllPoints_5 = Module[
                '_emscripten_bind_Decoder_GetAttributeDataArrayForAllPoints_5'
            ] =
                Module['asm']['eb']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_SkipAttributeTransform_1 = (Module[
            '_emscripten_bind_Decoder_SkipAttributeTransform_1'
        ] = function () {
            return (_emscripten_bind_Decoder_SkipAttributeTransform_1 = Module[
                '_emscripten_bind_Decoder_SkipAttributeTransform_1'
            ] =
                Module['asm']['fb']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_GetEncodedGeometryType_Deprecated_1 = (Module[
            '_emscripten_bind_Decoder_GetEncodedGeometryType_Deprecated_1'
        ] = function () {
            return (_emscripten_bind_Decoder_GetEncodedGeometryType_Deprecated_1 = Module[
                '_emscripten_bind_Decoder_GetEncodedGeometryType_Deprecated_1'
            ] =
                Module['asm']['gb']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_DecodeBufferToPointCloud_2 = (Module[
            '_emscripten_bind_Decoder_DecodeBufferToPointCloud_2'
        ] = function () {
            return (_emscripten_bind_Decoder_DecodeBufferToPointCloud_2 = Module[
                '_emscripten_bind_Decoder_DecodeBufferToPointCloud_2'
            ] =
                Module['asm']['hb']).apply(null, arguments);
        });
        var _emscripten_bind_Decoder_DecodeBufferToMesh_2 = (Module['_emscripten_bind_Decoder_DecodeBufferToMesh_2'] =
            function () {
                return (_emscripten_bind_Decoder_DecodeBufferToMesh_2 = Module[
                    '_emscripten_bind_Decoder_DecodeBufferToMesh_2'
                ] =
                    Module['asm']['ib']).apply(null, arguments);
            });
        var _emscripten_bind_Decoder___destroy___0 = (Module['_emscripten_bind_Decoder___destroy___0'] = function () {
            return (_emscripten_bind_Decoder___destroy___0 = Module['_emscripten_bind_Decoder___destroy___0'] =
                Module['asm']['jb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_INVALID_TRANSFORM = (Module[
            '_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_INVALID_TRANSFORM'
        ] = function () {
            return (_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_INVALID_TRANSFORM = Module[
                '_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_INVALID_TRANSFORM'
            ] =
                Module['asm']['kb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_NO_TRANSFORM = (Module[
            '_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_NO_TRANSFORM'
        ] = function () {
            return (_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_NO_TRANSFORM = Module[
                '_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_NO_TRANSFORM'
            ] =
                Module['asm']['lb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_QUANTIZATION_TRANSFORM = (Module[
            '_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_QUANTIZATION_TRANSFORM'
        ] = function () {
            return (_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_QUANTIZATION_TRANSFORM = Module[
                '_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_QUANTIZATION_TRANSFORM'
            ] =
                Module['asm']['mb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_OCTAHEDRON_TRANSFORM = (Module[
            '_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_OCTAHEDRON_TRANSFORM'
        ] = function () {
            return (_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_OCTAHEDRON_TRANSFORM = Module[
                '_emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_OCTAHEDRON_TRANSFORM'
            ] =
                Module['asm']['nb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_GeometryAttribute_Type_INVALID = (Module[
            '_emscripten_enum_draco_GeometryAttribute_Type_INVALID'
        ] = function () {
            return (_emscripten_enum_draco_GeometryAttribute_Type_INVALID = Module[
                '_emscripten_enum_draco_GeometryAttribute_Type_INVALID'
            ] =
                Module['asm']['ob']).apply(null, arguments);
        });
        var _emscripten_enum_draco_GeometryAttribute_Type_POSITION = (Module[
            '_emscripten_enum_draco_GeometryAttribute_Type_POSITION'
        ] = function () {
            return (_emscripten_enum_draco_GeometryAttribute_Type_POSITION = Module[
                '_emscripten_enum_draco_GeometryAttribute_Type_POSITION'
            ] =
                Module['asm']['pb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_GeometryAttribute_Type_NORMAL = (Module[
            '_emscripten_enum_draco_GeometryAttribute_Type_NORMAL'
        ] = function () {
            return (_emscripten_enum_draco_GeometryAttribute_Type_NORMAL = Module[
                '_emscripten_enum_draco_GeometryAttribute_Type_NORMAL'
            ] =
                Module['asm']['qb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_GeometryAttribute_Type_COLOR = (Module[
            '_emscripten_enum_draco_GeometryAttribute_Type_COLOR'
        ] = function () {
            return (_emscripten_enum_draco_GeometryAttribute_Type_COLOR = Module[
                '_emscripten_enum_draco_GeometryAttribute_Type_COLOR'
            ] =
                Module['asm']['rb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_GeometryAttribute_Type_TEX_COORD = (Module[
            '_emscripten_enum_draco_GeometryAttribute_Type_TEX_COORD'
        ] = function () {
            return (_emscripten_enum_draco_GeometryAttribute_Type_TEX_COORD = Module[
                '_emscripten_enum_draco_GeometryAttribute_Type_TEX_COORD'
            ] =
                Module['asm']['sb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_GeometryAttribute_Type_GENERIC = (Module[
            '_emscripten_enum_draco_GeometryAttribute_Type_GENERIC'
        ] = function () {
            return (_emscripten_enum_draco_GeometryAttribute_Type_GENERIC = Module[
                '_emscripten_enum_draco_GeometryAttribute_Type_GENERIC'
            ] =
                Module['asm']['tb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_EncodedGeometryType_INVALID_GEOMETRY_TYPE = (Module[
            '_emscripten_enum_draco_EncodedGeometryType_INVALID_GEOMETRY_TYPE'
        ] = function () {
            return (_emscripten_enum_draco_EncodedGeometryType_INVALID_GEOMETRY_TYPE = Module[
                '_emscripten_enum_draco_EncodedGeometryType_INVALID_GEOMETRY_TYPE'
            ] =
                Module['asm']['ub']).apply(null, arguments);
        });
        var _emscripten_enum_draco_EncodedGeometryType_POINT_CLOUD = (Module[
            '_emscripten_enum_draco_EncodedGeometryType_POINT_CLOUD'
        ] = function () {
            return (_emscripten_enum_draco_EncodedGeometryType_POINT_CLOUD = Module[
                '_emscripten_enum_draco_EncodedGeometryType_POINT_CLOUD'
            ] =
                Module['asm']['vb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_EncodedGeometryType_TRIANGULAR_MESH = (Module[
            '_emscripten_enum_draco_EncodedGeometryType_TRIANGULAR_MESH'
        ] = function () {
            return (_emscripten_enum_draco_EncodedGeometryType_TRIANGULAR_MESH = Module[
                '_emscripten_enum_draco_EncodedGeometryType_TRIANGULAR_MESH'
            ] =
                Module['asm']['wb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_DataType_DT_INVALID = (Module['_emscripten_enum_draco_DataType_DT_INVALID'] =
            function () {
                return (_emscripten_enum_draco_DataType_DT_INVALID = Module[
                    '_emscripten_enum_draco_DataType_DT_INVALID'
                ] =
                    Module['asm']['xb']).apply(null, arguments);
            });
        var _emscripten_enum_draco_DataType_DT_INT8 = (Module['_emscripten_enum_draco_DataType_DT_INT8'] = function () {
            return (_emscripten_enum_draco_DataType_DT_INT8 = Module['_emscripten_enum_draco_DataType_DT_INT8'] =
                Module['asm']['yb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_DataType_DT_UINT8 = (Module['_emscripten_enum_draco_DataType_DT_UINT8'] =
            function () {
                return (_emscripten_enum_draco_DataType_DT_UINT8 = Module['_emscripten_enum_draco_DataType_DT_UINT8'] =
                    Module['asm']['zb']).apply(null, arguments);
            });
        var _emscripten_enum_draco_DataType_DT_INT16 = (Module['_emscripten_enum_draco_DataType_DT_INT16'] =
            function () {
                return (_emscripten_enum_draco_DataType_DT_INT16 = Module['_emscripten_enum_draco_DataType_DT_INT16'] =
                    Module['asm']['Ab']).apply(null, arguments);
            });
        var _emscripten_enum_draco_DataType_DT_UINT16 = (Module['_emscripten_enum_draco_DataType_DT_UINT16'] =
            function () {
                return (_emscripten_enum_draco_DataType_DT_UINT16 = Module[
                    '_emscripten_enum_draco_DataType_DT_UINT16'
                ] =
                    Module['asm']['Bb']).apply(null, arguments);
            });
        var _emscripten_enum_draco_DataType_DT_INT32 = (Module['_emscripten_enum_draco_DataType_DT_INT32'] =
            function () {
                return (_emscripten_enum_draco_DataType_DT_INT32 = Module['_emscripten_enum_draco_DataType_DT_INT32'] =
                    Module['asm']['Cb']).apply(null, arguments);
            });
        var _emscripten_enum_draco_DataType_DT_UINT32 = (Module['_emscripten_enum_draco_DataType_DT_UINT32'] =
            function () {
                return (_emscripten_enum_draco_DataType_DT_UINT32 = Module[
                    '_emscripten_enum_draco_DataType_DT_UINT32'
                ] =
                    Module['asm']['Db']).apply(null, arguments);
            });
        var _emscripten_enum_draco_DataType_DT_INT64 = (Module['_emscripten_enum_draco_DataType_DT_INT64'] =
            function () {
                return (_emscripten_enum_draco_DataType_DT_INT64 = Module['_emscripten_enum_draco_DataType_DT_INT64'] =
                    Module['asm']['Eb']).apply(null, arguments);
            });
        var _emscripten_enum_draco_DataType_DT_UINT64 = (Module['_emscripten_enum_draco_DataType_DT_UINT64'] =
            function () {
                return (_emscripten_enum_draco_DataType_DT_UINT64 = Module[
                    '_emscripten_enum_draco_DataType_DT_UINT64'
                ] =
                    Module['asm']['Fb']).apply(null, arguments);
            });
        var _emscripten_enum_draco_DataType_DT_FLOAT32 = (Module['_emscripten_enum_draco_DataType_DT_FLOAT32'] =
            function () {
                return (_emscripten_enum_draco_DataType_DT_FLOAT32 = Module[
                    '_emscripten_enum_draco_DataType_DT_FLOAT32'
                ] =
                    Module['asm']['Gb']).apply(null, arguments);
            });
        var _emscripten_enum_draco_DataType_DT_FLOAT64 = (Module['_emscripten_enum_draco_DataType_DT_FLOAT64'] =
            function () {
                return (_emscripten_enum_draco_DataType_DT_FLOAT64 = Module[
                    '_emscripten_enum_draco_DataType_DT_FLOAT64'
                ] =
                    Module['asm']['Hb']).apply(null, arguments);
            });
        var _emscripten_enum_draco_DataType_DT_BOOL = (Module['_emscripten_enum_draco_DataType_DT_BOOL'] = function () {
            return (_emscripten_enum_draco_DataType_DT_BOOL = Module['_emscripten_enum_draco_DataType_DT_BOOL'] =
                Module['asm']['Ib']).apply(null, arguments);
        });
        var _emscripten_enum_draco_DataType_DT_TYPES_COUNT = (Module['_emscripten_enum_draco_DataType_DT_TYPES_COUNT'] =
            function () {
                return (_emscripten_enum_draco_DataType_DT_TYPES_COUNT = Module[
                    '_emscripten_enum_draco_DataType_DT_TYPES_COUNT'
                ] =
                    Module['asm']['Jb']).apply(null, arguments);
            });
        var _emscripten_enum_draco_StatusCode_OK = (Module['_emscripten_enum_draco_StatusCode_OK'] = function () {
            return (_emscripten_enum_draco_StatusCode_OK = Module['_emscripten_enum_draco_StatusCode_OK'] =
                Module['asm']['Kb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_StatusCode_DRACO_ERROR = (Module['_emscripten_enum_draco_StatusCode_DRACO_ERROR'] =
            function () {
                return (_emscripten_enum_draco_StatusCode_DRACO_ERROR = Module[
                    '_emscripten_enum_draco_StatusCode_DRACO_ERROR'
                ] =
                    Module['asm']['Lb']).apply(null, arguments);
            });
        var _emscripten_enum_draco_StatusCode_IO_ERROR = (Module['_emscripten_enum_draco_StatusCode_IO_ERROR'] =
            function () {
                return (_emscripten_enum_draco_StatusCode_IO_ERROR = Module[
                    '_emscripten_enum_draco_StatusCode_IO_ERROR'
                ] =
                    Module['asm']['Mb']).apply(null, arguments);
            });
        var _emscripten_enum_draco_StatusCode_INVALID_PARAMETER = (Module[
            '_emscripten_enum_draco_StatusCode_INVALID_PARAMETER'
        ] = function () {
            return (_emscripten_enum_draco_StatusCode_INVALID_PARAMETER = Module[
                '_emscripten_enum_draco_StatusCode_INVALID_PARAMETER'
            ] =
                Module['asm']['Nb']).apply(null, arguments);
        });
        var _emscripten_enum_draco_StatusCode_UNSUPPORTED_VERSION = (Module[
            '_emscripten_enum_draco_StatusCode_UNSUPPORTED_VERSION'
        ] = function () {
            return (_emscripten_enum_draco_StatusCode_UNSUPPORTED_VERSION = Module[
                '_emscripten_enum_draco_StatusCode_UNSUPPORTED_VERSION'
            ] =
                Module['asm']['Ob']).apply(null, arguments);
        });
        var _emscripten_enum_draco_StatusCode_UNKNOWN_VERSION = (Module[
            '_emscripten_enum_draco_StatusCode_UNKNOWN_VERSION'
        ] = function () {
            return (_emscripten_enum_draco_StatusCode_UNKNOWN_VERSION = Module[
                '_emscripten_enum_draco_StatusCode_UNKNOWN_VERSION'
            ] =
                Module['asm']['Pb']).apply(null, arguments);
        });
        var ___errno_location = function () {
            return (___errno_location = Module['asm']['__errno_location']).apply(null, arguments);
        };
        var _malloc = (Module['_malloc'] = function () {
            return (_malloc = Module['_malloc'] = Module['asm']['Qb']).apply(null, arguments);
        });
        var _free = (Module['_free'] = function () {
            return (_free = Module['_free'] = Module['asm']['Rb']).apply(null, arguments);
        });
        var ___cxa_is_pointer_type = function () {
            return (___cxa_is_pointer_type = Module['asm']['Sb']).apply(null, arguments);
        };
        var ___start_em_js = (Module['___start_em_js'] = 14588);
        var ___stop_em_js = (Module['___stop_em_js'] = 14686);
        var calledRun;
        dependenciesFulfilled = function runCaller() {
            if (!calledRun) run();
            if (!calledRun) dependenciesFulfilled = runCaller;
        };
        function run() {
            if (runDependencies > 0) {
                return;
            }
            preRun();
            if (runDependencies > 0) {
                return;
            }
            function doRun() {
                if (calledRun) return;
                calledRun = true;
                Module['calledRun'] = true;
                if (ABORT) return;
                initRuntime();
                readyPromiseResolve(Module);
                if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();
                postRun();
            }
            if (Module['setStatus']) {
                Module['setStatus']('Running...');
                setTimeout(function () {
                    setTimeout(function () {
                        Module['setStatus']('');
                    }, 1);
                    doRun();
                }, 1);
            } else {
                doRun();
            }
        }
        if (Module['preInit']) {
            if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
            while (Module['preInit'].length > 0) {
                Module['preInit'].pop()();
            }
        }
        run();
        function WrapperObject() {}
        WrapperObject.prototype = Object.create(WrapperObject.prototype);
        WrapperObject.prototype.constructor = WrapperObject;
        WrapperObject.prototype.__class__ = WrapperObject;
        WrapperObject.__cache__ = {};
        Module['WrapperObject'] = WrapperObject;
        function getCache(__class__) {
            return (__class__ || WrapperObject).__cache__;
        }
        Module['getCache'] = getCache;
        function wrapPointer(ptr, __class__) {
            var cache = getCache(__class__);
            var ret = cache[ptr];
            if (ret) return ret;
            ret = Object.create((__class__ || WrapperObject).prototype);
            ret.ptr = ptr;
            return (cache[ptr] = ret);
        }
        Module['wrapPointer'] = wrapPointer;
        function castObject(obj, __class__) {
            return wrapPointer(obj.ptr, __class__);
        }
        Module['castObject'] = castObject;
        Module['NULL'] = wrapPointer(0);
        function destroy(obj) {
            if (!obj['__destroy__']) throw 'Error: Cannot destroy object. (Did you create it yourself?)';
            obj['__destroy__']();
            delete getCache(obj.__class__)[obj.ptr];
        }
        Module['destroy'] = destroy;
        function compare(obj1, obj2) {
            return obj1.ptr === obj2.ptr;
        }
        Module['compare'] = compare;
        function getPointer(obj) {
            return obj.ptr;
        }
        Module['getPointer'] = getPointer;
        function getClass(obj) {
            return obj.__class__;
        }
        Module['getClass'] = getClass;
        var ensureCache = {
            buffer: 0,
            size: 0,
            pos: 0,
            temps: [],
            needed: 0,
            prepare: function () {
                if (ensureCache.needed) {
                    for (var i = 0; i < ensureCache.temps.length; i++) {
                        Module['_free'](ensureCache.temps[i]);
                    }
                    ensureCache.temps.length = 0;
                    Module['_free'](ensureCache.buffer);
                    ensureCache.buffer = 0;
                    ensureCache.size += ensureCache.needed;
                    ensureCache.needed = 0;
                }
                if (!ensureCache.buffer) {
                    ensureCache.size += 128;
                    ensureCache.buffer = Module['_malloc'](ensureCache.size);
                    assert(ensureCache.buffer);
                }
                ensureCache.pos = 0;
            },
            alloc: function (array, view) {
                assert(ensureCache.buffer);
                var bytes = view.BYTES_PER_ELEMENT;
                var len = array.length * bytes;
                len = (len + 7) & -8;
                var ret;
                if (ensureCache.pos + len >= ensureCache.size) {
                    assert(len > 0);
                    ensureCache.needed += len;
                    ret = Module['_malloc'](len);
                    ensureCache.temps.push(ret);
                } else {
                    ret = ensureCache.buffer + ensureCache.pos;
                    ensureCache.pos += len;
                }
                return ret;
            },
            copy: function (array, view, offset) {
                offset >>>= 0;
                var bytes = view.BYTES_PER_ELEMENT;
                switch (bytes) {
                    case 2:
                        offset >>>= 1;
                        break;
                    case 4:
                        offset >>>= 2;
                        break;
                    case 8:
                        offset >>>= 3;
                        break;
                }
                for (var i = 0; i < array.length; i++) {
                    view[offset + i] = array[i];
                }
            }
        };
        function ensureString(value) {
            if (typeof value === 'string') {
                var intArray = intArrayFromString(value);
                var offset = ensureCache.alloc(intArray, HEAP8);
                ensureCache.copy(intArray, HEAP8, offset);
                return offset;
            }
            return value;
        }
        function ensureInt8(value) {
            if (typeof value === 'object') {
                var offset = ensureCache.alloc(value, HEAP8);
                ensureCache.copy(value, HEAP8, offset);
                return offset;
            }
            return value;
        }
        function VoidPtr() {
            throw 'cannot construct a VoidPtr, no constructor in IDL';
        }
        VoidPtr.prototype = Object.create(WrapperObject.prototype);
        VoidPtr.prototype.constructor = VoidPtr;
        VoidPtr.prototype.__class__ = VoidPtr;
        VoidPtr.__cache__ = {};
        Module['VoidPtr'] = VoidPtr;
        VoidPtr.prototype['__destroy__'] = VoidPtr.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_VoidPtr___destroy___0(self);
        };
        function DecoderBuffer() {
            this.ptr = _emscripten_bind_DecoderBuffer_DecoderBuffer_0();
            getCache(DecoderBuffer)[this.ptr] = this;
        }
        DecoderBuffer.prototype = Object.create(WrapperObject.prototype);
        DecoderBuffer.prototype.constructor = DecoderBuffer;
        DecoderBuffer.prototype.__class__ = DecoderBuffer;
        DecoderBuffer.__cache__ = {};
        Module['DecoderBuffer'] = DecoderBuffer;
        DecoderBuffer.prototype['Init'] = DecoderBuffer.prototype.Init = function (data, data_size) {
            var self = this.ptr;
            ensureCache.prepare();
            if (typeof data == 'object') {
                data = ensureInt8(data);
            }
            if (data_size && typeof data_size === 'object') data_size = data_size.ptr;
            _emscripten_bind_DecoderBuffer_Init_2(self, data, data_size);
        };
        DecoderBuffer.prototype['__destroy__'] = DecoderBuffer.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_DecoderBuffer___destroy___0(self);
        };
        function AttributeTransformData() {
            this.ptr = _emscripten_bind_AttributeTransformData_AttributeTransformData_0();
            getCache(AttributeTransformData)[this.ptr] = this;
        }
        AttributeTransformData.prototype = Object.create(WrapperObject.prototype);
        AttributeTransformData.prototype.constructor = AttributeTransformData;
        AttributeTransformData.prototype.__class__ = AttributeTransformData;
        AttributeTransformData.__cache__ = {};
        Module['AttributeTransformData'] = AttributeTransformData;
        AttributeTransformData.prototype['transform_type'] = AttributeTransformData.prototype.transform_type =
            function () {
                var self = this.ptr;
                return _emscripten_bind_AttributeTransformData_transform_type_0(self);
            };
        AttributeTransformData.prototype['__destroy__'] = AttributeTransformData.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_AttributeTransformData___destroy___0(self);
        };
        function GeometryAttribute() {
            this.ptr = _emscripten_bind_GeometryAttribute_GeometryAttribute_0();
            getCache(GeometryAttribute)[this.ptr] = this;
        }
        GeometryAttribute.prototype = Object.create(WrapperObject.prototype);
        GeometryAttribute.prototype.constructor = GeometryAttribute;
        GeometryAttribute.prototype.__class__ = GeometryAttribute;
        GeometryAttribute.__cache__ = {};
        Module['GeometryAttribute'] = GeometryAttribute;
        GeometryAttribute.prototype['__destroy__'] = GeometryAttribute.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_GeometryAttribute___destroy___0(self);
        };
        function PointAttribute() {
            this.ptr = _emscripten_bind_PointAttribute_PointAttribute_0();
            getCache(PointAttribute)[this.ptr] = this;
        }
        PointAttribute.prototype = Object.create(WrapperObject.prototype);
        PointAttribute.prototype.constructor = PointAttribute;
        PointAttribute.prototype.__class__ = PointAttribute;
        PointAttribute.__cache__ = {};
        Module['PointAttribute'] = PointAttribute;
        PointAttribute.prototype['size'] = PointAttribute.prototype.size = function () {
            var self = this.ptr;
            return _emscripten_bind_PointAttribute_size_0(self);
        };
        PointAttribute.prototype['GetAttributeTransformData'] = PointAttribute.prototype.GetAttributeTransformData =
            function () {
                var self = this.ptr;
                return wrapPointer(
                    _emscripten_bind_PointAttribute_GetAttributeTransformData_0(self),
                    AttributeTransformData
                );
            };
        PointAttribute.prototype['attribute_type'] = PointAttribute.prototype.attribute_type = function () {
            var self = this.ptr;
            return _emscripten_bind_PointAttribute_attribute_type_0(self);
        };
        PointAttribute.prototype['data_type'] = PointAttribute.prototype.data_type = function () {
            var self = this.ptr;
            return _emscripten_bind_PointAttribute_data_type_0(self);
        };
        PointAttribute.prototype['num_components'] = PointAttribute.prototype.num_components = function () {
            var self = this.ptr;
            return _emscripten_bind_PointAttribute_num_components_0(self);
        };
        PointAttribute.prototype['normalized'] = PointAttribute.prototype.normalized = function () {
            var self = this.ptr;
            return !!_emscripten_bind_PointAttribute_normalized_0(self);
        };
        PointAttribute.prototype['byte_stride'] = PointAttribute.prototype.byte_stride = function () {
            var self = this.ptr;
            return _emscripten_bind_PointAttribute_byte_stride_0(self);
        };
        PointAttribute.prototype['byte_offset'] = PointAttribute.prototype.byte_offset = function () {
            var self = this.ptr;
            return _emscripten_bind_PointAttribute_byte_offset_0(self);
        };
        PointAttribute.prototype['unique_id'] = PointAttribute.prototype.unique_id = function () {
            var self = this.ptr;
            return _emscripten_bind_PointAttribute_unique_id_0(self);
        };
        PointAttribute.prototype['__destroy__'] = PointAttribute.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_PointAttribute___destroy___0(self);
        };
        function AttributeQuantizationTransform() {
            this.ptr = _emscripten_bind_AttributeQuantizationTransform_AttributeQuantizationTransform_0();
            getCache(AttributeQuantizationTransform)[this.ptr] = this;
        }
        AttributeQuantizationTransform.prototype = Object.create(WrapperObject.prototype);
        AttributeQuantizationTransform.prototype.constructor = AttributeQuantizationTransform;
        AttributeQuantizationTransform.prototype.__class__ = AttributeQuantizationTransform;
        AttributeQuantizationTransform.__cache__ = {};
        Module['AttributeQuantizationTransform'] = AttributeQuantizationTransform;
        AttributeQuantizationTransform.prototype['InitFromAttribute'] =
            AttributeQuantizationTransform.prototype.InitFromAttribute = function (att) {
                var self = this.ptr;
                if (att && typeof att === 'object') att = att.ptr;
                return !!_emscripten_bind_AttributeQuantizationTransform_InitFromAttribute_1(self, att);
            };
        AttributeQuantizationTransform.prototype['quantization_bits'] =
            AttributeQuantizationTransform.prototype.quantization_bits = function () {
                var self = this.ptr;
                return _emscripten_bind_AttributeQuantizationTransform_quantization_bits_0(self);
            };
        AttributeQuantizationTransform.prototype['min_value'] = AttributeQuantizationTransform.prototype.min_value =
            function (axis) {
                var self = this.ptr;
                if (axis && typeof axis === 'object') axis = axis.ptr;
                return _emscripten_bind_AttributeQuantizationTransform_min_value_1(self, axis);
            };
        AttributeQuantizationTransform.prototype['range'] = AttributeQuantizationTransform.prototype.range =
            function () {
                var self = this.ptr;
                return _emscripten_bind_AttributeQuantizationTransform_range_0(self);
            };
        AttributeQuantizationTransform.prototype['__destroy__'] = AttributeQuantizationTransform.prototype.__destroy__ =
            function () {
                var self = this.ptr;
                _emscripten_bind_AttributeQuantizationTransform___destroy___0(self);
            };
        function AttributeOctahedronTransform() {
            this.ptr = _emscripten_bind_AttributeOctahedronTransform_AttributeOctahedronTransform_0();
            getCache(AttributeOctahedronTransform)[this.ptr] = this;
        }
        AttributeOctahedronTransform.prototype = Object.create(WrapperObject.prototype);
        AttributeOctahedronTransform.prototype.constructor = AttributeOctahedronTransform;
        AttributeOctahedronTransform.prototype.__class__ = AttributeOctahedronTransform;
        AttributeOctahedronTransform.__cache__ = {};
        Module['AttributeOctahedronTransform'] = AttributeOctahedronTransform;
        AttributeOctahedronTransform.prototype['InitFromAttribute'] =
            AttributeOctahedronTransform.prototype.InitFromAttribute = function (att) {
                var self = this.ptr;
                if (att && typeof att === 'object') att = att.ptr;
                return !!_emscripten_bind_AttributeOctahedronTransform_InitFromAttribute_1(self, att);
            };
        AttributeOctahedronTransform.prototype['quantization_bits'] =
            AttributeOctahedronTransform.prototype.quantization_bits = function () {
                var self = this.ptr;
                return _emscripten_bind_AttributeOctahedronTransform_quantization_bits_0(self);
            };
        AttributeOctahedronTransform.prototype['__destroy__'] = AttributeOctahedronTransform.prototype.__destroy__ =
            function () {
                var self = this.ptr;
                _emscripten_bind_AttributeOctahedronTransform___destroy___0(self);
            };
        function PointCloud() {
            this.ptr = _emscripten_bind_PointCloud_PointCloud_0();
            getCache(PointCloud)[this.ptr] = this;
        }
        PointCloud.prototype = Object.create(WrapperObject.prototype);
        PointCloud.prototype.constructor = PointCloud;
        PointCloud.prototype.__class__ = PointCloud;
        PointCloud.__cache__ = {};
        Module['PointCloud'] = PointCloud;
        PointCloud.prototype['num_attributes'] = PointCloud.prototype.num_attributes = function () {
            var self = this.ptr;
            return _emscripten_bind_PointCloud_num_attributes_0(self);
        };
        PointCloud.prototype['num_points'] = PointCloud.prototype.num_points = function () {
            var self = this.ptr;
            return _emscripten_bind_PointCloud_num_points_0(self);
        };
        PointCloud.prototype['__destroy__'] = PointCloud.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_PointCloud___destroy___0(self);
        };
        function Mesh() {
            this.ptr = _emscripten_bind_Mesh_Mesh_0();
            getCache(Mesh)[this.ptr] = this;
        }
        Mesh.prototype = Object.create(WrapperObject.prototype);
        Mesh.prototype.constructor = Mesh;
        Mesh.prototype.__class__ = Mesh;
        Mesh.__cache__ = {};
        Module['Mesh'] = Mesh;
        Mesh.prototype['num_faces'] = Mesh.prototype.num_faces = function () {
            var self = this.ptr;
            return _emscripten_bind_Mesh_num_faces_0(self);
        };
        Mesh.prototype['num_attributes'] = Mesh.prototype.num_attributes = function () {
            var self = this.ptr;
            return _emscripten_bind_Mesh_num_attributes_0(self);
        };
        Mesh.prototype['num_points'] = Mesh.prototype.num_points = function () {
            var self = this.ptr;
            return _emscripten_bind_Mesh_num_points_0(self);
        };
        Mesh.prototype['__destroy__'] = Mesh.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_Mesh___destroy___0(self);
        };
        function Metadata() {
            this.ptr = _emscripten_bind_Metadata_Metadata_0();
            getCache(Metadata)[this.ptr] = this;
        }
        Metadata.prototype = Object.create(WrapperObject.prototype);
        Metadata.prototype.constructor = Metadata;
        Metadata.prototype.__class__ = Metadata;
        Metadata.__cache__ = {};
        Module['Metadata'] = Metadata;
        Metadata.prototype['__destroy__'] = Metadata.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_Metadata___destroy___0(self);
        };
        function Status() {
            throw 'cannot construct a Status, no constructor in IDL';
        }
        Status.prototype = Object.create(WrapperObject.prototype);
        Status.prototype.constructor = Status;
        Status.prototype.__class__ = Status;
        Status.__cache__ = {};
        Module['Status'] = Status;
        Status.prototype['code'] = Status.prototype.code = function () {
            var self = this.ptr;
            return _emscripten_bind_Status_code_0(self);
        };
        Status.prototype['ok'] = Status.prototype.ok = function () {
            var self = this.ptr;
            return !!_emscripten_bind_Status_ok_0(self);
        };
        Status.prototype['error_msg'] = Status.prototype.error_msg = function () {
            var self = this.ptr;
            return UTF8ToString(_emscripten_bind_Status_error_msg_0(self));
        };
        Status.prototype['__destroy__'] = Status.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_Status___destroy___0(self);
        };
        function DracoFloat32Array() {
            this.ptr = _emscripten_bind_DracoFloat32Array_DracoFloat32Array_0();
            getCache(DracoFloat32Array)[this.ptr] = this;
        }
        DracoFloat32Array.prototype = Object.create(WrapperObject.prototype);
        DracoFloat32Array.prototype.constructor = DracoFloat32Array;
        DracoFloat32Array.prototype.__class__ = DracoFloat32Array;
        DracoFloat32Array.__cache__ = {};
        Module['DracoFloat32Array'] = DracoFloat32Array;
        DracoFloat32Array.prototype['GetValue'] = DracoFloat32Array.prototype.GetValue = function (index) {
            var self = this.ptr;
            if (index && typeof index === 'object') index = index.ptr;
            return _emscripten_bind_DracoFloat32Array_GetValue_1(self, index);
        };
        DracoFloat32Array.prototype['size'] = DracoFloat32Array.prototype.size = function () {
            var self = this.ptr;
            return _emscripten_bind_DracoFloat32Array_size_0(self);
        };
        DracoFloat32Array.prototype['__destroy__'] = DracoFloat32Array.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_DracoFloat32Array___destroy___0(self);
        };
        function DracoInt8Array() {
            this.ptr = _emscripten_bind_DracoInt8Array_DracoInt8Array_0();
            getCache(DracoInt8Array)[this.ptr] = this;
        }
        DracoInt8Array.prototype = Object.create(WrapperObject.prototype);
        DracoInt8Array.prototype.constructor = DracoInt8Array;
        DracoInt8Array.prototype.__class__ = DracoInt8Array;
        DracoInt8Array.__cache__ = {};
        Module['DracoInt8Array'] = DracoInt8Array;
        DracoInt8Array.prototype['GetValue'] = DracoInt8Array.prototype.GetValue = function (index) {
            var self = this.ptr;
            if (index && typeof index === 'object') index = index.ptr;
            return _emscripten_bind_DracoInt8Array_GetValue_1(self, index);
        };
        DracoInt8Array.prototype['size'] = DracoInt8Array.prototype.size = function () {
            var self = this.ptr;
            return _emscripten_bind_DracoInt8Array_size_0(self);
        };
        DracoInt8Array.prototype['__destroy__'] = DracoInt8Array.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_DracoInt8Array___destroy___0(self);
        };
        function DracoUInt8Array() {
            this.ptr = _emscripten_bind_DracoUInt8Array_DracoUInt8Array_0();
            getCache(DracoUInt8Array)[this.ptr] = this;
        }
        DracoUInt8Array.prototype = Object.create(WrapperObject.prototype);
        DracoUInt8Array.prototype.constructor = DracoUInt8Array;
        DracoUInt8Array.prototype.__class__ = DracoUInt8Array;
        DracoUInt8Array.__cache__ = {};
        Module['DracoUInt8Array'] = DracoUInt8Array;
        DracoUInt8Array.prototype['GetValue'] = DracoUInt8Array.prototype.GetValue = function (index) {
            var self = this.ptr;
            if (index && typeof index === 'object') index = index.ptr;
            return _emscripten_bind_DracoUInt8Array_GetValue_1(self, index);
        };
        DracoUInt8Array.prototype['size'] = DracoUInt8Array.prototype.size = function () {
            var self = this.ptr;
            return _emscripten_bind_DracoUInt8Array_size_0(self);
        };
        DracoUInt8Array.prototype['__destroy__'] = DracoUInt8Array.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_DracoUInt8Array___destroy___0(self);
        };
        function DracoInt16Array() {
            this.ptr = _emscripten_bind_DracoInt16Array_DracoInt16Array_0();
            getCache(DracoInt16Array)[this.ptr] = this;
        }
        DracoInt16Array.prototype = Object.create(WrapperObject.prototype);
        DracoInt16Array.prototype.constructor = DracoInt16Array;
        DracoInt16Array.prototype.__class__ = DracoInt16Array;
        DracoInt16Array.__cache__ = {};
        Module['DracoInt16Array'] = DracoInt16Array;
        DracoInt16Array.prototype['GetValue'] = DracoInt16Array.prototype.GetValue = function (index) {
            var self = this.ptr;
            if (index && typeof index === 'object') index = index.ptr;
            return _emscripten_bind_DracoInt16Array_GetValue_1(self, index);
        };
        DracoInt16Array.prototype['size'] = DracoInt16Array.prototype.size = function () {
            var self = this.ptr;
            return _emscripten_bind_DracoInt16Array_size_0(self);
        };
        DracoInt16Array.prototype['__destroy__'] = DracoInt16Array.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_DracoInt16Array___destroy___0(self);
        };
        function DracoUInt16Array() {
            this.ptr = _emscripten_bind_DracoUInt16Array_DracoUInt16Array_0();
            getCache(DracoUInt16Array)[this.ptr] = this;
        }
        DracoUInt16Array.prototype = Object.create(WrapperObject.prototype);
        DracoUInt16Array.prototype.constructor = DracoUInt16Array;
        DracoUInt16Array.prototype.__class__ = DracoUInt16Array;
        DracoUInt16Array.__cache__ = {};
        Module['DracoUInt16Array'] = DracoUInt16Array;
        DracoUInt16Array.prototype['GetValue'] = DracoUInt16Array.prototype.GetValue = function (index) {
            var self = this.ptr;
            if (index && typeof index === 'object') index = index.ptr;
            return _emscripten_bind_DracoUInt16Array_GetValue_1(self, index);
        };
        DracoUInt16Array.prototype['size'] = DracoUInt16Array.prototype.size = function () {
            var self = this.ptr;
            return _emscripten_bind_DracoUInt16Array_size_0(self);
        };
        DracoUInt16Array.prototype['__destroy__'] = DracoUInt16Array.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_DracoUInt16Array___destroy___0(self);
        };
        function DracoInt32Array() {
            this.ptr = _emscripten_bind_DracoInt32Array_DracoInt32Array_0();
            getCache(DracoInt32Array)[this.ptr] = this;
        }
        DracoInt32Array.prototype = Object.create(WrapperObject.prototype);
        DracoInt32Array.prototype.constructor = DracoInt32Array;
        DracoInt32Array.prototype.__class__ = DracoInt32Array;
        DracoInt32Array.__cache__ = {};
        Module['DracoInt32Array'] = DracoInt32Array;
        DracoInt32Array.prototype['GetValue'] = DracoInt32Array.prototype.GetValue = function (index) {
            var self = this.ptr;
            if (index && typeof index === 'object') index = index.ptr;
            return _emscripten_bind_DracoInt32Array_GetValue_1(self, index);
        };
        DracoInt32Array.prototype['size'] = DracoInt32Array.prototype.size = function () {
            var self = this.ptr;
            return _emscripten_bind_DracoInt32Array_size_0(self);
        };
        DracoInt32Array.prototype['__destroy__'] = DracoInt32Array.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_DracoInt32Array___destroy___0(self);
        };
        function DracoUInt32Array() {
            this.ptr = _emscripten_bind_DracoUInt32Array_DracoUInt32Array_0();
            getCache(DracoUInt32Array)[this.ptr] = this;
        }
        DracoUInt32Array.prototype = Object.create(WrapperObject.prototype);
        DracoUInt32Array.prototype.constructor = DracoUInt32Array;
        DracoUInt32Array.prototype.__class__ = DracoUInt32Array;
        DracoUInt32Array.__cache__ = {};
        Module['DracoUInt32Array'] = DracoUInt32Array;
        DracoUInt32Array.prototype['GetValue'] = DracoUInt32Array.prototype.GetValue = function (index) {
            var self = this.ptr;
            if (index && typeof index === 'object') index = index.ptr;
            return _emscripten_bind_DracoUInt32Array_GetValue_1(self, index);
        };
        DracoUInt32Array.prototype['size'] = DracoUInt32Array.prototype.size = function () {
            var self = this.ptr;
            return _emscripten_bind_DracoUInt32Array_size_0(self);
        };
        DracoUInt32Array.prototype['__destroy__'] = DracoUInt32Array.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_DracoUInt32Array___destroy___0(self);
        };
        function MetadataQuerier() {
            this.ptr = _emscripten_bind_MetadataQuerier_MetadataQuerier_0();
            getCache(MetadataQuerier)[this.ptr] = this;
        }
        MetadataQuerier.prototype = Object.create(WrapperObject.prototype);
        MetadataQuerier.prototype.constructor = MetadataQuerier;
        MetadataQuerier.prototype.__class__ = MetadataQuerier;
        MetadataQuerier.__cache__ = {};
        Module['MetadataQuerier'] = MetadataQuerier;
        MetadataQuerier.prototype['HasEntry'] = MetadataQuerier.prototype.HasEntry = function (metadata, entry_name) {
            var self = this.ptr;
            ensureCache.prepare();
            if (metadata && typeof metadata === 'object') metadata = metadata.ptr;
            if (entry_name && typeof entry_name === 'object') entry_name = entry_name.ptr;
            else entry_name = ensureString(entry_name);
            return !!_emscripten_bind_MetadataQuerier_HasEntry_2(self, metadata, entry_name);
        };
        MetadataQuerier.prototype['GetIntEntry'] = MetadataQuerier.prototype.GetIntEntry = function (
            metadata,
            entry_name
        ) {
            var self = this.ptr;
            ensureCache.prepare();
            if (metadata && typeof metadata === 'object') metadata = metadata.ptr;
            if (entry_name && typeof entry_name === 'object') entry_name = entry_name.ptr;
            else entry_name = ensureString(entry_name);
            return _emscripten_bind_MetadataQuerier_GetIntEntry_2(self, metadata, entry_name);
        };
        MetadataQuerier.prototype['GetIntEntryArray'] = MetadataQuerier.prototype.GetIntEntryArray = function (
            metadata,
            entry_name,
            out_values
        ) {
            var self = this.ptr;
            ensureCache.prepare();
            if (metadata && typeof metadata === 'object') metadata = metadata.ptr;
            if (entry_name && typeof entry_name === 'object') entry_name = entry_name.ptr;
            else entry_name = ensureString(entry_name);
            if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
            _emscripten_bind_MetadataQuerier_GetIntEntryArray_3(self, metadata, entry_name, out_values);
        };
        MetadataQuerier.prototype['GetDoubleEntry'] = MetadataQuerier.prototype.GetDoubleEntry = function (
            metadata,
            entry_name
        ) {
            var self = this.ptr;
            ensureCache.prepare();
            if (metadata && typeof metadata === 'object') metadata = metadata.ptr;
            if (entry_name && typeof entry_name === 'object') entry_name = entry_name.ptr;
            else entry_name = ensureString(entry_name);
            return _emscripten_bind_MetadataQuerier_GetDoubleEntry_2(self, metadata, entry_name);
        };
        MetadataQuerier.prototype['GetStringEntry'] = MetadataQuerier.prototype.GetStringEntry = function (
            metadata,
            entry_name
        ) {
            var self = this.ptr;
            ensureCache.prepare();
            if (metadata && typeof metadata === 'object') metadata = metadata.ptr;
            if (entry_name && typeof entry_name === 'object') entry_name = entry_name.ptr;
            else entry_name = ensureString(entry_name);
            return UTF8ToString(_emscripten_bind_MetadataQuerier_GetStringEntry_2(self, metadata, entry_name));
        };
        MetadataQuerier.prototype['NumEntries'] = MetadataQuerier.prototype.NumEntries = function (metadata) {
            var self = this.ptr;
            if (metadata && typeof metadata === 'object') metadata = metadata.ptr;
            return _emscripten_bind_MetadataQuerier_NumEntries_1(self, metadata);
        };
        MetadataQuerier.prototype['GetEntryName'] = MetadataQuerier.prototype.GetEntryName = function (
            metadata,
            entry_id
        ) {
            var self = this.ptr;
            if (metadata && typeof metadata === 'object') metadata = metadata.ptr;
            if (entry_id && typeof entry_id === 'object') entry_id = entry_id.ptr;
            return UTF8ToString(_emscripten_bind_MetadataQuerier_GetEntryName_2(self, metadata, entry_id));
        };
        MetadataQuerier.prototype['__destroy__'] = MetadataQuerier.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_MetadataQuerier___destroy___0(self);
        };
        function Decoder() {
            this.ptr = _emscripten_bind_Decoder_Decoder_0();
            getCache(Decoder)[this.ptr] = this;
        }
        Decoder.prototype = Object.create(WrapperObject.prototype);
        Decoder.prototype.constructor = Decoder;
        Decoder.prototype.__class__ = Decoder;
        Decoder.__cache__ = {};
        Module['Decoder'] = Decoder;
        Decoder.prototype['DecodeArrayToPointCloud'] = Decoder.prototype.DecodeArrayToPointCloud = function (
            data,
            data_size,
            out_point_cloud
        ) {
            var self = this.ptr;
            ensureCache.prepare();
            if (typeof data == 'object') {
                data = ensureInt8(data);
            }
            if (data_size && typeof data_size === 'object') data_size = data_size.ptr;
            if (out_point_cloud && typeof out_point_cloud === 'object') out_point_cloud = out_point_cloud.ptr;
            return wrapPointer(
                _emscripten_bind_Decoder_DecodeArrayToPointCloud_3(self, data, data_size, out_point_cloud),
                Status
            );
        };
        Decoder.prototype['DecodeArrayToMesh'] = Decoder.prototype.DecodeArrayToMesh = function (
            data,
            data_size,
            out_mesh
        ) {
            var self = this.ptr;
            ensureCache.prepare();
            if (typeof data == 'object') {
                data = ensureInt8(data);
            }
            if (data_size && typeof data_size === 'object') data_size = data_size.ptr;
            if (out_mesh && typeof out_mesh === 'object') out_mesh = out_mesh.ptr;
            return wrapPointer(_emscripten_bind_Decoder_DecodeArrayToMesh_3(self, data, data_size, out_mesh), Status);
        };
        Decoder.prototype['GetAttributeId'] = Decoder.prototype.GetAttributeId = function (pc, type) {
            var self = this.ptr;
            if (pc && typeof pc === 'object') pc = pc.ptr;
            if (type && typeof type === 'object') type = type.ptr;
            return _emscripten_bind_Decoder_GetAttributeId_2(self, pc, type);
        };
        Decoder.prototype['GetAttributeIdByName'] = Decoder.prototype.GetAttributeIdByName = function (pc, name) {
            var self = this.ptr;
            ensureCache.prepare();
            if (pc && typeof pc === 'object') pc = pc.ptr;
            if (name && typeof name === 'object') name = name.ptr;
            else name = ensureString(name);
            return _emscripten_bind_Decoder_GetAttributeIdByName_2(self, pc, name);
        };
        Decoder.prototype['GetAttributeIdByMetadataEntry'] = Decoder.prototype.GetAttributeIdByMetadataEntry =
            function (pc, name, value) {
                var self = this.ptr;
                ensureCache.prepare();
                if (pc && typeof pc === 'object') pc = pc.ptr;
                if (name && typeof name === 'object') name = name.ptr;
                else name = ensureString(name);
                if (value && typeof value === 'object') value = value.ptr;
                else value = ensureString(value);
                return _emscripten_bind_Decoder_GetAttributeIdByMetadataEntry_3(self, pc, name, value);
            };
        Decoder.prototype['GetAttribute'] = Decoder.prototype.GetAttribute = function (pc, att_id) {
            var self = this.ptr;
            if (pc && typeof pc === 'object') pc = pc.ptr;
            if (att_id && typeof att_id === 'object') att_id = att_id.ptr;
            return wrapPointer(_emscripten_bind_Decoder_GetAttribute_2(self, pc, att_id), PointAttribute);
        };
        Decoder.prototype['GetAttributeByUniqueId'] = Decoder.prototype.GetAttributeByUniqueId = function (
            pc,
            unique_id
        ) {
            var self = this.ptr;
            if (pc && typeof pc === 'object') pc = pc.ptr;
            if (unique_id && typeof unique_id === 'object') unique_id = unique_id.ptr;
            return wrapPointer(_emscripten_bind_Decoder_GetAttributeByUniqueId_2(self, pc, unique_id), PointAttribute);
        };
        Decoder.prototype['GetMetadata'] = Decoder.prototype.GetMetadata = function (pc) {
            var self = this.ptr;
            if (pc && typeof pc === 'object') pc = pc.ptr;
            return wrapPointer(_emscripten_bind_Decoder_GetMetadata_1(self, pc), Metadata);
        };
        Decoder.prototype['GetAttributeMetadata'] = Decoder.prototype.GetAttributeMetadata = function (pc, att_id) {
            var self = this.ptr;
            if (pc && typeof pc === 'object') pc = pc.ptr;
            if (att_id && typeof att_id === 'object') att_id = att_id.ptr;
            return wrapPointer(_emscripten_bind_Decoder_GetAttributeMetadata_2(self, pc, att_id), Metadata);
        };
        Decoder.prototype['GetFaceFromMesh'] = Decoder.prototype.GetFaceFromMesh = function (m, face_id, out_values) {
            var self = this.ptr;
            if (m && typeof m === 'object') m = m.ptr;
            if (face_id && typeof face_id === 'object') face_id = face_id.ptr;
            if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
            return !!_emscripten_bind_Decoder_GetFaceFromMesh_3(self, m, face_id, out_values);
        };
        Decoder.prototype['GetTriangleStripsFromMesh'] = Decoder.prototype.GetTriangleStripsFromMesh = function (
            m,
            strip_values
        ) {
            var self = this.ptr;
            if (m && typeof m === 'object') m = m.ptr;
            if (strip_values && typeof strip_values === 'object') strip_values = strip_values.ptr;
            return _emscripten_bind_Decoder_GetTriangleStripsFromMesh_2(self, m, strip_values);
        };
        Decoder.prototype['GetTrianglesUInt16Array'] = Decoder.prototype.GetTrianglesUInt16Array = function (
            m,
            out_size,
            out_values
        ) {
            var self = this.ptr;
            if (m && typeof m === 'object') m = m.ptr;
            if (out_size && typeof out_size === 'object') out_size = out_size.ptr;
            if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
            return !!_emscripten_bind_Decoder_GetTrianglesUInt16Array_3(self, m, out_size, out_values);
        };
        Decoder.prototype['GetTrianglesUInt32Array'] = Decoder.prototype.GetTrianglesUInt32Array = function (
            m,
            out_size,
            out_values
        ) {
            var self = this.ptr;
            if (m && typeof m === 'object') m = m.ptr;
            if (out_size && typeof out_size === 'object') out_size = out_size.ptr;
            if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
            return !!_emscripten_bind_Decoder_GetTrianglesUInt32Array_3(self, m, out_size, out_values);
        };
        Decoder.prototype['GetAttributeFloat'] = Decoder.prototype.GetAttributeFloat = function (
            pa,
            att_index,
            out_values
        ) {
            var self = this.ptr;
            if (pa && typeof pa === 'object') pa = pa.ptr;
            if (att_index && typeof att_index === 'object') att_index = att_index.ptr;
            if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
            return !!_emscripten_bind_Decoder_GetAttributeFloat_3(self, pa, att_index, out_values);
        };
        Decoder.prototype['GetAttributeFloatForAllPoints'] = Decoder.prototype.GetAttributeFloatForAllPoints =
            function (pc, pa, out_values) {
                var self = this.ptr;
                if (pc && typeof pc === 'object') pc = pc.ptr;
                if (pa && typeof pa === 'object') pa = pa.ptr;
                if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
                return !!_emscripten_bind_Decoder_GetAttributeFloatForAllPoints_3(self, pc, pa, out_values);
            };
        Decoder.prototype['GetAttributeIntForAllPoints'] = Decoder.prototype.GetAttributeIntForAllPoints = function (
            pc,
            pa,
            out_values
        ) {
            var self = this.ptr;
            if (pc && typeof pc === 'object') pc = pc.ptr;
            if (pa && typeof pa === 'object') pa = pa.ptr;
            if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
            return !!_emscripten_bind_Decoder_GetAttributeIntForAllPoints_3(self, pc, pa, out_values);
        };
        Decoder.prototype['GetAttributeInt8ForAllPoints'] = Decoder.prototype.GetAttributeInt8ForAllPoints = function (
            pc,
            pa,
            out_values
        ) {
            var self = this.ptr;
            if (pc && typeof pc === 'object') pc = pc.ptr;
            if (pa && typeof pa === 'object') pa = pa.ptr;
            if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
            return !!_emscripten_bind_Decoder_GetAttributeInt8ForAllPoints_3(self, pc, pa, out_values);
        };
        Decoder.prototype['GetAttributeUInt8ForAllPoints'] = Decoder.prototype.GetAttributeUInt8ForAllPoints =
            function (pc, pa, out_values) {
                var self = this.ptr;
                if (pc && typeof pc === 'object') pc = pc.ptr;
                if (pa && typeof pa === 'object') pa = pa.ptr;
                if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
                return !!_emscripten_bind_Decoder_GetAttributeUInt8ForAllPoints_3(self, pc, pa, out_values);
            };
        Decoder.prototype['GetAttributeInt16ForAllPoints'] = Decoder.prototype.GetAttributeInt16ForAllPoints =
            function (pc, pa, out_values) {
                var self = this.ptr;
                if (pc && typeof pc === 'object') pc = pc.ptr;
                if (pa && typeof pa === 'object') pa = pa.ptr;
                if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
                return !!_emscripten_bind_Decoder_GetAttributeInt16ForAllPoints_3(self, pc, pa, out_values);
            };
        Decoder.prototype['GetAttributeUInt16ForAllPoints'] = Decoder.prototype.GetAttributeUInt16ForAllPoints =
            function (pc, pa, out_values) {
                var self = this.ptr;
                if (pc && typeof pc === 'object') pc = pc.ptr;
                if (pa && typeof pa === 'object') pa = pa.ptr;
                if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
                return !!_emscripten_bind_Decoder_GetAttributeUInt16ForAllPoints_3(self, pc, pa, out_values);
            };
        Decoder.prototype['GetAttributeInt32ForAllPoints'] = Decoder.prototype.GetAttributeInt32ForAllPoints =
            function (pc, pa, out_values) {
                var self = this.ptr;
                if (pc && typeof pc === 'object') pc = pc.ptr;
                if (pa && typeof pa === 'object') pa = pa.ptr;
                if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
                return !!_emscripten_bind_Decoder_GetAttributeInt32ForAllPoints_3(self, pc, pa, out_values);
            };
        Decoder.prototype['GetAttributeUInt32ForAllPoints'] = Decoder.prototype.GetAttributeUInt32ForAllPoints =
            function (pc, pa, out_values) {
                var self = this.ptr;
                if (pc && typeof pc === 'object') pc = pc.ptr;
                if (pa && typeof pa === 'object') pa = pa.ptr;
                if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
                return !!_emscripten_bind_Decoder_GetAttributeUInt32ForAllPoints_3(self, pc, pa, out_values);
            };
        Decoder.prototype['GetAttributeDataArrayForAllPoints'] = Decoder.prototype.GetAttributeDataArrayForAllPoints =
            function (pc, pa, data_type, out_size, out_values) {
                var self = this.ptr;
                if (pc && typeof pc === 'object') pc = pc.ptr;
                if (pa && typeof pa === 'object') pa = pa.ptr;
                if (data_type && typeof data_type === 'object') data_type = data_type.ptr;
                if (out_size && typeof out_size === 'object') out_size = out_size.ptr;
                if (out_values && typeof out_values === 'object') out_values = out_values.ptr;
                return !!_emscripten_bind_Decoder_GetAttributeDataArrayForAllPoints_5(
                    self,
                    pc,
                    pa,
                    data_type,
                    out_size,
                    out_values
                );
            };
        Decoder.prototype['SkipAttributeTransform'] = Decoder.prototype.SkipAttributeTransform = function (att_type) {
            var self = this.ptr;
            if (att_type && typeof att_type === 'object') att_type = att_type.ptr;
            _emscripten_bind_Decoder_SkipAttributeTransform_1(self, att_type);
        };
        Decoder.prototype['GetEncodedGeometryType_Deprecated'] = Decoder.prototype.GetEncodedGeometryType_Deprecated =
            function (in_buffer) {
                var self = this.ptr;
                if (in_buffer && typeof in_buffer === 'object') in_buffer = in_buffer.ptr;
                return _emscripten_bind_Decoder_GetEncodedGeometryType_Deprecated_1(self, in_buffer);
            };
        Decoder.prototype['DecodeBufferToPointCloud'] = Decoder.prototype.DecodeBufferToPointCloud = function (
            in_buffer,
            out_point_cloud
        ) {
            var self = this.ptr;
            if (in_buffer && typeof in_buffer === 'object') in_buffer = in_buffer.ptr;
            if (out_point_cloud && typeof out_point_cloud === 'object') out_point_cloud = out_point_cloud.ptr;
            return wrapPointer(
                _emscripten_bind_Decoder_DecodeBufferToPointCloud_2(self, in_buffer, out_point_cloud),
                Status
            );
        };
        Decoder.prototype['DecodeBufferToMesh'] = Decoder.prototype.DecodeBufferToMesh = function (
            in_buffer,
            out_mesh
        ) {
            var self = this.ptr;
            if (in_buffer && typeof in_buffer === 'object') in_buffer = in_buffer.ptr;
            if (out_mesh && typeof out_mesh === 'object') out_mesh = out_mesh.ptr;
            return wrapPointer(_emscripten_bind_Decoder_DecodeBufferToMesh_2(self, in_buffer, out_mesh), Status);
        };
        Decoder.prototype['__destroy__'] = Decoder.prototype.__destroy__ = function () {
            var self = this.ptr;
            _emscripten_bind_Decoder___destroy___0(self);
        };
        (function () {
            function setupEnums() {
                Module['ATTRIBUTE_INVALID_TRANSFORM'] =
                    _emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_INVALID_TRANSFORM();
                Module['ATTRIBUTE_NO_TRANSFORM'] =
                    _emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_NO_TRANSFORM();
                Module['ATTRIBUTE_QUANTIZATION_TRANSFORM'] =
                    _emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_QUANTIZATION_TRANSFORM();
                Module['ATTRIBUTE_OCTAHEDRON_TRANSFORM'] =
                    _emscripten_enum_draco_AttributeTransformType_ATTRIBUTE_OCTAHEDRON_TRANSFORM();
                Module['INVALID'] = _emscripten_enum_draco_GeometryAttribute_Type_INVALID();
                Module['POSITION'] = _emscripten_enum_draco_GeometryAttribute_Type_POSITION();
                Module['NORMAL'] = _emscripten_enum_draco_GeometryAttribute_Type_NORMAL();
                Module['COLOR'] = _emscripten_enum_draco_GeometryAttribute_Type_COLOR();
                Module['TEX_COORD'] = _emscripten_enum_draco_GeometryAttribute_Type_TEX_COORD();
                Module['GENERIC'] = _emscripten_enum_draco_GeometryAttribute_Type_GENERIC();
                Module['INVALID_GEOMETRY_TYPE'] = _emscripten_enum_draco_EncodedGeometryType_INVALID_GEOMETRY_TYPE();
                Module['POINT_CLOUD'] = _emscripten_enum_draco_EncodedGeometryType_POINT_CLOUD();
                Module['TRIANGULAR_MESH'] = _emscripten_enum_draco_EncodedGeometryType_TRIANGULAR_MESH();
                Module['DT_INVALID'] = _emscripten_enum_draco_DataType_DT_INVALID();
                Module['DT_INT8'] = _emscripten_enum_draco_DataType_DT_INT8();
                Module['DT_UINT8'] = _emscripten_enum_draco_DataType_DT_UINT8();
                Module['DT_INT16'] = _emscripten_enum_draco_DataType_DT_INT16();
                Module['DT_UINT16'] = _emscripten_enum_draco_DataType_DT_UINT16();
                Module['DT_INT32'] = _emscripten_enum_draco_DataType_DT_INT32();
                Module['DT_UINT32'] = _emscripten_enum_draco_DataType_DT_UINT32();
                Module['DT_INT64'] = _emscripten_enum_draco_DataType_DT_INT64();
                Module['DT_UINT64'] = _emscripten_enum_draco_DataType_DT_UINT64();
                Module['DT_FLOAT32'] = _emscripten_enum_draco_DataType_DT_FLOAT32();
                Module['DT_FLOAT64'] = _emscripten_enum_draco_DataType_DT_FLOAT64();
                Module['DT_BOOL'] = _emscripten_enum_draco_DataType_DT_BOOL();
                Module['DT_TYPES_COUNT'] = _emscripten_enum_draco_DataType_DT_TYPES_COUNT();
                Module['OK'] = _emscripten_enum_draco_StatusCode_OK();
                Module['DRACO_ERROR'] = _emscripten_enum_draco_StatusCode_DRACO_ERROR();
                Module['IO_ERROR'] = _emscripten_enum_draco_StatusCode_IO_ERROR();
                Module['INVALID_PARAMETER'] = _emscripten_enum_draco_StatusCode_INVALID_PARAMETER();
                Module['UNSUPPORTED_VERSION'] = _emscripten_enum_draco_StatusCode_UNSUPPORTED_VERSION();
                Module['UNKNOWN_VERSION'] = _emscripten_enum_draco_StatusCode_UNKNOWN_VERSION();
            }
            if (runtimeInitialized) setupEnums();
            else addOnInit(setupEnums);
        })();
        if (typeof Module['onModuleParsed'] === 'function') {
            Module['onModuleParsed']();
        }
        Module['Decoder'].prototype.GetEncodedGeometryType = function (array) {
            if (array.__class__ && array.__class__ === Module.DecoderBuffer) {
                return Module.Decoder.prototype.GetEncodedGeometryType_Deprecated(array);
            }
            if (array.byteLength < 8) return Module.INVALID_GEOMETRY_TYPE;
            switch (array[7]) {
                case 0:
                    return Module.POINT_CLOUD;
                case 1:
                    return Module.TRIANGULAR_MESH;
                default:
                    return Module.INVALID_GEOMETRY_TYPE;
            }
        };

        return DracoDecoderModule.ready;
    };
})();
if (typeof exports === 'object' && typeof module === 'object') module.exports = DracoDecoderModule;
else if (typeof define === 'function' && define['amd'])
    define([], function () {
        return DracoDecoderModule;
    });
else if (typeof exports === 'object') exports['DracoDecoderModule'] = DracoDecoderModule;
