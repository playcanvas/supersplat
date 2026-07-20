import { Entity, RotateGizmo, ScaleGizmo, TransformGizmo, TranslateGizmo, Vec3 } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';

type ShapeGizmoMode = 'translate' | 'rotate' | 'scale' | 'none';

type ShapeGizmoOptions = {
    // include a rotate gizmo
    rotate: boolean;
    // restrict the scale gizmo to its uniform center handle
    uniformScale: boolean;
    // minimum local scale the scale gizmo may apply
    lowerBoundScale: Vec3;
    // a gizmo drag started
    onTransformStart: () => void;
    // a gizmo changed the pivot's transform
    onTransform: (mode: ShapeGizmoMode) => void;
    // a gizmo drag ended
    onTransformEnd: () => void;
    // the active mode changed
    onModeChanged: (mode: ShapeGizmoMode) => void;
};

// Manages the translate/rotate/scale gizmos for a selection shape (box/sphere).
// One gizmo is attached at a time based on the current mode; 'none' hides them
// all while the owning tool stays active.
class ShapeTransformGizmo {
    attach: (pivot: Entity) => void;
    detach: () => void;
    setMode: (mode: ShapeGizmoMode) => void;
    toggleMode: (mode: Exclude<ShapeGizmoMode, 'none'>) => void;

    private _mode: ShapeGizmoMode = 'translate';

    get mode() {
        return this._mode;
    }

    constructor(events: Events, scene: Scene, options: ShapeGizmoOptions) {
        const translate = new TranslateGizmo(scene.camera.camera, scene.gizmoLayer);

        const scale = new ScaleGizmo(scene.camera.camera, scene.gizmoLayer);
        if (options.uniformScale) {
            // disable everything except uniform scale
            ['x', 'y', 'z', 'yz', 'xz', 'xy'].forEach((axis) => {
                scale.enableShape(axis as 'x' | 'y' | 'z' | 'yz' | 'xz' | 'xy', false);
            });
        }
        scale.lowerBoundScale.copy(options.lowerBoundScale);

        const gizmos = new Map<ShapeGizmoMode, TransformGizmo>();
        gizmos.set('translate', translate);
        gizmos.set('scale', scale);

        if (options.rotate) {
            const rotate = new RotateGizmo(scene.camera.camera, scene.gizmoLayer);
            rotate.rotationMode = 'orbit';
            gizmos.set('rotate', rotate);
        }

        const all = Array.from(gizmos.values());

        all.forEach((gizmo) => {
            gizmo.on('render:update', () => {
                scene.forceRender = true;
            });

            gizmo.on('transform:start', () => {
                options.onTransformStart();
            });

            gizmo.on('transform:move', () => {
                options.onTransform(this._mode);
            });

            gizmo.on('transform:end', () => {
                options.onTransformEnd();
            });
        });

        // translate & rotate follow the editor coordinate space (scale is
        // always local; the engine ignores the assignment)
        const setCoordSpace = (space: 'local' | 'world') => {
            all.forEach((gizmo) => {
                gizmo.coordSpace = space;
            });
            // the gizmos only request a redraw from within a frame, so with
            // on-demand rendering the reorientation needs a forced frame
            scene.forceRender = true;
        };
        setCoordSpace(events.invoke('tool.coordSpace'));
        events.on('tool.coordSpace', setCoordSpace);

        // keep all gizmos a constant size in screen space so switching modes
        // never shows a stale size
        const updateGizmoSize = () => {
            const { camera, canvas } = scene;
            const size = camera.ortho ?
                1125 / canvas.clientHeight :
                1200 / Math.max(canvas.clientWidth, canvas.clientHeight);
            all.forEach((gizmo) => {
                gizmo.size = size;
            });
        };
        updateGizmoSize();
        events.on('camera.resize', updateGizmoSize);
        events.on('camera.ortho', updateGizmoSize);

        // non-null while the owning tool is active, so the current-mode gizmo
        // can attach as soon as a mode is picked even while hidden
        let pivot: Entity | null = null;

        const activeGizmo = () => gizmos.get(this._mode) ?? null;

        this.attach = (p: Entity) => {
            pivot = p;
            activeGizmo()?.attach([p]);
        };

        this.detach = () => {
            activeGizmo()?.detach();
            pivot = null;
        };

        this.setMode = (mode: ShapeGizmoMode) => {
            // ignore modes this instance doesn't own (e.g. rotate on a sphere)
            if (mode === this._mode || (mode !== 'none' && !gizmos.has(mode))) {
                return;
            }
            activeGizmo()?.detach();
            this._mode = mode;
            if (pivot) {
                activeGizmo()?.attach([pivot]);
            }
            options.onModeChanged(this._mode);
        };

        // re-selecting the active mode hides the gizmo entirely
        this.toggleMode = (mode: Exclude<ShapeGizmoMode, 'none'>) => {
            this.setMode(mode === this._mode ? 'none' : mode);
        };
    }
}

export { ShapeGizmoMode, ShapeTransformGizmo };
