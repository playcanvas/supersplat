import { Mat4, Vec3 } from 'playcanvas';

import { PlacePivotOp, SplatsTransformOp, MultiOp } from './edit-ops';
import { Events } from './events';
import { Pivot } from './pivot';
import { Splat } from './splat';
import { State } from './splat-state';
import { Transform } from './transform';
import { TransformHandler } from './transform-handler';

const mat = new Mat4();
const mat2 = new Mat4();
const transform = new Transform();

class SplatsTransformHandler implements TransformHandler {
    events: Events;
    splat: Splat;
    pivotStart = new Transform();
    localToPivot = new Mat4();
    worldToLocal = new Mat4();

    transform = new Mat4();
    paletteMap = new Map<number, number>();

    constructor(events: Events) {
        this.events = events;

        events.on('pivot.started', (pivot: Pivot) => {
            if (this.splat) {
                this.start();
            }
        });

        events.on('pivot.moved', (pivot: Pivot) => {
            if (this.splat) {
                this.update(pivot.transform);
            }
        });

        events.on('pivot.ended', (pivot: Pivot) => {
            if (this.splat) {
                this.end();
            }
        });

        events.on('selection.changed', (splat) => {
            if (this.splat && splat === this.splat) {
                this.placePivot();
            }
        });

        events.on('pivot.origin', (mode: 'center' | 'boundCenter') => {
            if (this.splat) {
                this.placePivot();
            }
        });

        events.on('camera.focalPointPicked', (details: { splat: Splat, position: Vec3 }) => {
            if (this.splat && ['move', 'rotate', 'scale'].includes(this.events.invoke('tool.active'))) {
                const pivot = events.invoke('pivot') as Pivot;
                const oldt = pivot.transform.clone();
                const newt = new Transform(details.position, pivot.transform.rotation, pivot.transform.scale);
                const op = new PlacePivotOp({ pivot, oldt, newt });
                events.fire('edit.add', op);
            }
        });
    }

    placePivot() {
        const origin = this.events.invoke('pivot.origin');
        this.splat.getPivot(origin === 'center' ? 'center' : 'boundCenter', true, transform);
        this.events.fire('pivot.place', transform);
    }

    activate() {
        this.splat = this.events.invoke('selection') as Splat;
        if (this.splat) {
            this.placePivot();
        }
    }

    deactivate() {
        this.splat = null;
    }

    start() {
        const pivot = this.events.invoke('pivot') as Pivot;
        const { transform } = pivot;
        const { splat } = this;
        const { transformPalette } = splat;

        mat.setTRS(transform.position, transform.rotation, transform.scale);

        // calculate local -> pivot transform
        this.localToPivot.invert(mat);
        this.localToPivot.mul2(this.localToPivot, splat.entity.getLocalTransform());

        // calculate the world -> local transform
        this.worldToLocal.invert(splat.entity.getLocalTransform());

        this.pivotStart.copy(transform);

        // allocate a new transform for the current selection
        const state = splat.splatData.getProp('state') as Uint8Array;
        const indices = splat.transformTexture.lock() as Uint16Array;

        const { paletteMap } = this;
        paletteMap.clear();

        for (let i = 0; i < state.length; ++i) {
            if (state[i] === State.selected) {
                const oldIdx = indices[i];
                let newIdx;
                if (!paletteMap.has(oldIdx)) {
                    newIdx = transformPalette.alloc();
                    paletteMap.set(oldIdx, newIdx);
                } else {
                    newIdx = paletteMap.get(oldIdx);
                }

                indices[i] = newIdx;
            }
        }

        splat.transformTexture.unlock();

        // initialize transforms
        this.paletteMap.forEach((newIdx, oldIdx) => {
            transformPalette.getTransform(oldIdx, mat);
            transformPalette.setTransform(newIdx, mat);
        });

        splat.selectionAlpha = 0;
        splat.scene.outline.enabled = false;
        splat.scene.underlay.enabled = false;
    }

    update(transform: Transform) {
        // calculate updated new pivot -> world transform
        mat.setTRS(transform.position, transform.rotation, transform.scale);
        mat.mul2(mat, this.localToPivot);       // local -> world
        mat.mul2(this.worldToLocal, mat);       // world -> local

        this.transform.copy(mat);

        // update the transform palette
        const { transformPalette } = this.splat;
        this.paletteMap.forEach((newIdx, oldIdx) => {
            transformPalette.getTransform(oldIdx, mat2);
            mat2.mul2(mat, mat2);
            transformPalette.setTransform(newIdx, mat2);
        });

        this.splat.makeSelectionBoundDirty();
    }

    end() {
        const { splat, transform, paletteMap } = this;

        // TODO: consider moving this to update() function above so splats are sorted correctly
        // for render during drag (which is slower).
        splat.updatePositions();
        splat.selectionAlpha = 1;
        splat.scene.outline.enabled = true;
        splat.scene.underlay.enabled = true;

        // create op for splat transform
        const top = new SplatsTransformOp({
            splat,
            transform: transform.clone(),
            paletteMap: new Map(paletteMap)
        });


        // create op for pivot placement
        const pivot = this.events.invoke('pivot') as Pivot;
        const oldt = this.pivotStart.clone();
        const newt = pivot.transform.clone();
        const pop = new PlacePivotOp({ pivot, newt, oldt });

        // add the editop without applying it
        this.events.fire('edit.add', new MultiOp([top, pop]), true);
    }
}

export { SplatsTransformHandler };
