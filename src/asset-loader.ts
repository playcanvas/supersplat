import { AppBase, Asset, GSplatData, GSplatResource, Vec3 } from 'playcanvas';

import { Events } from './events';
import { loadLcc } from './loaders/lcc';
import { ModelLoadRequest } from './loaders/model-load-request';
import { loadPly } from './loaders/ply';
import { loadSplat } from './loaders/splat';
import { Splat } from './splat';

const defaultOrientation = new Vec3(0, 0, 180);
const lccOrientation = new Vec3(90, 0, 180);

// handles loading gltf container assets
class AssetLoader {
    app: AppBase;
    events: Events;
    defaultAnisotropy: number;
    loadAllData = true;

    constructor(app: AppBase, events: Events, defaultAnisotropy?: number) {
        this.app = app;
        this.events = events;
        this.defaultAnisotropy = defaultAnisotropy || 1;
    }

    async load(loadRequest: ModelLoadRequest) {
        const wrap = (gsplatData: GSplatData) => {
            const asset = new Asset(loadRequest.filename || loadRequest.url, 'gsplat', {
                url: loadRequest.contents ? `local-asset-${Date.now()}` : loadRequest.url ?? loadRequest.filename,
                filename: loadRequest.filename
            });
            this.app.assets.add(asset);
            asset.resource = new GSplatResource(this.app.graphicsDevice, gsplatData);
            return asset;
        };

        if (!loadRequest.animationFrame) {
            this.events.fire('startSpinner');
        }

        try {
            const filename = (loadRequest.filename || loadRequest.url).toLowerCase();

            let asset;
            let orientation = defaultOrientation;

            if (filename.endsWith('.splat')) {
                asset = wrap(await loadSplat(loadRequest));
            } else if (filename.endsWith('.lcc')) {
                asset = wrap(await loadLcc(loadRequest));
                orientation = lccOrientation;
            } else {
                asset = await loadPly(this.app.assets, loadRequest);
            }

            return new Splat(asset, orientation);
        } finally {
            if (!loadRequest.animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }
}

export { AssetLoader };
