import {dracoInitialize} from 'playcanvas';
import {Scene} from './scene';
import {initMaterials} from './material';
import {GlobalState} from './types';
import {getSceneConfig} from './scene-config';

declare global {
    interface Window {
        snap: any;
        viewerBootstrap: Promise<GlobalState>;
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

window.viewerBootstrap.then(async (globalState: GlobalState) => {
    // monkey-patch materials for premul alpha rendering
    initMaterials();

    // wait for async loads to complete
    const [dracoJsURL, dracoWasmURL, envImageURL] = await Promise.all([
        globalState.dracoJs,
        globalState.dracoWasm,
        globalState.envImage
    ]);

    // initialize draco
    dracoInitialize({
        jsUrl: dracoJsURL,
        wasmUrl: dracoWasmURL,
        numWorkers: 2
    });

    const overrides = [
        {
            model: {
                url: globalState.modelUrl,
                filename: globalState.modelFilename
            },
            env: {
                url: envImageURL
            }
        },
        getURLArgs(),
        globalState.config
    ];

    // resolve scene config
    const sceneConfig = getSceneConfig(overrides);

    // construct the manager
    const scene = new Scene(
        sceneConfig,
        globalState.canvas,
        globalState.gl,
        globalState.modelLoadComplete,
    );

    // load async models
    await scene.load();

    window.scene = scene;
    globalState.loadComplete();
});
