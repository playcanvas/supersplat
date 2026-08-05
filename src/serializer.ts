import type { Color, Vec3 } from 'playcanvas';

type Value = boolean | number | string | null | undefined;

// this class is used by elements to store their pertinent state
// every frame. the data is then compared with the previous frame's
// values in order to determine if any changes happened.
class Serializer {
    constructor(packValue: (value: Value) => void) {
        this.packValue = packValue;
    }

    packValue: (value: Value) => void;

    pack(...args: Value[]) {
        for (let j = 0; j < args.length; ++j) {
            this.packValue(args[j]);
        }
    }

    packa(a: Value[] | Float32Array) {
        for (let j = 0; j < a.length; ++j) {
            this.packValue(a[j]);
        }
    }

    packVec3(v: Vec3) {
        this.pack(v.x, v.y, v.z);
    }

    packColor(c: Color) {
        this.pack(c.r, c.g, c.b, c.a);
    }
}

export { Serializer };
