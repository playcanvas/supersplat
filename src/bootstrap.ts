import {GlobalState} from './types';
import {Debug} from './debug';
import {startSpinner, stopSpinner} from './spinner';
import {CreateDropHandler} from './drop-handler';

// BOOTSTRAP

declare global {
    interface Window {
        snap: any;
        viewerBootstrap: Promise<GlobalState>;
        ready: Promise<number>;
    }

    interface Navigator {
        xr: any;
    }
}

// create the target canvas and gl context
const createCanvas = () => {
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.setAttribute('id', 'canvas');
    document.getElementById('app').appendChild(canvas);

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

// takes a relative URL and returns the absolute version
const url = (() => {
    const scripts = Array.from(document.getElementsByTagName('script')).filter(s => s.src);
    const urlBase = scripts[scripts.length - 1].src.split('/').slice(0, -1).join('/');

    return (url: string) => {
        return `${urlBase}/${url}`;
    };
})();

Debug.time('load');

startSpinner();

// prefetch static assets
const envImage = fetch(url('static/env/VertebraeHDRI_v1_512.png'))
    .then(r => r.arrayBuffer())
    .then(arrayBuffer => URL.createObjectURL(new File([arrayBuffer], 'env.png', {type: 'image/png'})));

const dracoJs = fetch(url('static/lib/draco_decoder.js'))
    .then(r => r.text())
    .then(text => URL.createObjectURL(new File([text], 'draco.js', {type: 'application/javascript'})));

const dracoWasm = fetch(url('static/lib/draco_decoder.wasm'))
    .then(r => r.arrayBuffer())
    .then(arrayBuffer => URL.createObjectURL(new File([arrayBuffer], 'draco.wasm', {type: 'application/wasm'})));

// construct the canvas and gl context
const {canvas, gl} = createCanvas();

// application listens for this promise to resolve
let resolver: (globalState: GlobalState) => void;
window.viewerBootstrap = new Promise<GlobalState>(resolve => {
    resolver = resolve;
});

window.snap = {
    ar: {
        experience: {
            onLoad: (modelUrl: string, modelFilename: string, config: any) => {
                resolver({
                    canvas: canvas,
                    gl: gl,
                    config: config,
                    modelUrl: modelUrl,
                    modelFilename: modelFilename,
                    envImage: envImage,
                    dracoJs: dracoJs,
                    dracoWasm: dracoWasm,
                    loadComplete: () => {
                        stopSpinner();
                        Debug.timeEnd('load');
                    },
                    modelLoadComplete: (timing: number) => {
                        
                    },
                });
            },
            getEngagementContext: () => 'ARES_CONTEXT_VISUALIZATION'
        }
    }
};

const startBootstrap = () => {
    // this block is removed from prod builds
    let readyResolver: (loadTime: number) => void;
    window.ready = new Promise(resolve => {
        readyResolver = resolve;
    });

    // manually invoke the object viewer onLoad function using a mockup'd
    // aresSdkConfig object
    const start = (url: string, filename: string) => {
        const config = {
            // scene config overrides
            camera: {
                pixelScale: 1,
                toneMapping: 'aces2'
            },
            controls: {
                autoRotate: true
            },
            shadow: {
                fade: true
            },

            onViewReady: () => {
                readyResolver(0);
            }
        };

        window.snap.ar.experience.onLoad(url, filename, config);
    };

    // handle load param and ready promise for visual testing harness
    const url = new URL(window.location.href);

    // handle load model (used in visual testing and debugging)
    const loadUrl = url.searchParams.get('load');
    if (loadUrl) {
        const decodedUrl = decodeURIComponent(loadUrl);
        start(decodedUrl, decodedUrl);
    } else {
        let loaded = false;
        const load = (url: string, filename: string) => {
            if (!loaded) {
                loaded = true;
                start(url, filename);
            }
        };

        // add a 'choose file' button
        const selector = document.createElement('input');
        selector.setAttribute('id', 'file-selector');
        selector.setAttribute('type', 'file');
        selector.setAttribute('accept', '.gltf,.glb,.ply');
        selector.onchange = () => {
            const files = selector.files;
            if (files.length > 0) {
                document.body.removeChild(selector);
                load(URL.createObjectURL(selector.files[0]), selector.files[0].name);
            }
        };
        document.body.appendChild(selector);

        // also support user dragging and dropping a local glb file onto the canvas
        CreateDropHandler(canvas, urls => {
            const modelExtensions = ['.glb', '.gltf', '.ply']
            const model = urls.find(url => modelExtensions.some(extension => url.filename.endsWith(extension)));
            if (model) {
                document.body.removeChild(selector);
                load(model.url, model.filename);
            }
        });
    }
}

startBootstrap();
