import { Asset, AssetRegistry, StandardMaterial, TEXTURETYPE_RGBP } from 'playcanvas';
import { getDefaultPlyElements } from 'playcanvas-extras';
import { Model } from './model';
import { Splat } from './splat';
import { Env } from './env';

import { startSpinner, stopSpinner } from './spinner';

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
            const gemMaterials = new Set<StandardMaterial>();

            const isPly = loadRequest.filename?.endsWith('.ply');

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
                    },
                    material: {
                        postprocess: (gltfMaterial: any, materialAsset: StandardMaterial) => {
                            // keep tabs on materials with SNAP gemstone extension
                            if (gltfMaterial?.extensions?.SNAP_materials_gemstone) {
                                gemMaterials.add(materialAsset);
                            }
                        }
                    }
                } as any
            );
            containerAsset.on('load', () => {
                if (isPly) {
                    resolve(new Splat(containerAsset));
                } else {
                    resolve(new Model(containerAsset, gemMaterials));
                }

                stopSpinner();
            });
            containerAsset.on('error', (err: string) => {
                reject(err);
            });

            registry.add(containerAsset);
            registry.load(containerAsset);
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
