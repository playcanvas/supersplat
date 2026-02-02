import { getInputFormat, ReadFileSystem } from '@playcanvas/splat-transform';
import { AppBase, Asset, GSplatResource, Vec3 } from 'playcanvas';

import { Events } from './events';
import { loadGSplatData, validateGSplatData } from './io';
import { Splat } from './splat';

const getOrientation = (filename: string) => {
    switch (getInputFormat(filename)) {
        case 'spz':
            return new Vec3(0, 0, 0);
        case 'lcc':
            return new Vec3(90, 0, 180);
        default:
            return new Vec3(0, 0, 180);
    }
};

// handles loading gsplat assets using splat-transform
class AssetLoader {
    app: AppBase;
    events: Events;

    constructor(app: AppBase, events: Events) {
        this.app = app;
        this.events = events;
    }

    async load(filename: string, fileSystem: ReadFileSystem, animationFrame?: boolean, skipReorder?: boolean) {
        if (!animationFrame) {
            this.events.fire('startSpinner');
        }

        try {
            // Skip reordering for animation frames (speed) or when explicitly requested (already ordered)
            const gsplatData = await loadGSplatData(filename, fileSystem, skipReorder || animationFrame);
            validateGSplatData(gsplatData);

            const asset = new Asset(filename, 'gsplat', { url: `local-asset-${Date.now()}`, filename });
            this.app.assets.add(asset);
            asset.resource = new GSplatResource(this.app.graphicsDevice, gsplatData);

            return new Splat(asset, getOrientation(filename));
        } finally {
            if (!animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }
}

export { AssetLoader };
