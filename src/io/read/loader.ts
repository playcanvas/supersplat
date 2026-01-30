/**
 * Unified loader for all splat file formats using splat-transform.
 */

import {
    DataTable,
    Column,
    ColumnType,
    ReadFileSystem,
    ZipReadFileSystem,
    readFile,
    getInputFormat,
    Options
} from '@playcanvas/splat-transform';
import { GSplatData } from 'playcanvas';

/**
 * Default options for readFile.
 */
const defaultOptions: Options = {
    iterations: 10,
    lodSelect: [0],
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
 * Load a file using splat-transform and convert to GSplatData.
 * @param filename - The filename to load
 * @param fileSystem - The file system to read from
 */
const loadGSplatData = async (filename: string, fileSystem: ReadFileSystem): Promise<GSplatData> => {
    const inputFormat = getInputFormat(filename);

    // Handle bundled SOG (.sog extension) - wrap with ZipReadFileSystem
    if (inputFormat === 'sog' && filename.toLowerCase().endsWith('.sog')) {
        const source = await fileSystem.createSource(filename);
        const zipFs = new ZipReadFileSystem(source);
        try {
            const tables = await readFile({
                filename: 'meta.json',
                inputFormat: 'sog',
                options: defaultOptions,
                params: [],
                fileSystem: zipFs
            });
            return dataTableToGSplatData(tables[0]);
        } finally {
            zipFs.close();
        }
    }

    // Read the file using splat-transform
    const tables = await readFile({
        filename,
        inputFormat,
        options: defaultOptions,
        params: [],
        fileSystem
    });

    // Convert to GSplatData (use first table, as most formats return single table)
    // LCC may return multiple tables for different LOD levels - we use the first (highest detail)
    return dataTableToGSplatData(tables[0]);
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
    loadGSplatData,
    validateGSplatData
};
