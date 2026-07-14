// minimal png encoder producing bit-exact rgba output. scanlines use filter
// type 0 so pixel bytes are stored verbatim - slightly larger files than a
// filtering encoder, but exact (no canvas premultiplied-alpha round trip)
// and dependency-free.

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
}

const crc32 = (...buffers: Uint8Array[]) => {
    let c = 0xffffffff;
    for (const buffer of buffers) {
        for (let i = 0; i < buffer.length; i++) {
            c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
        }
    }
    return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array) => {
    const typeBytes = new TextEncoder().encode(type);
    const result = new Uint8Array(12 + data.length);
    const view = new DataView(result.buffer);
    view.setUint32(0, data.length);
    result.set(typeBytes, 4);
    result.set(data, 8);
    view.setUint32(8 + data.length, crc32(typeBytes, data));
    return result;
};

// encode top-down 8-bit rgba pixels as a png
const encodePng = async (rgba: Uint8Array, width: number, height: number): Promise<Uint8Array<ArrayBuffer>> => {
    // ihdr: 8-bit rgba, no interlace
    const ihdr = new Uint8Array(13);
    const ihdrView = new DataView(ihdr.buffer);
    ihdrView.setUint32(0, width);
    ihdrView.setUint32(4, height);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 6;    // color type: rgba (compression, filter and interlace bytes stay 0)

    // raw scanlines: a filter-type byte (0 = none) followed by the row's pixels
    const rowBytes = width * 4;
    const raw = new Uint8Array((rowBytes + 1) * height);
    for (let y = 0; y < height; y++) {
        raw.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
    }

    // 'deflate' is the zlib wrapper (rfc 1950) that idat requires
    const compressed = new Uint8Array(await new Response(
        new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))
    ).arrayBuffer());

    const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunks = [signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array(0))];

    const result = new Uint8Array(chunks.reduce((total, c) => total + c.length, 0));
    let offset = 0;
    for (const c of chunks) {
        result.set(c, offset);
        offset += c.length;
    }
    return result;
};

export { encodePng };
