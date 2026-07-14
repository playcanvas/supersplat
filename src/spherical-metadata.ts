// Injects Spherical Video V1 metadata into an MP4/MOV buffer so players
// (YouTube, VLC, Quest) auto-detect the equirectangular projection.
// https://github.com/google/spatial-media/blob/master/docs/spherical-video-rfc.md
//
// The metadata is a uuid box appended as the last child of the video trak.
// Throws on unexpected input; callers should fall back to the untagged buffer.

const SPHERICAL_UUID = new Uint8Array([
    0xff, 0xcc, 0x82, 0x63, 0xf8, 0x55, 0x4a, 0x93,
    0x88, 0x14, 0x58, 0x7a, 0x02, 0x52, 0x1f, 0xdd
]);

const SPHERICAL_XML =
    '<?xml version="1.0"?>' +
    '<rdf:SphericalVideo xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:GSpherical="http://ns.google.com/videos/1.0/spherical/">' +
    '<GSpherical:Spherical>true</GSpherical:Spherical>' +
    '<GSpherical:Stitched>true</GSpherical:Stitched>' +
    '<GSpherical:StitchingSoftware>SuperSplat</GSpherical:StitchingSoftware>' +
    '<GSpherical:ProjectionType>equirectangular</GSpherical:ProjectionType>' +
    '</rdf:SphericalVideo>';

type Box = {
    type: string;
    start: number;
    size: number;
    headerSize: number;
};

// read the box header at offset, returning null when truncated or malformed
const readBox = (view: DataView, offset: number, end: number): Box | null => {
    if (offset + 8 > end) {
        return null;
    }

    let size = view.getUint32(offset);
    const type = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7)
    );
    let headerSize = 8;

    if (size === 1) {
        // 64-bit largesize (mdat can use this for long clips)
        if (offset + 16 > end) {
            return null;
        }
        size = view.getUint32(offset + 8) * 4294967296 + view.getUint32(offset + 12);
        headerSize = 16;
    } else if (size === 0) {
        // box extends to the end of the file
        size = end - offset;
    }

    if (size < headerSize || offset + size > end) {
        return null;
    }

    return { type, start: offset, size, headerSize };
};

// list the direct children of a container box (or the whole file)
const childBoxes = (view: DataView, start: number, end: number): Box[] => {
    const children: Box[] = [];
    let offset = start;
    while (offset < end) {
        const box = readBox(view, offset, end);
        if (!box) {
            break;
        }
        children.push(box);
        offset = box.start + box.size;
    }
    return children;
};

const findChild = (view: DataView, parent: Box, type: string): Box | null => {
    const children = childBoxes(view, parent.start + parent.headerSize, parent.start + parent.size);
    return children.find(child => child.type === type) ?? null;
};

// a trak is the video track when its mdia > hdlr handler_type is 'vide'
const isVideoTrak = (view: DataView, trak: Box): boolean => {
    const mdia = findChild(view, trak, 'mdia');
    const hdlr = mdia && findChild(view, mdia, 'hdlr');
    if (!hdlr) {
        return false;
    }

    // hdlr payload: version/flags (4) + pre_defined (4) + handler_type (4)
    const offset = hdlr.start + hdlr.headerSize + 8;
    return offset + 4 <= hdlr.start + hdlr.size &&
        String.fromCharCode(
            view.getUint8(offset),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2),
            view.getUint8(offset + 3)
        ) === 'vide';
};

// add delta to every chunk offset in the stco/co64 boxes of a moov subtree.
// only needed when moov precedes mdat (fast-start layout); with moov written
// last the chunk offsets are unaffected by the insertion.
const patchChunkOffsets = (view: DataView, box: Box, delta: number) => {
    const containers = ['moov', 'trak', 'mdia', 'minf', 'stbl'];

    if (containers.includes(box.type)) {
        const children = childBoxes(view, box.start + box.headerSize, box.start + box.size);
        children.forEach(child => patchChunkOffsets(view, child, delta));
    } else if (box.type === 'stco' || box.type === 'co64') {
        // full box: version/flags (4) + entry_count (4) + entries
        const count = view.getUint32(box.start + box.headerSize + 4);
        let offset = box.start + box.headerSize + 8;
        for (let i = 0; i < count; ++i) {
            if (box.type === 'stco') {
                view.setUint32(offset, view.getUint32(offset) + delta);
                offset += 4;
            } else {
                const value = view.getUint32(offset) * 4294967296 + view.getUint32(offset + 4) + delta;
                view.setUint32(offset, Math.floor(value / 4294967296));
                view.setUint32(offset + 4, value % 4294967296);
                offset += 8;
            }
        }
    }
};

const injectSphericalMetadata = (buffer: ArrayBuffer): ArrayBuffer => {
    const view = new DataView(buffer);
    const topLevel = childBoxes(view, 0, buffer.byteLength);

    if (topLevel.length === 0 || topLevel[topLevel.length - 1].start + topLevel[topLevel.length - 1].size !== buffer.byteLength) {
        throw new Error('malformed container');
    }

    const moov = topLevel.find(box => box.type === 'moov');
    if (!moov) {
        throw new Error('moov box not found');
    }

    const moovChildren = childBoxes(view, moov.start + moov.headerSize, moov.start + moov.size);
    const trak = moovChildren.find(box => box.type === 'trak' && isVideoTrak(view, box));
    if (!trak) {
        throw new Error('video trak not found');
    }

    if (moov.headerSize !== 8 || trak.headerSize !== 8) {
        throw new Error('unexpected 64-bit box size');
    }

    // build the uuid box: size (4) + 'uuid' (4) + extended type (16) + xml
    const xml = new TextEncoder().encode(SPHERICAL_XML);
    const uuidBox = new Uint8Array(24 + xml.length);
    const uuidView = new DataView(uuidBox.buffer);
    uuidView.setUint32(0, uuidBox.length);
    uuidBox.set([0x75, 0x75, 0x69, 0x64], 4);   // 'uuid'
    uuidBox.set(SPHERICAL_UUID, 8);
    uuidBox.set(xml, 24);

    // splice the uuid box in as the last child of the video trak
    const src = new Uint8Array(buffer);
    const trakEnd = trak.start + trak.size;
    const out = new Uint8Array(buffer.byteLength + uuidBox.length);
    out.set(src.subarray(0, trakEnd), 0);
    out.set(uuidBox, trakEnd);
    out.set(src.subarray(trakEnd), trakEnd + uuidBox.length);

    // grow the ancestor box sizes
    const outView = new DataView(out.buffer);
    outView.setUint32(moov.start, moov.size + uuidBox.length);
    outView.setUint32(trak.start, trak.size + uuidBox.length);

    // fast-start layout defense: growing a moov that precedes mdat shifts the
    // media data, so chunk offsets must follow
    const mdat = topLevel.find(box => box.type === 'mdat');
    if (mdat && moov.start < mdat.start) {
        const outMoov = readBox(outView, moov.start, out.byteLength);
        patchChunkOffsets(outView, outMoov, uuidBox.length);
    }

    return out.buffer;
};

export { injectSphericalMetadata };
