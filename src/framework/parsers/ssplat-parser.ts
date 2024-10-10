import { Asset, AssetRegistry, GraphicsDevice, GSplatResource } from "playcanvas";
import { deserializeFromSSplat } from "../../splat-serializer";
import { PlayUrl, ResourceHandlerCallback } from "../play-types";


class SSplatParser {
    private device: GraphicsDevice;
    private assets: AssetRegistry;
    private maxRetries: number;

    constructor(device: GraphicsDevice, assets: AssetRegistry, maxRetries: number) {
        this.device = device;
        this.assets = assets;
        this.maxRetries = maxRetries;
    }

    async load(url: PlayUrl, callback: ResourceHandlerCallback, asset: Asset) {
        const response = await fetch(url.load);
        if (!response || !response.body) {
            callback('Error loading resource', null);
        } else {            
            const blob = await response.blob();

            const resource = new GSplatResource(
                this.device,
                deserializeFromSSplat(await blob.arrayBuffer())
            );          

            callback(null, resource);
        }
    }

    open(url: string, data: GSplatResource) {
        return data;
    }
}

export { SSplatParser };