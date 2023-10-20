import { dracoInitialize } from 'playcanvas';
import { Scene } from './scene';
import { getSceneConfig } from './scene-config';
import { startSpinner, stopSpinner } from './spinner';
import { CreateDropHandler } from './drop-handler';
import { initMaterials } from './material';
import { Editor } from './editor';

declare global {
    interface Window {
        scene: Scene;
    }

    interface Navigator {
        xr: any;
    }
}

// create the target canvas and gl context
const createCanvas = () => {
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.setAttribute('id', 'canvas');
    document.getElementById('canvas-container').appendChild(canvas);

    // fit the window with it
    const ratio = window.devicePixelRatio;
    const width = document.body.clientWidth;
    const height = document.body.clientHeight;
    const w = Math.ceil(width * ratio);
    const h = Math.ceil(height * ratio);

    canvas.width = w;
    canvas.height = h;
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    // create gl context
    const deviceOptions = {
        alpha: true,
        antialias: false,
        depth: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
        // create xrCompatible context if xr is available since we're not
        // sure whether xr mode will be requested or not at this point.
        xrCompatible: !!navigator.xr
    };

    const names = ['webgl2', 'webgl', 'experimental-webgl'];
    let gl: RenderingContext;
    for (let i = 0; i < names.length; ++i) {
        gl = canvas.getContext(names[i], deviceOptions);
        if (gl) {
            break;
        }
    }

    return {
        canvas: canvas,
        gl: gl
    };
};

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

const fetchStaticAssets = () => {
    // takes a relative URL and returns the absolute version
    const makeUrl = (() => {
        const scripts = Array.from(document.getElementsByTagName('script')).filter(s => s.src);
        const urlBase = scripts[scripts.length - 1].src.split('/').slice(0, -1).join('/');
        return (url: string) => {
            return `${urlBase}/${url}`;
        };
    })();

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
    document.body.appendChild(selector);

    // also support user dragging and dropping a local glb file onto the canvas
    CreateDropHandler(canvas, urls => {
        const modelExtensions = ['.glb', '.gltf', '.ply']
        const model = urls.find(url => modelExtensions.some(extension => url.filename.endsWith(extension)));
        if (model) {
            scene.loadModel(model.url, model.filename);
        }
    });
};

const main = async () => {
    startSpinner();

    const { envImage, dracoJs, dracoWasm } = fetchStaticAssets();

    // monkey-patch materials for premul alpha rendering
    initMaterials();

    // wait for async loads to complete
    const [dracoJsURL, dracoWasmURL, envImageURL] = await Promise.all([dracoJs,dracoWasm,envImage]);

    // initialize draco
    dracoInitialize({
        jsUrl: dracoJsURL,
        wasmUrl: dracoWasmURL,
        numWorkers: 2
    });

    const editor = new Editor();

    // construct the canvas and gl context
    const { canvas, gl } = createCanvas();

    // handle load param and ready promise for visual testing harness
    const url = new URL(window.location.href);
    const loadUrl = url.searchParams.get('load');
    const decodedUrl = loadUrl && decodeURIComponent(loadUrl);

    const overrides = [
        {
            model: {
                url: decodedUrl,
                filename: decodedUrl
            },
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
        canvas,
        gl,
        () => { }
    );

    // load async models
    await scene.load();

    window.scene = scene;

    initDropHandler(canvas, scene);

    stopSpinner()
}

export { main };
