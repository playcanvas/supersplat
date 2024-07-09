import { createGraphicsDevice } from 'playcanvas';
import { Scene } from './scene';
import { getSceneConfig } from './scene-config';
import { initMaterials } from './material';
import { EditHistory } from './edit-history';
import { EditorUI } from './ui/editor';
import { registerEditorEvents } from './editor';
import { initFileHandler } from './file-handler';
import { initSelection } from './selection';
import { ToolManager } from './tools/tool-manager';
import { MoveTool } from './tools/move-tool';
import { RotateTool } from './tools/rotate-tool';
import { ScaleTool } from './tools/scale-tool';
import { RectSelection } from './tools/rect-selection';
import { BrushSelection } from './tools/brush-selection';
import { Shortcuts } from './shortcuts';
import { Events } from './events';
import { PickerSelection } from './tools/picker-selection';

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
    shortcuts.register(['G', 'g'], { event: 'show.gridToggle' });
    shortcuts.register(['C', 'c'], { event: 'tool.toggleCoordSpace' });
    shortcuts.register(['F', 'f'], { event: 'camera.focus' });
    shortcuts.register(['B', 'b'], { event: 'tool.brushSelection', sticky: true });
    shortcuts.register(['R', 'r'], { event: 'tool.rectSelection', sticky: true });
    shortcuts.register(['P', 'p'], { event: 'tool.pickerSelection', sticky: true });
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

    // keep tabs on splat size changes
    let splatSizeSave = 2;
    events.on('splatSize', (size: number) => {
        if (size !== 0) {
            splatSizeSave = size;
        }
    });

    // space toggles between 0 and size
    shortcuts.register([' '], {
        func: () => {
            events.fire('splatSize', events.invoke('splatSize') === 0 ? splatSizeSave : 0);
        }
    });

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

    // tool manager
    const toolManager = new ToolManager(events);
    toolManager.register('move', new MoveTool(events, editHistory, scene));
    toolManager.register('rotate', new RotateTool(events, editHistory, scene));
    toolManager.register('scale', new ScaleTool(events, editHistory, scene));
    toolManager.register('rectSelection', new RectSelection(events, editorUI.canvasContainer.dom, editorUI.canvas));
    toolManager.register('brushSelection', new BrushSelection(events, editorUI.canvasContainer.dom, editorUI.canvas));
    toolManager.register('pickerSelection', new PickerSelection(events, editorUI.canvasContainer.dom, editorUI.canvas));

    window.scene = scene;

    registerEditorEvents(events, editHistory, scene, editorUI);
    initSelection(events, scene);
    initShortcuts(events);
    await initFileHandler(scene, events, editorUI.canvas, remoteStorageDetails);

    // load async models
    await scene.load();

    // handle load param
    const loadParam = url.searchParams.get('load');
    const loadUrl = loadParam && decodeURIComponent(loadParam);
    if (loadUrl) {
        await scene.loadModel(loadUrl, loadUrl);
    }

    // handle OS-based file association in PWA mode
    if ("launchQueue" in window) {
        window.launchQueue.setConsumer(async (launchParams: LaunchParams) => {
            for (const file of launchParams.files) {
                const blob = await file.getFile();
                scene.loadModel(URL.createObjectURL(blob), file.name);
            }
        });
    }
};

export { main };
