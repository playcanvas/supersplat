import { MemoryFileSystem } from '@playcanvas/splat-transform';
import { Color, Mat4, path, Texture, Vec3, Vec4 } from 'playcanvas';

import { EditHistory } from './edit-history';
import { SelectAllOp, SelectNoneOp, SelectInvertOp, SelectOp, HideSelectionOp, UnhideAllOp, DeleteSelectionOp, ResetOp, MultiOp, AddSplatOp } from './edit-ops';
import { Element, ElementType } from './element';
import { Events } from './events';
import { MappedReadFileSystem } from './io';
import { Scene } from './scene';
import { Splat } from './splat';
import { serializePly } from './splat-serialize';

const removeExtension = (filename: string) => {
    return filename.substring(0, filename.length - path.getExtension(filename).length);
};

// register for editor and scene events
const registerEditorEvents = (events: Events, editHistory: EditHistory, scene: Scene) => {
    const vec = new Vec3();
    const vec2 = new Vec3();
    const vec4 = new Vec4();
    const mat = new Mat4();
    const SH_C0 = 0.28209479177387814;

    const decodeColorChannel = (value: number) => {
        return Math.min(1, Math.max(0, 0.5 + value * SH_C0));
    };

    // get the list of selected splats (currently limited to just a single one)
    const selectedSplats = () => {
        const selected = events.invoke('selection') as Splat;
        return selected?.visible ? [selected] : [];
    };

    let lastExportCursor = 0;

    // add unsaved changes warning message.
    window.addEventListener('beforeunload', (e) => {
        if (!events.invoke('scene.dirty')) {
            // if the undo cursor matches last export, then we have no unsaved changes
            return undefined;
        }

        const msg = 'You have unsaved changes. Are you sure you want to leave?';
        e.returnValue = msg;
        return msg;
    });

    events.function('targetSize', () => {
        return scene.targetSize;
    });

    events.on('scene.clear', () => {
        scene.clear();
        editHistory.clear();
        lastExportCursor = 0;
    });

    // When a splat is removed from the scene, remove all edit operations that reference it
    events.on('scene.elementRemoved', (element: Element) => {
        if (element.type === ElementType.splat) {
            editHistory.removeForSplat(element as Splat);
        }
    });

    events.function('scene.dirty', () => {
        return editHistory.cursor !== lastExportCursor;
    });

    events.on('doc.saved', () => {
        lastExportCursor = editHistory.cursor;
    });

    // force render on some events

    [
        'camera.mode', 'camera.overlay', 'camera.splatSize', 'view.outlineSelection',
        'view.centersUseGaussianColor', 'view.bands', 'camera.bound', 'selection.changed',
        'tool.coordSpace'
    ].forEach((eventName) => {
        events.on(eventName, () => {
            scene.forceRender = true;
        });
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

    // camera.tonemapping

    events.function('camera.tonemapping', () => {
        return scene.camera.tonemapping;
    });

    events.on('camera.setTonemapping', (value: string) => {
        scene.camera.tonemapping = value;
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
            // use current bounds (caller should have awaited the operation that changed data)
            const bound = splat.numSelected > 0 ?
                splat.selectionBound :
                splat.localBound;
            vec.copy(bound.center);

            const worldTransform = splat.worldTransform;
            worldTransform.transformPoint(vec, vec);
            worldTransform.getScale(vec2);

            scene.camera.focus({
                focalPoint: vec,
                radius: bound.halfExtents.length() * vec2.x,
                speed: 1
            });
        }
    });

    events.on('camera.reset', () => {
        const { initialAzim, initialElev, initialZoom } = scene.config.controls;
        const x = Math.sin(initialAzim * Math.PI / 180) * Math.cos(initialElev * Math.PI / 180);
        const y = -Math.sin(initialElev * Math.PI / 180);
        const z = Math.cos(initialAzim * Math.PI / 180) * Math.cos(initialElev * Math.PI / 180);
        const zoom = initialZoom;

        scene.camera.setPose(new Vec3(x * zoom, y * zoom, z * zoom), new Vec3(0, 0, 0));
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

        // switch to ortho mode
        scene.camera.ortho = true;
    });

    // returns true if the selected splat has selected gaussians
    events.function('selection.splats', () => {
        const splat = events.invoke('selection') as Splat;
        return splat?.numSelected > 0;
    });

    events.on('select.all', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectAllOp(splat));
        });
    });

    events.on('select.none', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectNoneOp(splat));
        });
    });

    events.on('select.invert', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectInvertOp(splat));
        });
    });

    events.on('select.pred', (op, pred: (i: number) => boolean) => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectOp(splat, op, pred));
        });
    });

    const intersectCenters = async (splat: Splat, op: 'add'|'remove'|'set', options: any) => {
        const data = await scene.dataProcessor.intersect(options, splat);
        const filter = (i: number) => data[i] === 255;
        events.fire('edit.add', new SelectOp(splat, op, filter));
    };

    events.on('select.bySphere', async (op: 'add'|'remove'|'set', sphere: number[]) => {
        for (const splat of selectedSplats()) {
            await intersectCenters(splat, op, {
                sphere: { x: sphere[0], y: sphere[1], z: sphere[2], radius: sphere[3] }
            });
        }
    });

    events.on('select.byBox', async (op: 'add'|'remove'|'set', box: number[]) => {
        for (const splat of selectedSplats()) {
            await intersectCenters(splat, op, {
                box: { x: box[0], y: box[1], z: box[2], lenx: box[3], leny: box[4], lenz: box[5] }
            });
        }
    });

    events.function('select.rect', async (op: 'add'|'remove'|'set', rect: any) => {
        const mode = events.invoke('camera.mode');

        for (const splat of selectedSplats()) {
            if (mode === 'centers') {
                await intersectCenters(splat, op, {
                    rect: { x1: rect.start.x, y1: rect.start.y, x2: rect.end.x, y2: rect.end.y }
                });
            } else if (mode === 'rings') {
                scene.camera.pickPrep(splat, op);
                const pick = await scene.camera.pickRect(
                    rect.start.x,
                    rect.start.y,
                    rect.end.x - rect.start.x,
                    rect.end.y - rect.start.y
                );

                const selected = new Set<number>(pick);
                const filter = (i: number) => {
                    return selected.has(i);
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            }
        }
    });

    let maskTexture: Texture = null;

    events.function('select.byMask', async (op: 'add'|'remove'|'set', canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => {
        const mode = events.invoke('camera.mode');

        for (const splat of selectedSplats()) {
            if (mode === 'centers') {
                // create mask texture
                if (!maskTexture || maskTexture.width !== canvas.width || maskTexture.height !== canvas.height) {
                    if (maskTexture) {
                        maskTexture.destroy();
                    }
                    maskTexture = new Texture(scene.graphicsDevice);
                }
                maskTexture.setSource(canvas);

                await intersectCenters(splat, op, {
                    mask: maskTexture
                });
            } else if (mode === 'rings') {
                const mask = context.getImageData(0, 0, canvas.width, canvas.height);

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

                // Convert mask bounds to normalized coordinates
                const nx0 = mx0 / mask.width;
                const ny0 = my0 / mask.height;
                const nx1 = (mx1 + 1) / mask.width;
                const ny1 = (my1 + 1) / mask.height;
                const nw = nx1 - nx0;
                const nh = ny1 - ny0;

                scene.camera.pickPrep(splat, op);
                const pick = await scene.camera.pickRect(nx0, ny0, nw, nh);

                // Calculate actual pixel dimensions for iteration
                const { width, height } = scene.targetSize;
                const pw = Math.max(1, Math.floor(nw * width));
                const ph = Math.max(1, Math.floor(nh * height));

                const selected = new Set<number>();
                for (let y = 0; y < ph; ++y) {
                    for (let x = 0; x < pw; ++x) {
                        const mx = Math.floor((nx0 + x / width) * mask.width);
                        const my = Math.floor((ny0 + y / height) * mask.height);
                        if (mask.data[(my * mask.width + mx) * 4] === 255) {
                            selected.add(pick[(ph - y) * pw + x]);
                        }
                    }
                }

                const filter = (i: number) => {
                    return selected.has(i);
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            }
        }
    });

    events.function('select.point', async (op: 'add'|'remove'|'set', point: { x: number, y: number }) => {
        const { width, height } = scene.targetSize;
        const mode = events.invoke('camera.mode');

        for (const splat of selectedSplats()) {
            const splatData = splat.splatData;

            if (mode === 'centers') {
                const x = splatData.getProp('x');
                const y = splatData.getProp('y');
                const z = splatData.getProp('z');

                const splatSize = events.invoke('camera.splatSize');
                const camera = scene.camera.camera;
                const sx = point.x * width;
                const sy = point.y * height;

                // calculate final matrix
                mat.mul2(camera.camera._viewProjMat, splat.worldTransform);

                const filter = (i: number) => {
                    vec4.set(x[i], y[i], z[i], 1.0);
                    mat.transformVec4(vec4, vec4);
                    const px = (vec4.x / vec4.w * 0.5 + 0.5) * width;
                    const py = (-vec4.y / vec4.w * 0.5 + 0.5) * height;
                    return Math.abs(px - sx) < splatSize && Math.abs(py - sy) < splatSize;
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            } else if (mode === 'rings') {
                scene.camera.pickPrep(splat, op);

                // Use normalized coordinates with minimal size for single pixel pick
                const pickResult = await scene.camera.pickRect(
                    point.x,
                    point.y,
                    1 / width,
                    1 / height
                );
                const pickId = pickResult[0];

                const filter = (i: number) => {
                    return i === pickId;
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            }
        }
    });

    // Eyedropper selection with SelectOp so undo/redo and selection state updates remain consistent.
    // Threshold acts as a per-channel absolute difference: 0 only matches identical colors while 1 matches everything.
    // TO DO:
    // -  alternative distance metrics such as HSV.
    // -  alternative UI for threshold, two handles for min/max?
    events.function('select.colorMatch', async (op: 'add'|'remove'|'set', point: { x: number, y: number }, threshold = 0) => {
        const splats = selectedSplats();
        const targetSize = scene.targetSize;
        if (!splats.length || !targetSize || !point) {
            return;
        }

        const { width, height } = targetSize;
        if (!width || !height) {
            return;
        }

        // Clamp normalized coordinates to valid range
        const nx = Math.max(0, Math.min(1, point.x));
        const ny = Math.max(0, Math.min(1, point.y));
        const colorThreshold = Math.min(1, Math.max(0, Number.isFinite(threshold) ? threshold : 0));

        for (const splat of splats) {
            scene.camera.pickPrep(splat, 'set');
            // Use normalized coordinates with minimal size for single pixel pick
            const pickBuffer = await scene.camera.pickRect(nx, ny, 1 / width, 1 / height);
            const pickId = pickBuffer?.[0];
            if (pickId === undefined || pickId === 0xffffffff) {
                continue;
            }

            const reds = splat.splatData.getProp('f_dc_0') as Float32Array;
            const greens = splat.splatData.getProp('f_dc_1') as Float32Array;
            const blues = splat.splatData.getProp('f_dc_2') as Float32Array;
            // validate pickId and color channels exist
            if (!reds || !greens || !blues || pickId < 0 || pickId >= reds.length) {
                continue;
            }
            // decode color channels for the reference pixel
            const reference = [
                decodeColorChannel(reds[pickId]),
                decodeColorChannel(greens[pickId]),
                decodeColorChannel(blues[pickId])
            ];
            // Check if a value is within the color threshold of the reference
            const withinThreshold = (value: number, ref: number) => Math.abs(value - ref) <= colorThreshold;

            // filter to select pixels within the color threshold
            const filter = (i: number) => {
                return withinThreshold(decodeColorChannel(reds[i]), reference[0]) &&
                    withinThreshold(decodeColorChannel(greens[i]), reference[1]) &&
                    withinThreshold(decodeColorChannel(blues[i]), reference[2]);
            };

            events.fire('edit.add', new SelectOp(splat, op, filter));
        }
    });

    events.on('select.hide', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new HideSelectionOp(splat));
        });
    });

    events.on('select.unhide', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new UnhideAllOp(splat));
        });
    });

    events.on('select.delete', () => {
        // Don't delete gaussians when measure tool is active (backspace deletes measure points instead)
        if (events.invoke('tool.active') === 'measure') {
            return;
        }
        selectedSplats().forEach((splat) => {
            editHistory.add(new DeleteSelectionOp(splat));
        });
    });

    const performSelectionFunc = async (func: 'duplicate' | 'separate') => {
        const splats = selectedSplats();

        const memFs = new MemoryFileSystem();

        await serializePly(splats, {
            maxSHBands: 3,
            selected: true
        }, memFs);

        const data = memFs.results.get('output.ply');

        if (data) {
            const splat = splats[0];

            // wrap PLY in a blob and load it
            const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
            const filename = `${removeExtension(splat.filename)}.ply`;
            const fileSystem = new MappedReadFileSystem();
            fileSystem.addFile(filename, blob);
            const copy = await scene.assetLoader.load(filename, fileSystem);

            if (func === 'separate') {
                editHistory.add(new MultiOp([
                    new DeleteSelectionOp(splat),
                    new AddSplatOp(scene, copy)
                ]));
            } else {
                editHistory.add(new AddSplatOp(scene, copy));
            }
        }
    };

    // duplicate the current selection
    events.on('select.duplicate', async () => {
        await performSelectionFunc('duplicate');
    });

    events.on('select.separate', async () => {
        await performSelectionFunc('separate');
    });

    events.on('scene.reset', () => {
        selectedSplats().forEach((splat) => {
            editHistory.add(new ResetOp(splat));
        });
    });

    // camera mode (visual: centers/rings)

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

    // camera control mode (orbit/fly)

    let controlMode: 'orbit' | 'fly' = 'orbit';

    const setControlMode = (mode: 'orbit' | 'fly') => {
        if (mode !== controlMode) {
            controlMode = mode;
            scene.camera.controlMode = mode;
            events.fire('camera.controlMode', controlMode);
        }
    };

    events.function('camera.controlMode', () => {
        return controlMode;
    });

    events.on('camera.setControlMode', (mode: 'orbit' | 'fly') => {
        setControlMode(mode);
    });

    events.on('camera.toggleControlMode', () => {
        setControlMode(controlMode === 'orbit' ? 'fly' : 'orbit');
    });

    // camera overlay

    let cameraOverlay = scene.config.camera.overlay;

    const setCameraOverlay = (enabled: boolean) => {
        if (enabled !== cameraOverlay) {
            cameraOverlay = enabled;
            events.fire('camera.overlay', cameraOverlay);
        }
    };

    events.function('camera.overlay', () => {
        return cameraOverlay;
    });

    events.on('camera.setOverlay', (value: boolean) => {
        setCameraOverlay(value);
    });

    events.on('camera.toggleOverlay', () => {
        setCameraOverlay(!events.invoke('camera.overlay'));
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

    // camera fly speed

    const setFlySpeed = (value: number) => {
        if (value !== scene.camera.flySpeed) {
            scene.camera.flySpeed = value;
            events.fire('camera.flySpeed', value);
        }
    };

    events.function('camera.flySpeed', () => {
        return scene.camera.flySpeed;
    });

    events.on('camera.setFlySpeed', (value: number) => {
        setFlySpeed(value);
    });

    // outline selection

    let outlineSelection = false;

    const setOutlineSelection = (value: boolean) => {
        if (value !== outlineSelection) {
            outlineSelection = value;
            events.fire('view.outlineSelection', outlineSelection);
        }
    };

    events.function('view.outlineSelection', () => {
        return outlineSelection;
    });

    events.on('view.setOutlineSelection', (value: boolean) => {
        setOutlineSelection(value);
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

    // centers gaussian color toggle
    let centersUseGaussianColor = false;
    events.function('view.centersUseGaussianColor', () => centersUseGaussianColor);
    events.on('view.setCentersUseGaussianColor', (value: boolean) => {
        centersUseGaussianColor = value;
        events.fire('view.centersUseGaussianColor', value);
    });

    events.function('camera.getPose', () => {
        const camera = scene.camera;
        const position = camera.position;
        const focalPoint = camera.focalPoint;
        return {
            position: { x: position.x, y: position.y, z: position.z },
            target: { x: focalPoint.x, y: focalPoint.y, z: focalPoint.z }
        };
    });

    events.on('camera.setPose', (pose: { position: Vec3, target: Vec3 }, speed = 1) => {
        scene.camera.setPose(pose.position, pose.target, speed);
    });

    // hack: fire events to initialize UI
    events.fire('camera.fov', scene.camera.fov);
    events.fire('camera.overlay', cameraOverlay);
    events.fire('view.bands', viewBands);

    // doc serialization
    events.function('docSerialize.view', () => {
        const packC = (c: Color) => [c.r, c.g, c.b, c.a];
        return {
            bgColor: packC(events.invoke('bgClr')),
            selectedColor: packC(events.invoke('selectedClr')),
            unselectedColor: packC(events.invoke('unselectedClr')),
            lockedColor: packC(events.invoke('lockedClr')),
            shBands: events.invoke('view.bands'),
            centersSize: events.invoke('camera.splatSize'),
            outlineSelection: events.invoke('view.outlineSelection'),
            showGrid: events.invoke('grid.visible'),
            showBound: events.invoke('camera.bound'),
            flySpeed: events.invoke('camera.flySpeed')
        };
    });

    events.function('docDeserialize.view', (docView: any) => {
        events.fire('setBgClr', new Color(docView.bgColor));
        events.fire('setSelectedClr', new Color(docView.selectedColor));
        events.fire('setUnselectedClr', new Color(docView.unselectedColor));
        events.fire('setLockedClr', new Color(docView.lockedColor));
        events.fire('view.setBands', docView.shBands);
        events.fire('camera.setSplatSize', docView.centersSize);
        events.fire('view.setOutlineSelection', docView.outlineSelection);
        events.fire('grid.setVisible', docView.showGrid);
        events.fire('camera.setBound', docView.showBound);
        events.fire('camera.setFlySpeed', docView.flySpeed);
    });
};

export { registerEditorEvents };
