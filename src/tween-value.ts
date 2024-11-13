// possible interpolation functions
const Interp = {
    sinosidal: (n: number) => Math.sin((n * Math.PI) / 2.0),
    quadratic: (n: number) => n * (2 - n),
    quartic: (n: number) => 1 - --n * n * n * n,
    quintic: (n: number) => Math.pow(n - 1, 5) + 1,
    vertebrae: (n: number) => -Math.pow((Math.cos(n * Math.PI) + 1) / 2, 2) + 1
};

class Ops {
    keys: string[];

    constructor(value: any) {
        this.keys = Object.keys(value);
    }

    clone(obj: any) {
        const result: any = {};
        this.keys.forEach((key: string) => {
            result[key] = obj[key];
        });
        return result;
    }

    copy(target: any, source: any) {
        this.keys.forEach((key: string) => {
            target[key] = source[key];
        });
    }

    lerp(target: any, a: any, b: any, t: number) {
        this.keys.forEach((key: string) => {
            target[key] = a[key] + t * (b[key] - a[key]);
        });
    }
}

class TweenValue {
    ops: Ops;
    value: any;
    source: any;
    target: any;
    timer: number;
    transitionTime: number;

    constructor(value: any) {
        this.ops = new Ops(value);
        this.value = value;
        this.source = this.ops.clone(value);
        this.target = this.ops.clone(value);
        this.timer = 0;
        this.transitionTime = 0;
    }

    goto(target: any, transitionTime = 0.25) {
        if (transitionTime === 0) {
            this.ops.copy(this.value, target);
        }
        this.ops.copy(this.source, this.value);
        this.ops.copy(this.target, target);
        this.timer = 0;
        this.transitionTime = transitionTime;
    }

    update(deltaTime: number) {
        if (this.timer < this.transitionTime) {
            this.timer = Math.min(this.timer + deltaTime, this.transitionTime);
            this.ops.lerp(this.value, this.source, this.target, Interp.quintic(this.timer / this.transitionTime));
        } else {
            this.ops.copy(this.value, this.target);
        }
    }
}

export { TweenValue };
