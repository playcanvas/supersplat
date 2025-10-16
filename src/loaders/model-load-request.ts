interface ModelLoadRequest {
    filename?: string;
    url?: string;
    contents?: File;
    animationFrame?: boolean;                   // animations disable morton re-ordering at load time for faster loading
    mapUrl?: (name: string) => string;          // function to map texture names to URLs
    mapFile?: (name: string) => {filename: string, contents: File}|undefined; // function to map names to files
}

export type { ModelLoadRequest };
