
const contentsPromise: Promise<ArrayBuffer> = null;

// default config
const sceneConfig = {
    model: {
        url: '',
        filename: '',
        contents: contentsPromise,
        position: {x: 0, y: 0, z: 0},
        rotation: {x: 0, y: 0, z: 0},
        scale: 1.0,
        hideLeftShoe: true
    },
    env: {
        url: '',
        intensity: 1.0,
        rotation: 0.0
    },
    backgroundColor: {r: 0, g: 0, b: 0, a: 0},
    camera: {
        pixelScale: 1,
        multisample: false,
        fov: 50,
        exposure: 1.0,
        toneMapping: 'linear',
        debug_render: '',
        debug: true
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

    getVec3(path: string) {
        const value = this.get(path);
        if (typeof value === 'string') {
            const values = value.split(',').map((v: string) => parseFloat(v));
            return values.length === 1
                ? {x: values[0], y: values[0], z: values[0]}
                : {x: values[0], y: values[1], z: values[2]};
        } else if (typeof value === 'number') {
            return {x: value, y: value, z: value};
        }
        return undefined;
    }

    getColor(path: string) {
        const value = this.get(path);
        const makeColor = (vals: number[]) => {
            return vals.length === 4 ? {r: vals[0], g: vals[1], b: vals[2], a: vals[3]} : undefined;
        };
        return typeof value === 'string' ? makeColor(value.split(',').map(v => parseFloat(v))) : undefined;
    }

    getVec(path: string) {
        const value = this.get(path);
        return typeof value === 'string' ? value.split(',') : undefined;
    }
}

const getSceneConfig = (overrides: any[]) => {
    const params = new Params(overrides);

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
