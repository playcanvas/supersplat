// pool of Uint8Array readback buffers, keyed by byteLength. GPU passes acquire
// a buffer for the duration of a single run+consume cycle and release it back
// when done. avoids the shared-singleton foot-gun where a stale reference from
// a previous run could be overwritten under the caller, while keeping steady
// state memory parity with the old model (one buffer in flight, one parked).
class BufferPool {
    private free = new Map<number, Uint8Array[]>();

    acquire(byteLen: number): Uint8Array {
        const list = this.free.get(byteLen);
        if (list && list.length) {
            return list.pop()!;
        }
        return new Uint8Array(byteLen);
    }

    release(buf: Uint8Array): void {
        const list = this.free.get(buf.byteLength);
        if (list) {
            list.push(buf);
        } else {
            this.free.set(buf.byteLength, [buf]);
        }
    }
}

export { BufferPool };
