import {dracoInitialize} from 'playcanvas';
import {Scene} from './scene';
import {initMaterials} from './material';
import {GlobalState} from './types';
import {getSceneConfig} from './scene-config';
import {Debug} from './debug';

declare global {
    interface Window {
        snap: any;
        viewerBootstrap: Promise<GlobalState>;
        scene: Scene;
    }
}

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

    const overrides = [globalState.aresSdkConfig];

    // extract settings from command line in non-prod builds only
    Debug.exec(() => {
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
            if (key.startsWith('sc_pc_')) {
                apply(key.slice(6), value);
            }
        });
        overrides.unshift(config);
    });

    // resolve scene config
    const sceneConfig = getSceneConfig(
        globalState.aresSdkConfig.productVisualizationUrl,
        globalState.gltfContents,
        envImageURL,
        overrides
    );

    // construct the manager
    const scene = new Scene(
        sceneConfig,
        globalState.inputEventHandlers,
        globalState.canvas,
        globalState.gl,
        globalState.modelLoadComplete,
    );

    // load async models
    await scene.load();

    window.scene = scene;
    globalState.loadComplete();
});
