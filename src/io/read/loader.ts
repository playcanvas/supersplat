/**
 * Unified loader for all splat file formats using splat-transform.
 */

import {
    getInputFormat,
    readFile,
    sortMortonOrder,
    createChunkDataPool,
    materializeToDataTable,
    selectLod,
    Column,
    ColumnType,
    DataTable,
    Options,
    ChunkSource,
    ReadFileSystem,
    Transform,
    ZipReadFileSystem
} from '@playcanvas/splat-transform';
import { GSplatData } from 'playcanvas';

type LoadResult = {
    gsplatData: GSplatData;
    transform: Transform;
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
 * Map splat-transform column types to GSplatData property types.
 */
const columnTypeToGSplatType = (colType: ColumnType | null): string => {
    switch (colType) {
        case 'int8': return 'char';
        case 'uint8': return 'uchar';
        case 'int16': return 'short';
        case 'uint16': return 'ushort';
        case 'int32': return 'int';
        case 'uint32': return 'uint';
        case 'float32': return 'float';
        case 'float64': return 'double';
        default: return 'float';
    }
};

/**
 * Convert a splat-transform DataTable to PlayCanvas GSplatData.
 */
const dataTableToGSplatData = (dataTable: DataTable): GSplatData => {
    const properties = dataTable.columns.map((col: Column) => ({
        type: columnTypeToGSplatType(col.dataType),
        name: col.name,
        storage: col.data,
        byteSize: col.data.BYTES_PER_ELEMENT
    }));

    const gsplatData = new GSplatData([{
        name: 'vertex',
        count: dataTable.numRows,
        properties
    }]);

    // Support loading 2D splats by adding scale_2 property with almost 0 scale
    if (gsplatData.getProp('scale_0') && gsplatData.getProp('scale_1') && !gsplatData.getProp('scale_2')) {
        const scale2 = new Float32Array(gsplatData.numSplats).fill(Math.log(1e-6));
        gsplatData.addProp('scale_2', scale2);

        // Place the new scale_2 property just after scale_1
        const props = gsplatData.getElement('vertex').properties;
        props.splice(props.findIndex((prop: any) => prop.name === 'scale_1') + 1, 0, props.splice(props.length - 1, 1)[0]);
    }

    return gsplatData;
};

/**
 * Materialize the first source returned by readFile into a DataTable.
 * readFile returns lazy ChunkSource[]; multi-LOD sources (e.g. LCC) are
 * reduced to a single LOD before materializing - chosen by the pickLod
 * callback when supplied, otherwise the most detailed level with a
 * reasonable splat count. Returns null if pickLod cancels the load.
 */
const materializeFirst = async (sources: ChunkSource[], pickLod?: PickLod): Promise<DataTable | null> => {
    const source = sources[0];
    const pool = createChunkDataPool({ chunkSize: source.meta.chunkSize });
    try {
        let single = source;
        if (source.meta.numLods > 1) {
            const { lodCounts } = source.meta;
            const lod = pickLod ? await pickLod(lodCounts) : defaultLodIndex(lodCounts);
            if (lod === null) {
                return null;
            }
            single = selectLod(source, lod);
        }
        return await materializeToDataTable(single, pool);
    } finally {
        for (const s of sources) {
            await s.close();
        }
        pool.destroy();
    }
};

/**
 * Load a file using splat-transform and convert to GSplatData.
 * Returns null if the user cancels LOD selection.
 * @param filename - The filename to load
 * @param fileSystem - The file system to read from
 * @param skipReorder - Skip morton reordering (for files already in morton order or animation playback)
 * @param pickLod - Invoked when the file contains multiple LODs to choose which to load
 */
const loadGSplatData = async (filename: string, fileSystem: ReadFileSystem, skipReorder?: boolean, pickLod?: PickLod): Promise<LoadResult | null> => {
    const inputFormat = getInputFormat(filename);
    const lowerFilename = filename.toLowerCase();

    // Handle bundled SOG (.sog extension) - wrap with ZipReadFileSystem
    if (inputFormat === 'sog' && lowerFilename.endsWith('.sog')) {
        const source = await fileSystem.createSource(filename);
        const zipFs = new ZipReadFileSystem(source);
        try {
            const sources = await readFile({
                filename: 'meta.json',
                inputFormat: 'sog',
                options: defaultOptions,
                params: [],
                fileSystem: zipFs
            });
            const dataTable = await materializeFirst(sources, pickLod);
            if (!dataTable) {
                return null;
            }
            return { gsplatData: dataTableToGSplatData(dataTable), transform: dataTable.transform };
        } finally {
            zipFs.close();
        }
    }

    // Read the file using splat-transform
    const sources = await readFile({
        filename,
        inputFormat,
        options: defaultOptions,
        params: [],
        fileSystem
    });

    const dataTable = await materializeFirst(sources, pickLod);
    if (!dataTable) {
        return null;
    }

    // Reorder data into morton order for better render performance.
    // Skip reordering for:
    // - SOG format (already in morton order)
    // - Compressed PLY (already in morton order from write-compressed-ply)
    // - When skipReorder is true (ssproj files are already ordered, animation frames need speed)
    const isCompressedPly = lowerFilename.endsWith('.compressed.ply');
    if (inputFormat !== 'sog' && !isCompressedPly && !skipReorder) {
        const indices = new Uint32Array(dataTable.numRows);
        for (let i = 0; i < indices.length; i++) {
            indices[i] = i;
        }
        sortMortonOrder(dataTable, indices);
        dataTable.permuteRowsInPlace(indices);
    }

    // Convert to GSplatData
    return { gsplatData: dataTableToGSplatData(dataTable), transform: dataTable.transform };
};

/**
 * Validate that GSplatData contains required properties.
 */
const validateGSplatData = (gsplatData: GSplatData): void => {
    const required = [
        'x', 'y', 'z',
        'scale_0', 'scale_1', 'scale_2',
        'rot_0', 'rot_1', 'rot_2', 'rot_3',
        'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity'
    ];

    const missing = required.filter(x => !gsplatData.getProp(x));
    if (missing.length > 0) {
        throw new Error(`This file does not contain gaussian splatting data. The following properties are missing: ${missing.join(', ')}`);
    }
};

export {
    defaultLodIndex,
    loadGSplatData,
    validateGSplatData
};
