import { ReadSource } from '../serialize/read-source';

interface AssetSource {
    filename?: string;
    url?: string;
    contents?: File;
    animationFrame?: boolean;                                   // animations disable morton re-ordering at load time for faster loading
    mapUrl?: (name: string) => string;                          // function to map texture names to URLs
    mapFile?: (name: string) => AssetSource | null;             // function to map names to files
}

// create a read source, optionally as a range request (on either URL or File)
const createReadSource = async (assetSource: AssetSource, start?: number, end?: number) => {
    let source;
    if (start === undefined || end === undefined) {
        source = assetSource.contents ?? assetSource.url ?? assetSource.filename;
    } else if (assetSource.contents) {
        source = assetSource.contents.slice(start, end);
    } else {
        source = await fetch(assetSource.url ?? assetSource.filename, { headers: { 'Range': `bytes=${start}-${end - 1}` } });
    }
    return new ReadSource(source);
};

export type { AssetSource };

export { createReadSource };
