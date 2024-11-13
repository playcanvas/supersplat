import { Color, Vec3 } from 'playcanvas';

// this class is used by elements to store their pertinent state
// every frame. the data is then compared with the previous frame's
// values in order to determine if any changes happened.
class Serializer {
    constructor(packValue: (value: any) => void) {
        this.packValue = packValue;
    }

    packValue: (value: any) => void;

    pack(...args: any[]) {
        for (let j = 0; j < args.length; ++j) {
            this.packValue(args[j]);
        }
    }

    packa(a: any[] | Float32Array) {
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
