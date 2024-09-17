import { Asset, AssetRegistry, TEXTURETYPE_RGBP } from 'playcanvas';
import { Model } from './model';
import { Splat } from './splat';
import { Env } from './env';

import { startSpinner, stopSpinner } from './ui/spinner';

interface ModelLoadRequest {
    url?: string;
    contents?: ArrayBuffer;
    filename?: string;
    maxAnisotropy?: number;
}

interface EnvLoadRequest {
    url: string;
    filename?: string;
}

// handles loading gltf container assets
class AssetLoader {
    registry: AssetRegistry;
    defaultAnisotropy: number;
    loadAllData = true;

    constructor(registry: AssetRegistry, defaultAnisotropy?: number) {
        this.registry = registry;
        this.defaultAnisotropy = defaultAnisotropy || 1;
    }

    loadModel(loadRequest: ModelLoadRequest) {
        const registry = this.registry;

        startSpinner();

        return new Promise<Model|Splat>((resolve, reject) => {
            const isPly = loadRequest.filename?.endsWith('.ply');

            if (isPly) {
                const asset = new Asset(
                    loadRequest.filename || loadRequest.url,
                    'gsplat',
                    {
                        url: loadRequest.url,
                        filename: loadRequest.filename,
                        contents: loadRequest.contents
                    },
                    {
                        elementFilter: this.loadAllData ? (() => true) : null,
                        // decompress data on load
                        decompress: true
                    }
                );

                asset.on('load', () => {
                    stopSpinner();

                    // support loading 2d splats by adding scale_2 property with almost 0 scale
                    const splatData = asset.resource.splatData;
                    if (splatData.getProp('scale_0') && splatData.getProp('scale_1') && !splatData.getProp('scale_2')) {
                        const scale2 = new Float32Array(splatData.numSplats).fill(Math.log(1e-6));
                        splatData.addProp('scale_2', scale2);

                        // place the new scale_2 property just after scale_1
                        const props = splatData.getElement('vertex').properties;
                        props.splice(props.findIndex((prop: any) => prop.name === 'scale_1') + 1, 0, props.splice(props.length - 1, 1)[0]);
                    }

                    // check the PLY contains minimal set of we expect
                    const required = [
                        'x', 'y', 'z',
                        'scale_0', 'scale_1', 'scale_2',
                        'rot_0', 'rot_1', 'rot_2', 'rot_3',
                        'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity'
                    ];
                    const missing = required.filter(x => !splatData.getProp(x));
                    if (missing.length > 0) {
                        reject(`This file does not contain gaussian splatting data. The following properties are missing: ${missing.join(', ')}`);
                    } else {
                        resolve(new Splat(asset));
                    }
                });

                asset.on('error', (err: string) => {
                    stopSpinner();
                    reject(err);
                });

                registry.add(asset);
                registry.load(asset);
            } else {
                const containerAsset = new Asset(
                    loadRequest.filename || loadRequest.url,
                    'container',
                    {
                        url: loadRequest.url,
                        filename: loadRequest.filename,
                        contents: loadRequest.contents
                    },
                    isPly ? { 
                        elementFilter: this.loadAllData ? (() => true) : null
                    } : null,
                    {
                        image: {
                            postprocess: (gltfImage: any, textureAsset: Asset) => {
                                textureAsset.resource.anisotropy = loadRequest.maxAnisotropy || this.defaultAnisotropy;
                            }
                        }
                    } as any
                );
                containerAsset.on('load', () => {
                    stopSpinner();
                    if (isPly) {
                        resolve(new Splat(containerAsset));
                    } else {
                        resolve(new Model(containerAsset));
                    }
                });
                containerAsset.on('error', (err: string) => {
                    stopSpinner();
                    reject(err);
                });

                registry.add(containerAsset);
                registry.load(containerAsset);
            }
        });
    }

    loadEnv(loadRequest: EnvLoadRequest) {
        const registry = this.registry;
        return new Promise<Env>((resolve, reject) => {
            const textureAsset = new Asset('skybox_equi', 'texture', loadRequest, {
                mipmaps: false,
                type: TEXTURETYPE_RGBP
            });
            textureAsset.ready(() => resolve(new Env(textureAsset)));
            textureAsset.on('error', (err: string) => reject(err));
            registry.add(textureAsset);
            registry.load(textureAsset);
        });
    }
}

export {AssetLoader};
