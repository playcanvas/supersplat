import { createGraphicsDevice } from 'playcanvas';
import { Scene } from './scene';
import { getSceneConfig } from './scene-config';
import { CreateDropHandler } from './drop-handler';
import { initMaterials } from './material';
import { EditHistory } from './edit-history';
import { EditorUI } from './ui/editor';
import { registerEditorEvents } from './editor';
import { ToolManager } from './tools/tool-manager';
import { MoveTool } from './tools/move-tool';
import { RotateTool } from './tools/rotate-tool';
import { ScaleTool } from './tools/scale-tool';
import { RectSelection } from './tools/rect-selection';
import { BrushSelection } from './tools/brush-selection';
import { Events } from './events';

declare global {
    interface Window {
        scene: Scene;
        showError: (err: string) => void;
    }
}

const getURLArgs = () => {
    // extract settings from command line in non-prod builds only
    const config = {};

    const apply = (key: string, value: string) => {
        let obj: any = config;
        key.split('.').forEach((k, i, a) => {
            if (i === a.length - 1) {
                obj[k] = value;
            } else {
                if (!obj.hasOwnProperty(k)) {
                    obj[k] = {};
                }
                obj = obj[k];
            }
        });
    };

    const params = new URLSearchParams(window.location.search.slice(1));
    params.forEach((value: string, key: string) => {
        apply(key, value);
    });

    return config;
};

const initDropHandler = (canvas: HTMLCanvasElement, scene: Scene) => {
    // add a 'choose file' button
    const selector = document.createElement('input');
    selector.setAttribute('id', 'file-selector');
    selector.setAttribute('type', 'file');
    selector.setAttribute('accept', '.gltf,.glb,.ply');
    selector.onchange = () => {
        const files = selector.files;
        if (files.length > 0) {
            const file = selector.files[0];
            scene.loadModel(URL.createObjectURL(file), file.name);
        }
    };
    document.getElementById('file-selector-container')?.appendChild(selector);

    // also support user dragging and dropping a local glb file onto the canvas
    CreateDropHandler(canvas, urls => {
        const modelExtensions = ['.ply'];
        const model = urls.find(url => modelExtensions.some(extension => url.filename.endsWith(extension)));
        if (model) {
            scene.loadModel(model.url, model.filename);
        }
    });
};

const main = async () => {
    const url = new URL(window.location.href);

    // decode remote storage details
    let remoteStorageDetails;
    try {
        remoteStorageDetails = JSON.parse(decodeURIComponent(url.searchParams.get('remoteStorage')));
    } catch (e) {

    }

    // root events object
    const events = new Events();

    // edit history
    const editHistory = new EditHistory(events);

    // editor ui
    const editorUI = new EditorUI(events, !!remoteStorageDetails);

    // create the graphics device
    const graphicsDevice = await createGraphicsDevice(editorUI.canvas, {
        deviceTypes: ['webgl2'],
        antialias: false,
        depth: false,
        stencil: false,
        xrCompatible: false,
        powerPreference: 'high-performance'
    });

    // monkey-patch materials for premul alpha rendering
    initMaterials();

    const overrides = [
        getURLArgs()
    ];

    // resolve scene config
    const sceneConfig = getSceneConfig(overrides);

    // construct the manager
    const scene = new Scene(
        sceneConfig,
        editorUI.canvas,
        graphicsDevice
    );

    // tool manager
    const toolManager = new ToolManager(events);
    toolManager.register('move', new MoveTool(events, editHistory, scene));
    toolManager.register('rotate', new RotateTool(events, editHistory, scene));
    toolManager.register('scale', new ScaleTool(events, editHistory, scene));
    toolManager.register('rectSelection', new RectSelection(events, editorUI.canvasContainer.dom));
    toolManager.register('brushSelection', new BrushSelection(events, editorUI.canvasContainer.dom));

    registerEditorEvents(events, editHistory, scene, editorUI, remoteStorageDetails);

    initDropHandler(editorUI.canvas, scene);

    // load async models
    await scene.load();

    // handle load param and ready promise for visual testing harness
    const loadParam = url.searchParams.get('load');
    const loadUrl = loadParam && decodeURIComponent(loadParam);
    if (loadUrl) {
        await scene.loadModel(loadUrl, loadUrl);
    }

    window.scene = scene;
}

export { main };
