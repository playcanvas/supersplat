import { Asset, GSplatResource } from "playcanvas";


type ResourceHandlerCallback = (err: string|null, response: any) => void;

interface PlayUrl {
    load: string,
    original: string
}

interface Parser {
    load: (url: PlayUrl, callback: ResourceHandlerCallback, asset: any) => Promise<void>,
    open: (url: string, data: any) => any
}

export {
    ResourceHandlerCallback,
    PlayUrl,
    Parser    
}