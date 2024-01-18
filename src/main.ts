import { dracoInitialize, createGraphicsDevice, WebglGraphicsDevice } from 'playcanvas';
import { Scene } from './scene';
import { getSceneConfig } from './scene-config';
import { CreateDropHandler } from './drop-handler';
import { initMaterials } from './material';
import { EditorUI } from './ui/editor';
import { registerEvents } from './editor-ops';

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

// take a relative URL and returns the absolute version
const makeUrl = (() => {
    const scripts = Array.from(document.getElementsByTagName('script')).filter(s => s.src);
    const urlBase = scripts[scripts.length - 1].src.split('/').slice(0, -1).join('/');
    return (url: string) => {
        return `${urlBase}/${url}`;
    };
})();

const fetchStaticAssets = () => {
    // fetch static assets
    const envImage = fetch(makeUrl('static/env/VertebraeHDRI_v1_512.png'))
        .then(r => r.arrayBuffer())
        .then(arrayBuffer => URL.createObjectURL(new File([arrayBuffer], 'env.png', {type: 'image/png'})));

    const dracoJs = fetch(makeUrl('static/lib/draco_decoder.js'))
        .then(r => r.text())
        .then(text => URL.createObjectURL(new File([text], 'draco.js', {type: 'application/javascript'})));

    const dracoWasm = fetch(makeUrl('static/lib/draco_decoder.wasm'))
        .then(r => r.arrayBuffer())
        .then(arrayBuffer => URL.createObjectURL(new File([arrayBuffer], 'draco.wasm', {type: 'application/wasm'})));

    return { envImage, dracoJs, dracoWasm };
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

    // handle load param and ready promise for visual testing harness
    const loadParam = url.searchParams.get('load');
    const loadUrl = loadParam && decodeURIComponent(loadParam);

    // decode remote storage details
    let remoteStorageDetails;
    try {
        remoteStorageDetails = JSON.parse(decodeURIComponent(url.searchParams.get('remoteStorage')));
    } catch (e) {

    }

    const editorUI = new EditorUI(!!remoteStorageDetails);

    const { envImage, dracoJs, dracoWasm } = fetchStaticAssets();

    // create the graphics device
    const createPromise = createGraphicsDevice(editorUI.canvas, {
        deviceTypes: (url.searchParams.has('webgpu') ? ['webgpu'] : []).concat(['webgl2']),
        glslangUrl: makeUrl('lib/glslang/glslang.js'),
        twgslUrl: makeUrl('lib/twgsl/twgsl.js'),
        antialias: false,
        depth: false,
        stencil: false,
        xrCompatible: true,
        powerPreference: 'high-performance'
    });

    // monkey-patch materials for premul alpha rendering
    initMaterials();

    // wait for async loads to complete
    const [dracoJsURL, dracoWasmURL, envImageURL, graphicsDevice] = await Promise.all([dracoJs, dracoWasm, envImage, createPromise]);

    // initialize draco
    dracoInitialize({
        jsUrl: dracoJsURL,
        wasmUrl: dracoWasmURL,
        numWorkers: 2
    });

    const overrides = [
        {
            env: {
                url: envImageURL
            }
        },
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

    registerEvents(scene, editorUI, remoteStorageDetails);

    initDropHandler(editorUI.canvas, scene);

    // load async models
    await scene.load();
    if (loadUrl) {
        await scene.loadModel(loadUrl, loadUrl);
    }

    window.scene = scene;
}

export { main };
