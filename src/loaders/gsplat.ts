import { Asset, AssetRegistry, GSplatData, GSplatResource } from 'playcanvas';

import { AssetSource } from './asset-source';

let assetId = 0;

// use the engine to load a gsplat asset (ply, compressed.ply, sog, sog-bundle)
const loadGsplat = (assets: AssetRegistry, assetSource: AssetSource) => {
    const contents = assetSource.contents && (assetSource.contents instanceof Response ? assetSource.contents : new Response(assetSource.contents));

    const file = {
        // we must construct a unique url if contents is provided
        url: contents ? `local-asset-${assetId++}` : assetSource.url ?? assetSource.filename,
        filename: assetSource.filename,
        contents
    };

    const data = {
        // decompress data on load
        decompress: true,
        // disable morton re-ordering when loading animation frames
        reorder: !(assetSource.animationFrame ?? false)
    };

    const options = {
        mapUrl: assetSource.mapUrl
    };

    return new Promise<Asset>((resolve, reject) => {
        const asset = new Asset(
            assetSource.filename || assetSource.url,
            'gsplat',
            // @ts-ignore
            file,
            data,
            options
        );

        asset.on('load:data', (data: GSplatData) => {
            // support loading 2d splats by adding scale_2 property with almost 0 scale
            if (data instanceof GSplatData && data.getProp('scale_0') && data.getProp('scale_1') && !data.getProp('scale_2')) {
                const scale2 = new Float32Array(data.numSplats).fill(Math.log(1e-6));
                data.addProp('scale_2', scale2);

                // place the new scale_2 property just after scale_1
                const props = data.getElement('vertex').properties;
                props.splice(props.findIndex((prop: any) => prop.name === 'scale_1') + 1, 0, props.splice(props.length - 1, 1)[0]);
            }
        });

        asset.on('load', () => {
            // check the PLY contains minimal set of we expect
            const required = [
                'x', 'y', 'z',
                'scale_0', 'scale_1', 'scale_2',
                'rot_0', 'rot_1', 'rot_2', 'rot_3',
                'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity'
            ];
            const splatData = (asset.resource as GSplatResource).gsplatData as GSplatData;
            const missing = required.filter(x => !splatData.getProp(x));
            if (missing.length > 0) {
                reject(new Error(`This file does not contain gaussian splatting data. The following properties are missing: ${missing.join(', ')}`));
            } else {
                resolve(asset);
            }
        });

        asset.on('error', (err: string) => {
            reject(err);
        });

        assets.add(asset);
        assets.load(asset);
    });
};

export { loadGsplat };
