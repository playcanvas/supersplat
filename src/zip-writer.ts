// Small uncompressed ZIP writer for inspectable raw depth exports.
const encodeZip = (files: { name: string; data: Uint8Array }[]) => {
    const encoder = new TextEncoder();
    const records = files.map((file) => ({ ...file, nameBytes: encoder.encode(file.name), crc: 0, offset: 0 }));
    const table = Uint32Array.from({ length: 256 }, (_, i) => {
        let c = i;
        for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    let localSize = 0,
        centralSize = 0;
    for (const record of records) {
        let crc = 0xffffffff;
        for (const value of record.data) crc = table[(crc ^ value) & 255] ^ (crc >>> 8);
        record.crc = (crc ^ 0xffffffff) >>> 0;
        record.offset = localSize;
        localSize += 30 + record.nameBytes.length + record.data.length;
        centralSize += 46 + record.nameBytes.length;
    }
    if (localSize + centralSize + 22 > 0xffffffff) throw new Error('Depth package exceeds ZIP32 size limit.');
    const bytes = new Uint8Array(localSize + centralSize + 22);
    const view = new DataView(bytes.buffer);
    let offset = 0;
    for (const record of records) {
        view.setUint32(offset, 0x04034b50, true);
        view.setUint16(offset + 4, 20, true);
        view.setUint16(offset + 6, 0x800, true);
        view.setUint16(offset + 12, 33, true);
        view.setUint32(offset + 14, record.crc, true);
        view.setUint32(offset + 18, record.data.length, true);
        view.setUint32(offset + 22, record.data.length, true);
        view.setUint16(offset + 26, record.nameBytes.length, true);
        bytes.set(record.nameBytes, offset + 30);
        bytes.set(record.data, offset + 30 + record.nameBytes.length);
        offset += 30 + record.nameBytes.length + record.data.length;
    }
    for (const record of records) {
        view.setUint32(offset, 0x02014b50, true);
        view.setUint16(offset + 4, 20, true);
        view.setUint16(offset + 6, 20, true);
        view.setUint16(offset + 8, 0x800, true);
        view.setUint16(offset + 14, 33, true);
        view.setUint32(offset + 16, record.crc, true);
        view.setUint32(offset + 20, record.data.length, true);
        view.setUint32(offset + 24, record.data.length, true);
        view.setUint16(offset + 28, record.nameBytes.length, true);
        view.setUint32(offset + 42, record.offset, true);
        bytes.set(record.nameBytes, offset + 46);
        offset += 46 + record.nameBytes.length;
    }
    view.setUint32(offset, 0x06054b50, true);
    view.setUint16(offset + 8, records.length, true);
    view.setUint16(offset + 10, records.length, true);
    view.setUint32(offset + 12, centralSize, true);
    view.setUint32(offset + 16, localSize, true);
    return bytes;
};

export { encodeZip };
