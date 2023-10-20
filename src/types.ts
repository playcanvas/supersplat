
interface GlobalState {
    canvas: HTMLCanvasElement;
    gl: RenderingContext;
    config: any;
    modelFilename: string;
    modelUrl: string;
    envImage: Promise<string>;
    dracoJs: Promise<string>;
    dracoWasm: Promise<string>;
    loadComplete: () => void;
    modelLoadComplete: (timing: number) => void;
}

export { GlobalState };
