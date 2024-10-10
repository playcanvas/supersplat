import { AppBase, Asset, ResourceHandler } from "playcanvas";
import { SSplatParser } from "./ssplat";
import { PlayUrl, ResourceHandlerCallback, Parser } from "./play-types";

class SSplatHandler extends ResourceHandler {

    private parser: Parser

    constructor(app: AppBase) {
        super(app, 'ssplat');
        this.parser = new SSplatParser(app.graphicsDevice, app.assets, 3);
    }

    load(url: string|PlayUrl, callback: ResourceHandlerCallback, asset?: Asset) {
        if (typeof url === 'string') {
            url = {
                load: url,
                original: url
            };
        }

        this.parser.load(url, callback, asset);
    }

    open(url: string, data: any, asset?: Asset) {
        return this.parser.open(url, data);
    }
}

export { SSplatHandler };