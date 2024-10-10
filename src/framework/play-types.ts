import { Asset, GSplatResource } from "playcanvas";


type ResourceHandlerCallback = (err: string|null, response: any) => void;
type DataType = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

interface PlayUrl {
    load: string,
    original: string
}

interface Parser {
    load: (url: PlayUrl, callback: ResourceHandlerCallback, asset: any) => Promise<void>,
    open: (url: string, data: any) => any
}

interface GSplatProperty {
    type: string,
    name: string,
    storage: DataType
    byteSize: number
}

interface GSplatElement {
    name: string,
    count: number
    properties: GSplatProperty[]
}

export {
    ResourceHandlerCallback,
    PlayUrl,
    Parser,
    GSplatProperty,
    GSplatElement    
}