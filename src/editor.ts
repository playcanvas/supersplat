import {
    BoundingBox,
    Mat4,
    Vec3,
    Vec4,
} from 'playcanvas';
import { Scene } from './scene';
import { EditorUI } from './ui/editor';
import { EditHistory } from './edit-history';
import { Splat } from './splat';
import { State, DeleteSelectionEditOp, ResetEditOp } from './edit-ops';
import { Events } from './events';

// register for editor and scene events
const registerEditorEvents = (events: Events, editHistory: EditHistory, scene: Scene, editorUI: EditorUI) => {
    const vec = new Vec3();
    const vec2 = new Vec3();
    const vec4 = new Vec4();
    const mat = new Mat4();
    const aabb = new BoundingBox();

    // get the list of selected splats (currently limited to just a single one)
    const selectedSplats = () => {
        const selected = events.invoke('selection') as Splat;
        return selected?.visible ? [selected] : [];
    };

    const processSelection = (state: Uint8Array, op: string, pred: (i: number) => boolean) => {
        for (let i = 0; i < state.length; ++i) {
            if (state[i] & (State.deleted | State.hidden)) {
                state[i] &= ~State.selected;
            } else {
                const result = pred(i);
                switch (op) {
                    case 'add':
                        if (result) state[i] |= State.selected;
                        break;
                    case 'remove':
                        if (result) state[i] &= ~State.selected;
                        break;
                    case 'set':
                        if (result) {
                            state[i] |= State.selected;
                        } else {
                            state[i] &= ~State.selected;
                        }
                        break;
                }
            }
        }
    };

    let lastExportCursor = 0;

    // add unsaved changes warning message.
    window.addEventListener("beforeunload", function (e) {
        if (!events.invoke('scene.dirty')) {
            // if the undo cursor matches last export, then we have no unsaved changes
            return undefined;
        }

        const msg = 'You have unsaved changes. Are you sure you want to leave?';
        e.returnValue = msg;
        return msg;
    });

    events.function('scene.dirty', () => {
        return editHistory.cursor !== lastExportCursor;
    });

    events.on('scene.saved', () => {
        lastExportCursor = editHistory.cursor;
    });

    events.on('camera.mode', () => {
        scene.forceRender = true;
    });

    events.on('camera.debug', () => {
        scene.forceRender = true;
    });

    events.on('camera.splatSize', () => {
        scene.forceRender = true;
    });

    events.on('view.bands', (bands: number) => {
        scene.forceRender = true;
    });

    events.on('camera.bound', () => {
        scene.forceRender = true;
    });

    // grid.visible

    const setGridVisible = (visible: boolean) => {
        if (visible !== scene.grid.visible) {
            scene.grid.visible = visible;
            events.fire('grid.visible', visible);
        }
    };

    events.function('grid.visible', () => {
        return scene.grid.visible;
    });

    events.on('grid.setVisible', (visible: boolean) => {
        setGridVisible(visible);
    });

    events.on('grid.toggleVisible', () => {
        setGridVisible(!scene.grid.visible);
    });

    setGridVisible(scene.config.show.grid);

    // camera.fov

    const setCameraFov = (fov: number) => {
        if (fov !== scene.camera.fov) {
            scene.camera.fov = fov;
            events.fire('camera.fov', scene.camera.fov);
        }
    };

    events.function('camera.fov', () => {
        return scene.camera.fov;
    });

    events.on('camera.setFov', (fov: number) => {
        setCameraFov(fov);
    });

    // camera.bound

    let bound = scene.config.show.bound;

    const setBoundVisible = (visible: boolean) => {
        if (visible !== bound) {
            bound = visible;
            events.fire('camera.bound', bound);
        }
    };

    events.function('camera.bound', () => {
        return bound;
    });

    events.on('camera.setBound', (value: boolean) => {
        setBoundVisible(value);
    });

    events.on('camera.toggleBound', () => {
        setBoundVisible(!events.invoke('camera.bound'));
    });

    // camera.focus

    events.on('camera.focus', () => {
        const splat = selectedSplats()[0];
        if (splat) {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;

            const visiblePred = (i: number) => (state[i] & (State.hidden | State.deleted)) === 0;
            const selectionPred = (i: number) => visiblePred(i) && ((state[i] & State.selected) === State.selected);

            if (splatData.calcAabb(aabb, selectionPred)) {
                splatData.calcFocalPoint(vec, selectionPred);
            } else if (splatData.calcAabb(aabb, visiblePred)) {
                splatData.calcFocalPoint(vec, visiblePred);
            } else {
                return;
            }

            const worldTransform = splat.worldTransform;
            worldTransform.transformPoint(vec, vec);
            worldTransform.getScale(vec2);

            scene.camera.focus({
                focalPoint: vec,
                radius: aabb.halfExtents.length() * vec2.x,
                speed: 1
            });
        }
    });

    // handle camera align events
    events.on('camera.align', (axis: string) => {
        switch (axis) {
            case 'px': scene.camera.setAzimElev(90, 0); break;
            case 'py': scene.camera.setAzimElev(0, -90); break;
            case 'pz': scene.camera.setAzimElev(0, 0); break;
            case 'nx': scene.camera.setAzimElev(270, 0); break;
            case 'ny': scene.camera.setAzimElev(0, 90); break;
            case 'nz': scene.camera.setAzimElev(180, 0); break;
        }
    });

    events.on('select.all', () => {
        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;
            processSelection(state, 'set', () => true);
            splat.updateState();
        });
    });

    events.on('select.none', () => {
        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;
            processSelection(state, 'set', () => false);
            splat.updateState();
        });
    });

    events.on('select.invert', () => {
        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;
            processSelection(state, 'set', (i) => !(state[i] & State.selected));
            splat.updateState();
        });
    });

    events.on('select.pred', (op, pred: (i: number) => boolean) => {
        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;
            processSelection(state, op, pred);
            splat.updateState();
        });
    });

    events.on('select.bySphere', (op: string, sphere: number[]) => {
        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');

            splat.worldTransform.getScale(vec);

            const radius2 = (sphere[3] / vec.x) ** 2;
            vec.set(sphere[0], sphere[1], sphere[2]);

            mat.invert(splat.worldTransform);
            mat.transformPoint(vec, vec);

            processSelection(state, op, (i) => {
                vec2.set(x[i], y[i], z[i]);
                return vec2.sub(vec).lengthSq() < radius2;
            });

            splat.updateState();
        });
    });

    events.on('select.byPlane', (op: string, axis: number[], distance: number) => {
        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');

            vec.set(axis[0], axis[1], axis[2]);
            vec2.set(axis[0] * distance, axis[1] * distance, axis[2] * distance);

            // transform the plane to local space
            mat.invert(splat.worldTransform);
            mat.transformVector(vec, vec);
            mat.transformPoint(vec2, vec2);

            const localDistance = vec.dot(vec2);

            processSelection(state, op, (i) => {
                vec2.set(x[i], y[i], z[i]);
                return vec.dot(vec2) - localDistance > 0;
            });

            splat.updateState();
        });
    });

    events.on('select.rect', (op: string, rect: any) => {
        const mode = events.invoke('camera.mode');

        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;

            if (mode === 'centers') {
                const px = splatData.getProp('x');
                const py = splatData.getProp('y');
                const pz = splatData.getProp('z');

                // convert screen rect to camera space
                const camera = scene.camera.entity.camera;

                // calculate final matrix
                mat.mul2(camera.camera._viewProjMat, splat.worldTransform);
                const d = mat.data;
                const m00 = d[0]; const m01 = d[4]; const m02 = d[8]; const m03 = d[12];
                const m10 = d[1]; const m11 = d[5]; const m12 = d[9]; const m13 = d[13];
                const m20 = d[2]; const m21 = d[6]; const m22 = d[10];const m23 = d[14];
                const m30 = d[3]; const m31 = d[7]; const m32 = d[11];const m33 = d[15];

                const sx = rect.start.x * 2 - 1;
                const sy = rect.start.y * 2 - 1;
                const ex = rect.end.x * 2 - 1;
                const ey = rect.end.y * 2 - 1;

                processSelection(state, op, (i) => {
                    const vx = px[i];
                    const vy = py[i];
                    const vz = pz[i];

                    const w = vx * m30 + vy * m31 + vz * m32 + m33;

                    const x = (vx * m00 + vy * m01 + vz * m02 + m03) / w;
                    if (x < sx || x > ex) {
                        return false;
                    }

                    const y = -(vx * m10 + vy * m11 + vz * m12 + m13) / w;
                    if (y < sy || y > ey) {
                        return false;
                    }

                    const z = (vx * m20 + vy * m21 + vz * m22 + m23);

                    return z >= -w && z <= w;
                });
            } else if (mode === 'rings') {
                const { width, height } = scene.targetSize;

                scene.camera.pickPrep(splat);
                const pick = scene.camera.pickRect(
                    Math.floor(rect.start.x * width),
                    Math.floor(rect.start.y * height),
                    Math.floor((rect.end.x - rect.start.x) * width),
                    Math.floor((rect.end.y - rect.start.y) * height)
                );
                const selected = new Set<number>(pick);
                processSelection(state, op, (i) => {
                    return selected.has(i);
                });
            }

            splat.updateState();
        });
    });

    events.on('select.byMask', (op: string, mask: ImageData) => {
        const mode = events.invoke('camera.mode');

        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;

            if (mode === 'centers') {
                const px = splatData.getProp('x');
                const py = splatData.getProp('y');
                const pz = splatData.getProp('z');

                // convert screen rect to camera space
                const camera = scene.camera.entity.camera;

                // calculate final matrix
                mat.mul2(camera.camera._viewProjMat, splat.worldTransform);
                const d = mat.data;
                const m00 = d[0]; const m01 = d[4]; const m02 = d[8]; const m03 = d[12];
                const m10 = d[1]; const m11 = d[5]; const m12 = d[9]; const m13 = d[13];
                const m20 = d[2]; const m21 = d[6]; const m22 = d[10];const m23 = d[14];
                const m30 = d[3]; const m31 = d[7]; const m32 = d[11];const m33 = d[15];

                const width = mask.width;
                const height = mask.height;

                processSelection(state, op, (i) => {
                    const vx = px[i];
                    const vy = py[i];
                    const vz = pz[i];

                    const w = vx * m30 + vy * m31 + vz * m32 + m33;
                    const x = vx * m00 + vy * m01 + vz * m02 + m03;
                    if (x < -w || x > w) {
                        return false;
                    }

                    const y = vx * m10 + vy * m11 + vz * m12 + m13;
                    if (y < -w || y > w) {
                        return false;
                    }

                    const z = vx * m20 + vy * m21 + vz * m22 + m23;
                    if (z < -w || z > w) {
                        return false;
                    }

                    const mx = Math.floor((x / w * 0.5 + 0.5) * width);
                    const my = Math.floor((y / w * -0.5 + 0.5) * height);
                    return mask.data[(my * width + mx) * 4] === 255;
                });
            } else if (mode === 'rings') {
                // calculate mask bound so we limit pixel operations
                let mx0 = mask.width - 1;
                let my0 = mask.height - 1;
                let mx1 = 0;
                let my1 = 0;
                for (let y = 0; y < mask.height; ++y) {
                    for (let x = 0; x < mask.width; ++x) {
                        if (mask.data[(y * mask.width + x) * 4 + 3] === 255) {
                            mx0 = Math.min(mx0, x);
                            my0 = Math.min(my0, y);
                            mx1 = Math.max(mx1, x);
                            my1 = Math.max(my1, y);
                        }
                    }
                }

                const { width, height } = scene.targetSize;
                const px0 = Math.floor(mx0 / mask.width * width);
                const py0 = Math.floor(my0 / mask.height * height);
                const px1 = Math.floor(mx1 / mask.width * width);
                const py1 = Math.floor(my1 / mask.height * height);
                const pw = px1 - px0 + 1;
                const ph = py1 - py0 + 1;

                scene.camera.pickPrep(splat);
                const pick = scene.camera.pickRect(px0, py0, pw, ph);

                const selected = new Set<number>();
                for (let y = 0; y < ph; ++y) {
                    for (let x = 0; x < pw; ++x) {
                        const mx = Math.floor((px0 + x) / width * mask.width);
                        const my = Math.floor((py0 + y) / height * mask.height);
                        if (mask.data[(my * mask.width + mx) * 4] === 255) {
                            selected.add(pick[(ph - y) * pw + x]);
                        }
                    }
                }

                processSelection(state, op, (i) => {
                    return selected.has(i);
                });
            }

            splat.updateState();
        });
    });

    events.on('select.point', (op: string, point: { x: number, y: number }) => {
        const { width, height } = scene.targetSize;
        const mode = events.invoke('camera.mode');

        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;

            if (mode === 'centers') {
                const x = splatData.getProp('x');
                const y = splatData.getProp('y');
                const z = splatData.getProp('z');

                const splatSize = events.invoke('camera.splatSize');
                const camera = scene.camera.entity.camera;
                const sx = point.x * width;
                const sy = point.y * height;

                // calculate final matrix
                mat.mul2(camera.camera._viewProjMat, splat.worldTransform);

                processSelection(state, op, (i) => {
                    vec4.set(x[i], y[i], z[i], 1.0);
                    mat.transformVec4(vec4, vec4);
                    const px = (vec4.x / vec4.w * 0.5 + 0.5) * width;
                    const py = (-vec4.y / vec4.w * 0.5 + 0.5) * height;
                    return Math.abs(px - sx) < splatSize && Math.abs(py - sy) < splatSize;
                });
            } else if (mode === 'rings') {
                scene.camera.pickPrep(splat);

                const pickId = scene.camera.pickRect(
                    Math.floor(point.x * width),
                    Math.floor(point.y * height),
                    1, 1
                )[0];
                processSelection(state, op, (i) => {
                    return i === pickId;
                });
            }

            splat.updateState();
        });
    });

    events.on('select.hide', () => {
        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;

            for (let i = 0; i < state.length; ++i) {
                if (state[i] & State.selected) {
                    state[i] &= ~State.selected;
                    state[i] |= State.hidden;
                }
            }

            splat.updateState();
        });
    });

    events.on('select.unhide', () => {
        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;
            const state = splatData.getProp('state') as Uint8Array;

            for (let i = 0; i < state.length; ++i) {
                state[i] &= ~State.hidden;
            }

            splat.updateState();
        });
    });

    events.on('select.delete', () => {
        selectedSplats().forEach((splat) => {
            editHistory.add(new DeleteSelectionEditOp(splat));
        });
    });

    events.on('scene.reset', () => {
        selectedSplats().forEach((splat) => {
            editHistory.add(new ResetEditOp(splat));
        });
    });

    const setAllData = (value: boolean) => {
        if (value !== scene.assetLoader.loadAllData) {
            scene.assetLoader.loadAllData = value;
            events.fire('allData', scene.assetLoader.loadAllData);
        }
    };

    events.function('allData', () => {
        return scene.assetLoader.loadAllData;
    });

    events.on('toggleAllData', (value: boolean) => {
        setAllData(!events.invoke('allData'));
    });

    // camera mode

    let activeMode = 'centers';

    const setCameraMode = (mode: string) => {
        if (mode !== activeMode) {
            activeMode = mode;
            events.fire('camera.mode', activeMode);
        }
    };

    events.function('camera.mode', () => {
        return activeMode;
    });

    events.on('camera.setMode', (mode: string) => {
        setCameraMode(mode);
    });

    events.on('camera.toggleMode', () => {
        setCameraMode(events.invoke('camera.mode') === 'centers' ? 'rings' : 'centers');
    });

    // camera debug

    let cameraDebug = scene.config.camera.debug;

    const setCameraDebug = (enabled: boolean) => {
        if (enabled !== cameraDebug) {
            cameraDebug = enabled;
            events.fire('camera.debug', cameraDebug);
        }
    };

    events.function('camera.debug', () => {
        return cameraDebug;
    });

    events.on('camera.setDebug', (value: boolean) => {
        setCameraDebug(value);
    });

    events.on('camera.toggleDebug', () => {
        setCameraDebug(!events.invoke('camera.debug'));
    });

    // splat size

    let splatSize = 2;

    const setSplatSize = (value: number) => {
        if (value !== splatSize) {
            splatSize = value;
            events.fire('camera.splatSize', splatSize);
        }
    };

    events.function('camera.splatSize', () => {
        return splatSize;
    });

    events.on('camera.setSplatSize', (value: number) => {
        setSplatSize(value);
    });

    // view spherical harmonic bands

    let viewBands = scene.config.show.shBands;

    const setViewBands = (value: number) => {
        if (value !== viewBands) {
            viewBands = value;
            events.fire('view.bands', viewBands);
        }
    };

    events.function('view.bands', () => {
        return viewBands;
    });

    events.on('view.setBands', (value: number) => {
        setViewBands(value);
    });

    // hack: fire events to initialize UI
    events.fire('camera.fov', scene.camera.fov);
    events.fire('camera.debug', cameraDebug);
    events.fire('view.bands', viewBands);
}

export { registerEditorEvents };
