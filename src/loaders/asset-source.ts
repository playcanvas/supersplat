interface AssetSource {
    filename?: string;
    url?: string;
    contents?: File;
    animationFrame?: boolean;                                   // animations disable morton re-ordering at load time for faster loading
    mapUrl?: (name: string) => string;                          // function to map texture names to URLs
    mapFile?: (name: string) => AssetSource | null;             // function to map names to files
}

const fetchRequest = async (assetSource: AssetSource) : Promise<Response | File | null> => {
    return await (assetSource.contents ?? fetch(assetSource.url || assetSource.filename)) as Response;
};

const fetchArrayBuffer = async (assetSource: AssetSource) : Promise<ArrayBuffer> | null => {
    const response = await fetchRequest(assetSource);

    if (response instanceof Response) {
        if (!response.ok) {
            return null;
        }
        return await response.arrayBuffer();
    }

    if (response instanceof File) {
        return await response.arrayBuffer();
    }

    return response;
};

const fetchText = async (assetSource: AssetSource) : Promise<string> | null => {
    const response = await fetchRequest(assetSource);

    if (response instanceof Response) {
        if (!response.ok) {
            return null;
        }
        return await response.text();
    }

    if (response instanceof File) {
        return await response.text();
    }

    return response;
};

export type { AssetSource };

export { fetchArrayBuffer, fetchText };
