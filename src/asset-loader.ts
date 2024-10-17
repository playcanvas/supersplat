import { Asset, AssetRegistry, GraphicsDevice, GSplatData, GSplatResource, TEXTURETYPE_RGBP } from 'playcanvas';
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

// ideally this function would stream data directly into GSplatData buffers.
// unfortunately the .splat file format has no header specifying total number
// of splats so filesize must be known in order to allocate the correct amount
// of memory.
const deserializeFromSSplat = (data: ArrayBufferLike) => {
    const totalSplats = data.byteLength / 32;
    const dataView = new DataView(data);

    const storage_x = new Float32Array(totalSplats);
    const storage_y = new Float32Array(totalSplats);
    const storage_z = new Float32Array(totalSplats);
    const storage_opacity = new Float32Array(totalSplats);
    const storage_rot_0 = new Float32Array(totalSplats);
    const storage_rot_1 = new Float32Array(totalSplats);
    const storage_rot_2 = new Float32Array(totalSplats);
    const storage_rot_3 = new Float32Array(totalSplats);
    const storage_f_dc_0 = new Float32Array(totalSplats);
    const storage_f_dc_1 = new Float32Array(totalSplats);
    const storage_f_dc_2 = new Float32Array(totalSplats);
    const storage_scale_0 = new Float32Array(totalSplats);
    const storage_scale_1 = new Float32Array(totalSplats);
    const storage_scale_2 = new Float32Array(totalSplats);
    const storage_state = new Uint8Array(totalSplats);


    const SH_C0 = 0.28209479177387814;
    let off;

    for(let i = 0; i < totalSplats; i++){
        off = i * 32;
        storage_x[i] = dataView.getFloat32(off + 0, true);
        storage_y[i] = dataView.getFloat32(off + 4, true);
        storage_z[i] = dataView.getFloat32(off + 8, true);

        storage_scale_0[i] = Math.log(dataView.getFloat32(off + 12, true));
        storage_scale_1[i] = Math.log(dataView.getFloat32(off + 16, true));
        storage_scale_2[i] = Math.log(dataView.getFloat32(off + 20, true));

        storage_f_dc_0[i] = (dataView.getUint8(off + 24) / 255 - 0.5) / SH_C0;
        storage_f_dc_1[i] = (dataView.getUint8(off + 25) / 255 - 0.5) / SH_C0;
        storage_f_dc_2[i] = (dataView.getUint8(off + 26) / 255 - 0.5) / SH_C0;

        storage_opacity[i] = -Math.log(255 / dataView.getUint8(off + 27) - 1);

        storage_rot_0[i] = (dataView.getUint8(off + 28) - 128) / 128;
        storage_rot_1[i] = (dataView.getUint8(off + 29) - 128) / 128;
        storage_rot_2[i] = (dataView.getUint8(off + 30) - 128) / 128;
        storage_rot_3[i] = (dataView.getUint8(off + 31) - 128) / 128;
    }


    return new GSplatData([{
        name: 'vertex',
        count: totalSplats,
        properties: [
            {type: 'float', name: 'x', storage: storage_x, byteSize: 4},
            {type: 'float', name: 'y', storage: storage_y, byteSize: 4},
            {type: 'float', name: 'z', storage: storage_z, byteSize: 4},            
            {type: 'float', name: 'opacity', storage: storage_opacity, byteSize: 4},
            {type: 'float', name: 'rot_0', storage: storage_rot_0, byteSize: 4},
            {type: 'float', name: 'rot_1', storage: storage_rot_1, byteSize: 4},
            {type: 'float', name: 'rot_2', storage: storage_rot_2, byteSize: 4},
            {type: 'float', name: 'rot_3', storage: storage_rot_3, byteSize: 4},            
            {type: 'float', name: 'f_dc_0', storage: storage_f_dc_0, byteSize: 4},
            {type: 'float', name: 'f_dc_1', storage: storage_f_dc_1, byteSize: 4},
            {type: 'float', name: 'f_dc_2', storage: storage_f_dc_2, byteSize: 4},            
            {type: 'float', name: 'scale_0', storage: storage_scale_0, byteSize: 4},
            {type: 'float', name: 'scale_1', storage: storage_scale_1, byteSize: 4},
            {type: 'float', name: 'scale_2', storage: storage_scale_2, byteSize: 4},
            {type: 'float', name: 'state', storage: storage_state, byteSize: 4}
        ]
    }]);
};

// handles loading gltf container assets
class AssetLoader {
    device: GraphicsDevice;
    registry: AssetRegistry;
    defaultAnisotropy: number;
    loadAllData = true;

    constructor(device: GraphicsDevice, registry: AssetRegistry, defaultAnisotropy?: number) {
        this.device = device;
        this.registry = registry;
        this.defaultAnisotropy = defaultAnisotropy || 1;
    }

    loadPly(loadRequest: ModelLoadRequest) {
        startSpinner();

        return new Promise<Splat>((resolve, reject) => {
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

            asset.on('error', (err: string) => reject(err));

            this.registry.add(asset);
            this.registry.load(asset);
        }).finally(() => {
            stopSpinner();
        });
    }

    loadSplat(loadRequest: ModelLoadRequest) {
        startSpinner();

        return new Promise<Splat>((resolve, reject) => {
            fetch(loadRequest.url || loadRequest.filename)
            .then((response) => {
                if (!response || !response.ok || !response.body) {
                    reject('Failed to fetch splat data');
                } else {
                    return response.arrayBuffer();
                }
            })
            .then((arrayBuffer) => deserializeFromSSplat(arrayBuffer))
            .then((gsplatData) => {
                const asset = new Asset(loadRequest.filename || loadRequest.url, 'gsplat', {
                    url: loadRequest.url,
                    filename: loadRequest.filename
                });
                asset.resource = new GSplatResource(this.device, gsplatData);
                resolve(new Splat(asset));
            })
            .catch((err) => {
                console.error(err);
                reject('Failed to load splat data');
            });
        }).finally(() => {
            stopSpinner();
        });
    }

    loadModel(loadRequest: ModelLoadRequest) {
        const filename = (loadRequest.filename || loadRequest.url).toLowerCase();
        if (filename.endsWith('.ply')) {
            return this.loadPly(loadRequest);
        } else if (filename.endsWith('.splat')) {
            return this.loadSplat(loadRequest);
        }
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
