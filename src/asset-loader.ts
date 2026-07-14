import { ReadFileSystem } from '@playcanvas/splat-transform';
import { AppBase, Asset, GSplatData, GSplatResource } from 'playcanvas';

import { Events } from './events';
import { defaultLodIndex, loadGSplatData, validateGSplatData } from './io';
import { Splat } from './splat';
import { i18n } from './ui/localization';

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
            // ask the user which LOD to load when the file contains multiple,
            // pausing the spinner while the popup is up. the editor loads a
            // single LOD, so also recommend uploading the original file when
            // publishing to superspl.at.
            const pickLod = async (lodCounts: readonly number[]) => {
                this.events.fire('stopSpinner');
                try {
                    const result = await this.events.invoke('showPopup', {
                        type: 'okcancel',
                        header: i18n.t('popup.load-options-header'),
                        message: i18n.t('popup.lod-select-message'),
                        icon: false,
                        select: {
                            value: String(defaultLodIndex(lodCounts)),
                            options: lodCounts.map((count, i) => ({
                                v: String(i),
                                t: `LOD ${i} (${count.toLocaleString()} ${i18n.t('popup.lod-select-splats')})`
                            }))
                        },
                        warning: {
                            text: i18n.t('popup.lod-upload-note'),
                            link: `${window.location.origin}/upload`
                        }
                    });
                    return result.action === 'ok' ? parseInt(result.value, 10) : null;
                } finally {
                    this.events.fire('startSpinner');
                }
            };

            // Skip reordering for animation frames (speed) or when explicitly requested (already ordered)
            const result = await loadGSplatData(filename, fileSystem, skipReorder || animationFrame, animationFrame ? undefined : pickLod);
            if (!result) {
                // user cancelled LOD selection
                return null;
            }
            const { gsplatData, transform } = result;
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
