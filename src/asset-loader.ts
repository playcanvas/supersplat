import { getInputFormat, ReadFileSystem } from '@playcanvas/splat-transform';
import { AppBase, Asset, GSplatResource, Vec3 } from 'playcanvas';

import { Events } from './events';
import { loadGSplatData, validateGSplatData } from './io';
import { Splat } from './splat';

const defaultOrientation = new Vec3(0, 0, 180);
const lccOrientation = new Vec3(90, 0, 180);

// handles loading gsplat assets using splat-transform
class AssetLoader {
    app: AppBase;
    events: Events;

    constructor(app: AppBase, events: Events) {
        this.app = app;
        this.events = events;
    }

    async load(filename: string, fileSystem: ReadFileSystem, animationFrame?: boolean) {
        if (!animationFrame) {
            this.events.fire('startSpinner');
        }

        try {
            const gsplatData = await loadGSplatData(filename, fileSystem);
            validateGSplatData(gsplatData);

            const asset = new Asset(filename, 'gsplat', { url: `local-asset-${Date.now()}`, filename });
            this.app.assets.add(asset);
            asset.resource = new GSplatResource(this.app.graphicsDevice, gsplatData);

            const orientation = getInputFormat(filename.toLowerCase()) === 'lcc' ? lccOrientation : defaultOrientation;
            return new Splat(asset, orientation);
        } finally {
            if (!animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }
}

export { AssetLoader };
