
type Color = { r: number, g: number, b: number, a: number };

const DEFAULT: Color = { r: 0.4, g: 0.4, b: 0.4, a: 1 };

// default config
const sceneConfig = {
    model: {
        url: '',
        filename: '',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: 1.0,
        hideLeftShoe: true
    },
    env: {
        url: '',
        intensity: 1.0,
        rotation: 0.0
    },
    bgClr: DEFAULT,
    camera: {
        pixelScale: 1,
        multisample: false,
        fov: 50,
        exposure: 1.0,
        toneMapping: 'linear',
        debug_render: '',
        debug: true
    },
    show: {
        grid: true,
        bound: true,
        shBands: 3
    },
    shadow: {
        intensity: 0.25,
        fade: true
    },
    controls: {
        dampingFactor: 0.2,
        minPolarAngle: 0,
        maxPolarAngle: Math.PI,
        minZoom: 1e-6,
        maxZoom: 10.0,
        initialAzim: -45,
        initialElev: -10,
        initialZoom: 1.0,
        orbitSensitivity: 0.3,
        zoomSensitivity: 0.4
    },
    debug: {
        showBound: false
    }
};

type SceneConfig = typeof sceneConfig;

class Params {
    sources: any[];

    constructor(sources: any[]) {
        this.sources = sources;
    }

    private resolve(configs: any[], path: string[]): any {
        const get = (obj: any): any => {
            for (const name of path) {
                if (!obj.hasOwnProperty(name)) {
                    return undefined;
                }
                obj = obj[name];
            }
            return obj;
        };

        for (const config of configs) {
            const value = get(config);
            if (value !== undefined) {
                return value;
            }
        }
        return undefined;
    }

    get(path: string): any {
        return this.resolve(this.sources, path.split('.'));
    }

    getBool(path: string): boolean | undefined {
        const value = this.get(path);
        return typeof value === 'string' ? value.toLowerCase() === 'true' : value === undefined ? undefined : !!value;
    }

    getNumber(path: string) {
        const value = this.get(path);
        return typeof value === 'string' ? parseFloat(value) : value;
    }

    getVec(path: string) {
        const value = this.get(path);
        return typeof value === 'string' ? value.split(',') : undefined;
    }

    getVec3(path: string) {
        const value = this.getVec(path);
        if (value) {
            const numbers = value.map(v => parseFloat(v));
            if (value.length === 1) {
                return { x: numbers[0], y: numbers[0], z: numbers[0] };
            } else if (value.length === 3) {
                return { x: numbers[0], y: numbers[1], z: numbers[2] };
            }
        }
        return undefined;
    }

    getColor(path: string) {
        const value = this.getVec(path);
        if (value) {
            const numbers = value.map(v => parseFloat(v));
            if (value.length === 1) {
                return { r: numbers[0], g: numbers[0], b: numbers[0], a: 1 };
            } else if (value.length === 3) {
                return { r: numbers[0], g: numbers[1], b: numbers[2], a: 1 };
            } else if (value.length === 4) {
                return { r: numbers[0], g: numbers[1], b: numbers[2], a: numbers[3] };
            }
        }
        return undefined;
    }
}

const getSceneConfig = (overrides: any[]) => {
    const params = new Params(overrides);

    const cmp = (a: any[], b: any[]) => {
        return a.length === b.length && a.every((v, i) => v === b[i]);
    };

    // recurse the object and replace concrete leaf values with overrides
    const rec = (obj: any, path: string) => {
        for (const child in obj) {
            const childPath = `${path}${path.length ? '.' : ''}${child}`;
            const childValue = obj[child];
            switch (typeof childValue) {
                case 'number':
                    obj[child] = params.getNumber(childPath) ?? childValue;
                    break;
                case 'boolean':
                    obj[child] = params.getBool(childPath) ?? childValue;
                    break;
                case 'string':
                    obj[child] = params.get(childPath) ?? childValue;
                    break;
                case 'object': {
                    const keys = Object.keys(childValue).sort();
                    if (cmp(keys, ['a', 'b', 'g', 'r'])) {
                        obj[child] = params.getColor(childPath) ?? childValue;
                    } else if (cmp(keys, ['x', 'y', 'z'])) {
                        obj[child] = params.getVec3(childPath) ?? childValue;
                    } else {
                        rec(childValue, childPath);
                    }
                    break;
                }
                default:
                    rec(childValue, childPath);
                    break;
            }
        }
    };

    rec(sceneConfig, '');

    return sceneConfig;
};

export {SceneConfig, getSceneConfig };
