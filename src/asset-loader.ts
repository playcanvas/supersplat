import { getInputFormat, ReadFileSystem } from '@playcanvas/splat-transform';
import { AppBase, Asset, GSplatData, GSplatResource, Vec3 } from 'playcanvas';

import { Events } from './events';
import { loadWithSplatTransform, validateGSplatData } from './io';
import { Splat } from './splat';

const defaultOrientation = new Vec3(0, 0, 180);
const lccOrientation = new Vec3(90, 0, 180);

// handles loading gsplat assets using splat-transform
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

    async load(filename: string, fileSystem: ReadFileSystem, animationFrame?: boolean) {
        if (!animationFrame) {
            this.events.fire('startSpinner');
        }

        try {
            const inputFormat = getInputFormat(filename.toLowerCase());

            // Load using splat-transform
            const gsplatData = await loadWithSplatTransform(filename, fileSystem);

            // Validate the loaded data
            validateGSplatData(gsplatData);

            // Wrap in Asset and GSplatResource
            const asset = this.wrapGSplatData(gsplatData, filename);

            // Determine orientation based on format
            const orientation = inputFormat === 'lcc' ? lccOrientation : defaultOrientation;

            return new Splat(asset, orientation);
        } finally {
            if (!animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }

    private wrapGSplatData(gsplatData: GSplatData, filename: string): Asset {
        const asset = new Asset(filename, 'gsplat', {
            url: `local-asset-${Date.now()}`,
            filename
        });
        this.app.assets.add(asset);
        asset.resource = new GSplatResource(this.app.graphicsDevice, gsplatData);
        return asset;
    }
}

export { AssetLoader };
