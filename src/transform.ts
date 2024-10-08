import { Quat, Vec3 } from 'playcanvas';

class Transform {
    position = new Vec3();
    rotation = new Quat();
    scale = new Vec3(1, 1, 1);

    constructor(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        this.set(position, rotation, scale);
    }

    set(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        if (position) {
            this.position.copy(position);
        }
        if (rotation) {
            this.rotation.copy(rotation);
        }
        if (scale) {
            this.scale.copy(scale);
        }
    }

    copy(transform: Transform) {
        this.position.copy(transform.position);
        this.rotation.copy(transform.rotation);
        this.scale.copy(transform.scale);
    }

    clone() {
        return new Transform(this.position.clone(), this.rotation.clone(), this.scale.clone());
    }

    equals(transform: Transform) {
        return this.position.equals(transform.position) &&
               this.rotation.equals(transform.rotation) &&
               this.scale.equals(transform.scale);
    }

    equalsApprox(transform: Transform, epsilon = 1e-6) {
        return this.position.equalsApprox(transform.position, epsilon) &&
               this.rotation.equalsApprox(transform.rotation, epsilon) &&
               this.scale.equalsApprox(transform.scale, epsilon);
    }

    equalsTRS(position: Vec3, rotation: Quat, scale: Vec3) {
        return this.position.equals(position) &&
               this.rotation.equals(rotation) &&
               this.scale.equals(scale);
    }

    equalsApproxTRS(position: Vec3, rotation: Quat, scale: Vec3, epsilon = 1e-6) {
        return this.position.equalsApprox(position, epsilon) &&
               this.rotation.equalsApprox(rotation, epsilon) &&
               this.scale.equalsApprox(scale, epsilon);
    }
}

export { Transform };
