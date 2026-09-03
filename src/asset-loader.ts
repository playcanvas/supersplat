import { ReadFileSystem } from '@playcanvas/splat-transform';
import { AppBase, Asset } from 'playcanvas';

import { EditorSplatResource } from './editor-splat-resource';
import { Events } from './events';
import { defaultLodIndex, loadSplatSource } from './io';
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

    createGSplatAsset(resource: EditorSplatResource, filename: string): Asset {
        const asset = new Asset(filename, 'gsplat', { url: `local-asset-${Date.now()}`, filename });
        this.app.assets.add(asset);
        asset.resource = resource;
        return asset;
    }

    async load(filename: string, fileSystem: ReadFileSystem, animationFrame?: boolean, skipReorder?: boolean) {
        const loaded = await this.loadAsset(filename, fileSystem, animationFrame, skipReorder);
        return loaded && new Splat(loaded.asset, loaded.rotation);
    }

    // Load the static tier only, without a layer over it. A .ssproj can have
    // several layers sharing one resource, so the document loader creates the
    // asset once here and then builds each layer's own instance list.
    async loadAsset(filename: string, fileSystem: ReadFileSystem, animationFrame?: boolean, skipReorder?: boolean) {
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
            const result = await loadSplatSource(filename, fileSystem, skipReorder || animationFrame, animationFrame ? undefined : pickLod);
            if (!result) {
                // user cancelled LOD selection
                return null;
            }
            const { source, transform } = result;
            const resource = await EditorSplatResource.create(this.app.graphicsDevice, source);
            const asset = this.createGSplatAsset(resource, filename);

            return { asset, rotation: transform.rotation };
        } finally {
            if (!animationFrame) {
                this.events.fire('stopSpinner');
            }
        }
    }
}

export { AssetLoader };
