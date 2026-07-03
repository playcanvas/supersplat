type ParsedGlbMesh = {
    positions: Float32Array;
    indices: Uint32Array;
};

const GLB_MAGIC = 0x46546C67;   // 'glTF'
const CHUNK_JSON = 0x4E4F534A;  // 'JSON'
const CHUNK_BIN = 0x004E4942;   // 'BIN\0'

const COMPONENT_FLOAT32 = 5126;
const COMPONENT_UINT16 = 5123;
const COMPONENT_UINT32 = 5125;

/**
 * Parse a minimal GLB (such as the collision mesh GLB produced by
 * splat-transform) and extract the first primitive's positions and indices.
 */
const parseGlb = (glb: Uint8Array): ParsedGlbMesh => {
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);

    if (glb.byteLength < 12 || view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
        throw new Error('Invalid GLB header');
    }

    // read chunks
    let json: any = null;
    let bin: Uint8Array | null = null;
    let offset = 12;
    while (offset + 8 <= glb.byteLength) {
        const chunkLength = view.getUint32(offset, true);
        const chunkType = view.getUint32(offset + 4, true);
        const chunkStart = offset + 8;
        if (chunkStart + chunkLength > glb.byteLength) {
            throw new Error('Truncated GLB chunk');
        }
        if (chunkType === CHUNK_JSON) {
            json = JSON.parse(new TextDecoder().decode(glb.subarray(chunkStart, chunkStart + chunkLength)));
        } else if (chunkType === CHUNK_BIN) {
            bin = glb.subarray(chunkStart, chunkStart + chunkLength);
        }
        offset = chunkStart + chunkLength;
    }

    if (!json || !bin) {
        throw new Error('GLB is missing JSON or BIN chunk');
    }
    const binData = bin;

    const primitive = json.meshes?.[0]?.primitives?.[0];
    if (!primitive || primitive.attributes?.POSITION === undefined || primitive.indices === undefined) {
        throw new Error('GLB has no indexed mesh primitive');
    }

    // resolve an accessor to a typed view over the BIN chunk
    const accessorData = (accessorIndex: number) => {
        const accessor = json.accessors?.[accessorIndex];
        const bufferView = json.bufferViews?.[accessor?.bufferView];
        if (!accessor || !bufferView) {
            throw new Error('GLB accessor is invalid');
        }
        const componentCount = accessor.type === 'VEC3' ? 3 : 1;
        const start = binData.byteOffset + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
        const count = accessor.count * componentCount;
        switch (accessor.componentType) {
            case COMPONENT_FLOAT32: return new Float32Array(binData.buffer, start, count);
            case COMPONENT_UINT32: return new Uint32Array(binData.buffer, start, count);
            case COMPONENT_UINT16: return new Uint16Array(binData.buffer, start, count);
            default: throw new Error(`GLB accessor has unsupported component type ${accessor.componentType}`);
        }
    };

    const positionData = accessorData(primitive.attributes.POSITION);
    if (!(positionData instanceof Float32Array)) {
        throw new Error('GLB POSITION accessor is not float32');
    }

    const indexData = accessorData(primitive.indices);
    if (indexData instanceof Float32Array) {
        throw new Error('GLB index accessor is not an integer type');
    }

    // copy out of the GLB buffer so results own their storage
    return {
        positions: positionData.slice(),
        indices: indexData instanceof Uint32Array ? indexData.slice() : new Uint32Array(indexData)
    };
};

export { parseGlb, ParsedGlbMesh };
