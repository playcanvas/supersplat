import { dracoInitialize, createGraphicsDevice, WebglGraphicsDevice } from 'playcanvas';
import { Scene } from './scene';
import { getSceneConfig } from './scene-config';
import { startSpinner, stopSpinner } from './spinner';
import { CreateDropHandler } from './drop-handler';
import { initMaterials } from './material';
import { Editor } from './editor';

import { Element, ElementType } from './element';
import { Model } from './model';

declare global {
    interface Window {
        scene: Scene;
    }

    interface Navigator {
        xr: any;
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

// register for editor and scene events
const registerEvents = (scene: Scene, editor: Editor) => {

    // make a copy of the opacity channel because that's what we'll be modifying
    scene.on('element:added', (element: Element) => {
        if (element.type === ElementType.model) {
            const modelElement = element as Model;
            const resource = modelElement.asset.resource;
            const splatData = resource?.splatData;
            if (splatData) {
                splatData.addProp('opacityOrig', splatData.getProp('opacity').slice());
            }
        }
    });

    editor.controlPanel.events.on('focus', () => {
        scene.camera.focus();
    });

    const updateColorData = (resource: any) => {
        const splatData = resource?.splatData;
        resource?.instances.forEach((instance: any) => {
            instance.splat.updateColorData(
                splatData.getProp('f_dc_0'),
                splatData.getProp('f_dc_1'),
                splatData.getProp('f_dc_2'),
                splatData.getProp('opacity')
            );
        });

        scene.forceRender = true;
    };

    editor.controlPanel.events.on('reset', () => {
        scene.elements.forEach((element: Element) => {
            if (element.type === ElementType.model) {
                const modelElement = element as Model;
                const resource = modelElement.asset.resource;
                const splatData = resource?.splatData;
                if (splatData) {
                    const opacity = splatData.getProp('opacity');
                    const opacityOrig = splatData.getProp('opacityOrig');

                    for (let i = 0; i < splatData.numSplats; ++i) {
                        opacity[i] = opacityOrig[i];
                    }

                    updateColorData(resource);
                }
            }
        });
    });

    editor.controlPanel.events.on('cullBySize', (value: number) => {
        scene.elements.forEach((element: Element) => {
            if (element.type === ElementType.model) {
                const modelElement = element as Model;
                const resource = modelElement.asset.resource;
                const splatData = resource?.splatData;
                if (splatData) {
                    const opacity = splatData.getProp('opacity');
                    const scale_0 = splatData.getProp('scale_0');
                    const scale_1 = splatData.getProp('scale_1');
                    const scale_2 = splatData.getProp('scale_2');

                    // calculate min and max size
                    let scaleMin = scale_0[0];
                    let scaleMax = scale_0[0];
                    for (let i = 0; i < splatData.numSplats; ++i) {
                        scaleMin = Math.min(scaleMin, scale_0[i], scale_1[i], scale_2[i]);
                        scaleMax = Math.max(scaleMax, scale_0[i], scale_1[i], scale_2[i]);
                    }

                    const maxScale = Math.log(Math.exp(scaleMin) + value * (Math.exp(scaleMax) - Math.exp(scaleMin)));

                    let changed = 0;
                    for (let i = 0; i < splatData.numSplats; ++i) {
                        if (scale_0[i] > maxScale || scale_1[i] > maxScale || scale_2[i] > maxScale) {
                            opacity[i] = -10;
                            changed++;
                        }
                    }

                    console.log(`splatsChanged=${changed}`);

                    if (changed) {
                        updateColorData(resource);
                    }
                }
            }
        });
    });

    editor.controlPanel.events.on('cullByOpacity', (value: number) => {
        scene.elements.forEach((element: Element) => {
            if (element.type === ElementType.model) {
                const modelElement = element as Model;
                const resource = modelElement.asset.resource;
                const splatData = resource?.splatData;
                if (splatData) {
                    const opacity = splatData.getProp('opacity');

                    let changed = 0;
                    for (let i = 0; i < splatData.numSplats; ++i) {
                        const t = Math.exp(opacity[i]);
                        if ((1 / (1 + t)) < value) {
                            opacity[i] = -10;
                            changed++;
                        }
                    }

                    console.log(`splatsChanged=${changed}`);

                    if (changed) {
                        updateColorData(resource);
                    }
                }
            }
        });
    });
}

const main = async () => {
    startSpinner();

    const url = new URL(window.location.href);

    const editor = new Editor();

    const { envImage, dracoJs, dracoWasm } = fetchStaticAssets();

    // create the graphics device
    const createPromise = createGraphicsDevice(editor.canvas, {
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

    // handle load param and ready promise for visual testing harness
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
        editor.canvas,
        graphicsDevice,
        () => { }
    );

    registerEvents(scene, editor);

    // load async models
    await scene.load();

    window.scene = scene;

    initDropHandler(editor.canvas, scene);

    stopSpinner();
}

export { main };
