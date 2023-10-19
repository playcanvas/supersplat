interface InputEventHandlers {
    onCameraAutoRotate: () => void;
    onModelClicked: () => void;
    onModelDragged: () => void;
    onModelZoomed: () => void;
}

interface GlobalState {
    aresSdkConfig: any;
    canvas: HTMLCanvasElement;
    gl: RenderingContext;
    gltfContents: Promise<ArrayBuffer>;
    envImage: Promise<string>;
    dracoJs: Promise<string>;
    dracoWasm: Promise<string>;
    loadComplete: () => void;
    modelLoadComplete: (timing: number) => void;
    startHandPrompt: () => void;
    inputEventHandlers: InputEventHandlers;
}

export {InputEventHandlers, GlobalState};
