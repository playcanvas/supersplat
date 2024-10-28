import { createGraphicsDevice } from 'playcanvas';
import { Scene } from './scene';
import { getSceneConfig } from './scene-config';
import { initMaterials } from './material';
import { EditHistory } from './edit-history';
import { EditorUI } from './ui/editor';
import { registerEditorEvents } from './editor';
import { initFileHandler } from './file-handler';
import { registerSelectionEvents } from './selection';
import { registerTransformHandlerEvents } from './transform-handler';
import { ToolManager } from './tools/tool-manager';
import { RectSelection } from './tools/rect-selection';
import { BrushSelection } from './tools/brush-selection';
import { SphereSelection } from './tools/sphere-selection';
import { MoveTool } from './tools/move-tool';
import { RotateTool } from './tools/rotate-tool';
import { ScaleTool } from './tools/scale-tool';
import { Shortcuts } from './shortcuts';
import { Events } from './events';

declare global {
    interface LaunchParams {
        readonly files: FileSystemFileHandle[];
    }
    
    interface Window {
        launchQueue: {
            setConsumer: (callback: (launchParams: LaunchParams) => void) => void;
        };
        scene: Scene;
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

const initShortcuts = (events: Events) => {
    const shortcuts = new Shortcuts(events);

    shortcuts.register(['Delete', 'Backspace'], { event: 'select.delete' });
    shortcuts.register(['Escape'], { event: 'tool.deactivate' });
    shortcuts.register(['Tab'], { event: 'selection.next' });
    shortcuts.register(['1'], { event: 'tool.move', sticky: true });
    shortcuts.register(['2'], { event: 'tool.rotate', sticky: true });
    shortcuts.register(['3'], { event: 'tool.scale', sticky: true });
    shortcuts.register(['G', 'g'], { event: 'grid.toggleVisible' });
    shortcuts.register(['C', 'c'], { event: 'tool.toggleCoordSpace' });
    shortcuts.register(['F', 'f'], { event: 'camera.focus' });
    shortcuts.register(['B', 'b'], { event: 'tool.brushSelection', sticky: true });
    shortcuts.register(['R', 'r'], { event: 'tool.rectSelection', sticky: true });
    shortcuts.register(['P', 'p'], { event: 'tool.rectSelection', sticky: true });
    shortcuts.register(['A', 'a'], { event: 'select.all' });
    shortcuts.register(['A', 'a'], { event: 'select.none', shift: true });
    shortcuts.register(['I', 'i'], { event: 'select.invert' });
    shortcuts.register(['H', 'h'], { event: 'select.hide' });
    shortcuts.register(['U', 'u'], { event: 'select.unhide' });
    shortcuts.register(['['], { event: 'tool.brushSelection.smaller' });
    shortcuts.register([']'], { event: 'tool.brushSelection.bigger' });
    shortcuts.register(['Z', 'z'], { event: 'edit.undo', ctrl: true });
    shortcuts.register(['Z', 'z'], { event: 'edit.redo', ctrl: true, shift: true });
    shortcuts.register(['M', 'm'], { event: 'camera.toggleMode' });
    shortcuts.register(['D', 'd'], { event: 'dataPanel.toggle' });
    shortcuts.register([' '], { event: 'camera.toggleOverlay' });

    return shortcuts;
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
        events,
        sceneConfig,
        editorUI.canvas,
        graphicsDevice
    );

    // background color
    const clr = { r: -1, g: -1, b: -1 };

    const setBgClr = (r: number, g: number, b: number) => {
        if (r !== clr.r || g !== clr.g || b !== clr.b) {
            clr.r = r;
            clr.g = g;
            clr.b = b;

            const cnv = (v: number) => `${Math.max(0, Math.min(255, (v * 255))).toFixed(0)}`
            document.body.style.backgroundColor = `rgba(${cnv(r)},${cnv(g)},${cnv(b)},1)`;

            events.fire('bgClr', r, g, b);
        }
    };

    events.on('setBgClr', (r: number, g: number, b: number) => {
        setBgClr(r, g, b);
    });

    events.function('bgClr', () => {
        return { r: clr.r, g: clr.g, b: clr.b };
    });

    setBgClr(sceneConfig.bgClr.r, sceneConfig.bgClr.g, sceneConfig.bgClr.b);

    // tool manager
    const toolManager = new ToolManager(events);
    toolManager.register('rectSelection', new RectSelection(events, editorUI.toolsContainer.dom));
    toolManager.register('brushSelection', new BrushSelection(events, editorUI.toolsContainer.dom));
    toolManager.register('sphereSelection', new SphereSelection(events, scene, editorUI.canvasContainer));
    toolManager.register('move', new MoveTool(events, scene));
    toolManager.register('rotate', new RotateTool(events, scene));
    toolManager.register('scale', new ScaleTool(events, scene));

    window.scene = scene;

    registerEditorEvents(events, editHistory, scene);
    registerSelectionEvents(events, scene);
    registerTransformHandlerEvents(events);
    initShortcuts(events);
    await initFileHandler(scene, events, editorUI.appContainer.dom, remoteStorageDetails);

    // load async models
    await scene.load();

    // handle load params
    const loadList = url.searchParams.getAll('load');
    for (const value of loadList) {
        await events.invoke('load', decodeURIComponent(value));
    }

    // handle OS-based file association in PWA mode
    if ("launchQueue" in window) {
        window.launchQueue.setConsumer(async (launchParams: LaunchParams) => {
            for (const file of launchParams.files) {
                const blob = await file.getFile();
                const url = URL.createObjectURL(blob);
                await events.invoke('load', url, file.name);
                URL.revokeObjectURL(url);
            }
        });
    }
};

export { main };
