/// <reference types="@webgpu/types" />
/// <reference types="wicg-file-system-access" />

interface FileSystemFileHandle {
    remove(): Promise<void>;
}

// WebMCP (https://webmachinelearning.github.io/webmcp/): the subset of the
// ModelContext API that src/webmcp.ts uses. Hand-written rather than pulled
// from a types package so the app carries no dependency on a still-moving
// spec; extend as the spec settles.
interface ModelContextToolAnnotations {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
    consequentialHint?: boolean;
}

interface ModelContextTool {
    name: string;
    title?: string;
    description: string;
    inputSchema?: object;
    annotations?: ModelContextToolAnnotations;
    execute(input: any, options: { signal: AbortSignal }): any;
}

interface ModelContextRegisteredTool {
    name: string;
    title?: string;
    description: string;
    inputSchema?: object;
    origin: string;
    annotations?: ModelContextToolAnnotations;
}

interface ModelContext extends EventTarget {
    registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal; exposedTo?: string[] }): Promise<void>;
    getTools(options?: { fromOrigins?: string[] }): Promise<ModelContextRegisteredTool[]>;
    executeTool(tool: ModelContextRegisteredTool, input?: object | string, options?: { signal?: AbortSignal }): Promise<string>;
}

interface Document {
    readonly modelContext?: ModelContext;
}

interface Navigator {
    /** @deprecated legacy location of the API (Chrome 146-149); document.modelContext is the spec location */
    readonly modelContext?: ModelContext;
}

declare module '*.png' {
    const value: any;
    export default value;
}

declare module '*.svg' {
    const value: any;
    export default value;
}

declare module '*.scss' {
    const value: any;
    export default value;
}
