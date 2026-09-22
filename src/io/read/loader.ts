/**
 * Unified loader for all splat file formats using splat-transform.
 */

import {
    ChunkData,
    ChunkLayer,
    ChunkSource,
    ChunkSourceMetadata,
    Options,
    ReadFileSystem,
    ReadRequest,
    Transform,
    ZipReadFileSystem,
    getInputFormat,
    readFile,
    selectLod
} from '@playcanvas/splat-transform';

type LoadResult = {
    source: ChunkSource;
    transform: Transform;
    // whether the consumer should Morton-order the gaussians. The loader no
    // longer does this itself: computing the order needs every position, and
    // reading them here would scan the file once more than the upload already
    // does. EditorSplatResource orders during its single sweep instead.
    reorder: boolean;
};

// invoked when a file contains multiple LODs. returns the LOD index to load,
// or null to cancel the load.
type PickLod = (lodCounts: readonly number[]) => Promise<number | null>;

// maximum splat count considered reasonable to load, used to select a default
// LOD level for multi-LOD formats (e.g. LCC)
const LOD_MAX_SPLATS = 20_000_000;

// pick the most detailed LOD under the splat limit, or the least detailed
// when all levels exceed it
const defaultLodIndex = (lodCounts: readonly number[]) => {
    const candidates = lodCounts.map((count, index) => ({ count, index }));
    const under = candidates.filter(c => c.count < LOD_MAX_SPLATS);
    if (under.length > 0) {
        return under.reduce((a, b) => (b.count > a.count ? b : a)).index;
    }
    return candidates.reduce((a, b) => (b.count < a.count ? b : a)).index;
};

/**
 * Default options for readFile.
 */
const defaultOptions: Options = {
    iterations: 10,
    lodSelect: [],
    unbundled: false,
    lodChunkCount: 512,
    lodChunkExtent: 16
};

/**
 * Presents `parent` reordered by `order` (`order[row]` is the parent row that
 * appears at `row`). `parent` and `order` are public so consumers doing bulk
 * work (e.g. export) can compose the permutation with their own row selection
 * and read the parent directly, instead of gathering through two levels.
 */
class PermutedChunkSource implements ChunkSource {
    readonly meta: ChunkSourceMetadata;

    constructor(readonly parent: ChunkSource, readonly order: Uint32Array) {
        this.meta = {
            ...parent.meta,
            numGaussians: order.length,
            numLods: 1,
            lodCounts: [order.length],
            numChunks: [Math.ceil(order.length / parent.meta.chunkSize)]
        };
    }

    read(request: ReadRequest): Promise<void> {
        const target = {
            position: request.position,
            geometric: request.geometric,
            color: request.color,
            other: request.other
        };
        if ('indices' in request) {
            const mapped = new Uint32Array(request.count);
            for (let i = 0; i < request.count; ++i) {
                mapped[i] = this.order[request.indices[request.indexOffset + i]];
            }
            return this.parent.read({
                ...target,
                indices: mapped,
                indexOffset: 0,
                count: mapped.length
            });
        }

        const anyData = (request.position ?? request.geometric ?? request.color ?? request.other) as ChunkData;
        const indexOffset = request.chunkIndex * this.meta.chunkSize;
        return this.parent.read({
            ...target,
            indices: this.order,
            indexOffset,
            count: anyData.count
        });
    }

    close(): Promise<void> {
        return this.parent.close();
    }
}

class OwnedChunkSource implements ChunkSource {
    readonly meta: ChunkSourceMetadata;
    private closed = false;

    constructor(private readonly parent: ChunkSource, private readonly onClose: () => void | Promise<void>) {
        this.meta = parent.meta;
    }

    read(request: ReadRequest): Promise<void> {
        return this.parent.read(request);
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        try {
            await this.parent.close();
        } finally {
            await this.onClose();
        }
    }
}

const selectFirst = async (sources: ChunkSource[], pickLod?: PickLod) => {
    const first = sources[0];
    for (let i = 1; i < sources.length; ++i) await sources[i].close();
    if (first.meta.numLods <= 1) return first;

    const lod = pickLod ? await pickLod(first.meta.lodCounts) : defaultLodIndex(first.meta.lodCounts);
    if (lod === null) {
        await first.close();
        return null;
    }
    return new OwnedChunkSource(selectLod(first, lod), () => first.close());
};

const validateSplatSource = (source: ChunkSource): void => {
    const required: ChunkLayer[] = ['position', 'geometric', 'color'];
    const missing = required.filter(layer => !source.meta.availableLayers.has(layer));
    if (missing.length > 0) {
        throw new Error(`This file does not contain gaussian splatting data. The following layers are missing: ${missing.join(', ')}`);
    }
};

/**
 * Open a lazy ChunkSource and keep it alive for the lifetime of the loaded Splat.
 * Returns null if the user cancels LOD selection.
 */
const loadSplatSource = async (
    filename: string,
    fileSystem: ReadFileSystem,
    skipReorder?: boolean,
    pickLod?: PickLod
): Promise<LoadResult | null> => {
    const inputFormat = getInputFormat(filename);
    const lowerFilename = filename.toLowerCase();
    let source: ChunkSource;

    if (inputFormat === 'sog' && lowerFilename.endsWith('.sog')) {
        const archive = await fileSystem.createSource(filename);
        const zipFs = new ZipReadFileSystem(archive);
        try {
            const sources = await readFile({
                filename: 'meta.json',
                inputFormat: 'sog',
                options: defaultOptions,
                params: [],
                fileSystem: zipFs
            });
            const selected = await selectFirst(sources, pickLod);
            if (!selected) {
                zipFs.close();
                return null;
            }
            source = new OwnedChunkSource(selected, () => zipFs.close());
        } catch (err) {
            zipFs.close();
            throw err;
        }
    } else {
        const sources = await readFile({
            filename,
            inputFormat,
            options: defaultOptions,
            params: [],
            fileSystem
        });
        source = await selectFirst(sources, pickLod);
        if (!source) return null;
    }

    try {
        validateSplatSource(source);

        // SOG and compressed PLY are written in Morton order already; ssproj
        // resources and animation frames ask to skip it (already ordered, or
        // load speed matters more)
        const isCompressedPly = lowerFilename.endsWith('.compressed.ply');
        const reorder = inputFormat !== 'sog' && !isCompressedPly && !skipReorder;

        return { source, transform: source.meta.transform, reorder };
    } catch (err) {
        await source.close();
        throw err;
    }
};

export {
    defaultLodIndex,
    loadSplatSource,
    PermutedChunkSource,
    validateSplatSource
};
