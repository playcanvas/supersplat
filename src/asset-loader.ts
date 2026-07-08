import { ReadFileSystem } from '@playcanvas/splat-transform';
import { AppBase, Asset, GSplatData, GSplatResource } from 'playcanvas';

import { Events } from './events';
import { loadGSplatData, validateGSplatData } from './io';
import { Splat } from './splat';

// handles loading gsplat assets using splat-transform
class AssetLoader {
    app: AppBase;
    events: Events;

    constructor(app: AppBase, events: Events) {
        this.app = app;
        this.events = events;
    }

    // wrap in-memory GSplatData in a gsplat Asset + GSplatResource registered with
    // the engine. shared by the splat-transform load path and the PLY sequence
    // frame source, which already holds decoded GSplatData.
    createGSplatAsset(gsplatData: GSplatData, filename: string): Asset {
        const asset = new Asset(filename, 'gsplat', { url: `local-asset-${Date.now()}`, filename });
        this.app.assets.add(asset);
        asset.resource = new GSplatResource(this.app.graphicsDevice, gsplatData);
        return asset;
    }

    async load(filename: string, fileSystem: ReadFileSystem, animationFrame?: boolean, skipReorder?: boolean) {
        if (!animationFrame) {
            this.events.fire('startSpinner');
        }

        try {
            // Skip reordering for animation frames (speed) or when explicitly requested (already ordered)
            const { gsplatData, transform } = await loadGSplatData(filename, fileSystem, skipReorder || animationFrame);
            validateGSplatData(gsplatData);

            const asset = this.createGSplatAsset(gsplatData, filename);

            return new Splat(asset, transform.rotation);
        } finally {
            if (!animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }
}

export { AssetLoader };
