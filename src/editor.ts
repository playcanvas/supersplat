import { Color, Mat4, Quat, Texture, Vec3 } from 'playcanvas';

import type { CameraFrame } from './camera';
import type { GradeParams } from './color-grade';
import type { CommandContext } from './command-queue';
import { EditHistory } from './edit-history';
import { selectedRanges, SelectOp, RemoveInstancesOp, MultiOp, AddSplatOp, SetLocalFrameOp } from './edit-ops';
import { intersectSelect, PUBLIC_OP, type EditorAPI } from './editor-api';
import { Element, ElementType } from './element';
import { Events } from './events';
import type { GridPlane } from './infinite-grid';
import { Scene } from './scene';
import { runSelectionGesture } from './selection-gesture';
import { Splat } from './splat';

// register for editor and scene events
const registerEditorEvents = (events: Events, editHistory: EditHistory, scene: Scene, api: EditorAPI) => {
    const vec = new Vec3();
    const vec2 = new Vec3();

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

    // When a splat is destroyed, drop the edit operations that reference it: they
    // can never be replayed. Deliberately keyed on destruction rather than on
    // removal from the scene - undoing an AddSplatOp (duplicate / separate) also
    // removes the layer, and pruning there would delete the very op redo needs.
    events.on('scene.elementDestroyed', (element: Element) => {
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
        'view.centerSize', 'view.outlineSelection', 'view.gaussians', 'view.centers', 'view.rings',
        'view.ringSize', 'view.editView',
        'view.selectionColor', 'view.selectionCenters', 'view.selectionRings',
        'view.splatsColorBlend', 'view.splatsSelectionBlend',
        'view.centersColorBlend', 'view.centersSelectionBlend',
        'view.ringsColorBlend', 'view.ringsSelectionBlend',
        'view.bands', 'view.minPixelSize', 'view.stochastic', 'view.perfOverlay', 'view.overdraw', 'camera.bound', 'camera.boundDimensions', 'camera.showPoses',
        'camera.showInfo', 'selection.changed', 'tool.coordSpace', 'colorPanel.pendingChanged'
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

    // grid.planes: the set of planes drawn, in xz, xy, yz order

    const planeOrder: GridPlane[] = ['xz', 'xy', 'yz'];

    const setGridPlanes = (planes: GridPlane[]) => {
        const next = planeOrder.filter(plane => planes.includes(plane));
        if (next.join() !== scene.grid.planes.join()) {
            scene.grid.planes = next;
            events.fire('grid.planes', next.slice());
        }
    };

    events.function('grid.planes', () => {
        return scene.grid.planes.slice();
    });

    events.on('grid.setPlanes', (planes: GridPlane[]) => {
        setGridPlanes(planes);
    });

    events.on('grid.togglePlane', (plane: GridPlane) => {
        const planes = scene.grid.planes;
        setGridPlanes(planes.includes(plane) ? planes.filter(p => p !== plane) : [...planes, plane]);
    });

    // camera.fovDolly

    let fovDolly = false;

    const setFovDolly = (value: boolean) => {
        if (value !== fovDolly) {
            fovDolly = value;
            events.fire('camera.fovDolly', fovDolly);
        }
    };

    events.function('camera.fovDolly', () => {
        return fovDolly;
    });

    events.on('camera.setFovDolly', (value: boolean) => {
        setFovDolly(value);
    });

    // camera.fov

    const setCameraFov = (fov: number) => {
        const { camera } = scene;
        if (fov !== camera.fov) {
            const oldFovFactor = camera.fovFactor;
            camera.fov = fov;

            // by default a fov change acts like a lens zoom: scale distance so
            // the camera's world-space offset from the focal point (distance *
            // sceneRadius / fovFactor) is unchanged. with auto-dolly enabled
            // the camera moves instead, preserving the subject's framing.
            if (!fovDolly) {
                const { controls } = scene.config;
                const k = camera.fovFactor / oldFovFactor;
                const t = camera.distanceTween;
                for (const s of [t.value, t.source, t.target]) {
                    s.distance = Math.max(controls.minZoom, Math.min(controls.maxZoom, s.distance * k));
                }
            }

            events.fire('camera.fov', camera.fov);
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

    // camera.boundDimensions

    let boundDimensions = scene.config.show.boundDimensions;

    const setBoundDimensionsVisible = (visible: boolean) => {
        if (visible !== boundDimensions) {
            boundDimensions = visible;
            events.fire('camera.boundDimensions', boundDimensions);
        }
    };

    events.function('camera.boundDimensions', () => {
        return boundDimensions;
    });

    events.on('camera.setBoundDimensions', (value: boolean) => {
        setBoundDimensionsVisible(value);
    });

    events.on('camera.toggleBoundDimensions', () => {
        setBoundDimensionsVisible(!events.invoke('camera.boundDimensions'));
    });

    // camera.showPoses

    let showPoses = scene.config.show.cameraPoses;

    const setShowPoses = (visible: boolean) => {
        if (visible !== showPoses) {
            showPoses = visible;
            events.fire('camera.showPoses', showPoses);
        }
    };

    events.function('camera.showPoses', () => {
        return showPoses;
    });

    events.on('camera.setShowPoses', (value: boolean) => {
        setShowPoses(value);
    });

    events.on('camera.toggleShowPoses', () => {
        setShowPoses(!events.invoke('camera.showPoses'));
    });

    // camera.showInfo

    let showInfo = scene.config.show.cameraInfo;

    const setShowInfo = (visible: boolean) => {
        if (visible !== showInfo) {
            showInfo = visible;
            events.fire('camera.showInfo', showInfo);
        }
    };

    events.function('camera.showInfo', () => {
        return showInfo;
    });

    events.on('camera.setShowInfo', (value: boolean) => {
        setShowInfo(value);
    });

    events.on('camera.toggleShowInfo', () => {
        setShowInfo(!events.invoke('camera.showInfo'));
    });

    // camera.focus

    events.on('camera.focus', () => {
        events.fire('camera.setControlMode', 'orbit');

        // the active tool's focus target (e.g. orient points) takes precedence
        const toolFocus: { position: Vec3, radius: number } | null = events.invoke('tool.focus');
        if (toolFocus) {
            scene.camera.focus({
                focalPoint: toolFocus.position,
                radius: toolFocus.radius,
                speed: 1
            });
            return;
        }

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

    // pivot.reset

    // reset the selection's local frame back to the model's own frame, or,
    // with toCenter, to the bound center (the selection bound while gaussians
    // are selected). resets orientation in both cases
    events.on('pivot.reset', (toCenter: boolean) => {
        const splat = selectedSplats()[0];
        if (!splat) {
            return;
        }

        const bound = splat.numSelected > 0 ? splat.selectionBound : splat.localBound;
        const newOrigin = toCenter ? bound.center.clone() : new Vec3();
        const newFrame = new Quat();

        if (splat.localFrameOrigin.equals(newOrigin) && splat.localFrame.equals(newFrame)) {
            return;
        }

        events.fire('edit.add', new SetLocalFrameOp({
            splat,
            oldOrigin: splat.localFrameOrigin.clone(),
            oldFrame: splat.localFrame.clone(),
            newOrigin,
            newFrame
        }));
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

    // the UI entry points adapt to the editor API, which owns the commands:
    // same ops, same command-slot discipline. As before, they do nothing
    // without an active visible layer (the API would reject instead)
    const withActive = (command: () => Promise<void>) => {
        if (selectedSplats().length > 0) {
            command();
        }
    };

    events.on('select.all', () => withActive(() => api.selection.all()));

    events.on('select.none', () => withActive(() => api.selection.none()));

    events.on('select.invert', () => withActive(() => api.selection.invert()));

    // fire-and-forget mask application. SelectOp consumes the mask in its
    // constructor, which runs here, synchronously, so a pooled mask can be
    // released as soon as this returns. callers already running in a command
    // slot should use select.applyMask so the op is built and applied in that
    // slot rather than queued behind it
    events.on('select.mask', (op: 'add'|'remove'|'set'|'intersect', mask: Uint8Array | Uint32Array) => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectOp(splat, op, mask));
        });
    });

    // in-slot mask application: builds the SelectOp from the flags as they are
    // in the slot and applies it before resolving. the caller releases the
    // mask after this resolves
    events.function('select.applyMask', async (ctx: CommandContext, op: 'add'|'remove'|'set'|'intersect', mask: Uint8Array | Uint32Array) => {
        for (const splat of selectedSplats()) {
            if (!splat.scene) continue;
            await ctx.apply(new SelectOp(splat, op, mask));
        }
    });

    // the GPU intersect and the resulting SelectOp run inside one command slot
    // so the readback is ordered relative to other queued history ops (rapid
    // drag + undo, drag-while-camera-settling, etc) and the op lands in that
    // slot rather than behind whatever was queued during the readback. the
    // in-slot functions take the slot's context and never enqueue: the gesture
    // that owns the slot (runSelectionGesture) calls them directly. The
    // implementation is the editor API's
    const selectIntersect = (ctx: CommandContext, splat: Splat, op: 'add'|'remove'|'set'|'intersect', options: any, frame?: CameraFrame) => {
        return intersectSelect(scene, ctx, splat, op, options, frame);
    };

    // which machinery a screen-space select gesture runs on: depth on -> the
    // per-pixel id pick (frontmost wins, op-aware peeling); depth off -> the
    // centers intersect at footprint 0, otherwise the footprint pass, which
    // tests each splat's projected ellipse against the region through all depths
    const selectionMethod = () => {
        if (events.invoke('selection.useDepth')) {
            return 'pick';
        }
        return (events.invoke('selection.footprint') as number) > 0 ? 'footprint' : 'centers';
    };

    type SelectRegion = { y0: number, y1: number, intervals: Uint32Array };

    // footprint is passed in rather than read here: the task runs from the
    // queue after the gesture, and toggling the footprint in between must not
    // change an already-finished stroke's semantics
    const footprintSelect = async (ctx: CommandContext, splat: Splat, op: 'add'|'remove'|'set'|'intersect', region: SelectRegion, footprint: number, frame: CameraFrame) => {
        if (!splat.scene) return;
        const data = await scene.projectedSplatRenderer.footprintIntersect(splat, region, footprint, frame);
        if (data) {
            await ctx.apply(new SelectOp(splat, op, data));
        }
    };

    // centers + depth: exactly the surface (rings) pick - the splats visible
    // in the region, rendered at full footprint with the same op filtering so
    // peeling works identically - narrowed to those whose center lies in the
    // region. The centers test reuses the through-mode intersect compute
    const visibleCentersSelect = async (ctx: CommandContext, splat: Splat, op: 'add'|'remove'|'set'|'intersect', visible: Set<number>, options: any, frame: CameraFrame) => {
        if (!splat.scene) return;
        const data = await scene.dataProcessor.intersect(options, splat, frame);
        let selectOp: SelectOp;
        try {
            for (let i = 0; i < splat.instances.count; i++) {
                if (data[i] && !visible.has(i)) {
                    data[i] = 0;
                }
            }
            selectOp = new SelectOp(splat, op, data);
        } finally {
            scene.dataProcessor.releaseMask(data);
        }
        await ctx.apply(selectOp);
    };

    // per-row x-interval tables in render-target pixels for the footprint
    // pass: (rowCount + 1) offsets into the same buffer, then (x0, x1) pairs,
    // so every row's runs are represented exactly

    const packRegion = (py0: number, py1: number, rowRuns: number[][]): SelectRegion => {
        const rows = py1 - py0 + 1;
        const table = rows + 1;
        let total = 0;
        for (const runs of rowRuns) {
            total += runs.length;
        }
        const intervals = new Uint32Array(table + total);
        let cursor = table;
        for (let r = 0; r < rows; r++) {
            intervals[r] = cursor;
            intervals.set(rowRuns[r], cursor);
            cursor += rowRuns[r].length;
        }
        intervals[rows] = cursor;
        return { y0: py0, y1: py1, intervals };
    };

    const emptyRegion = (): SelectRegion => {
        return packRegion(0, 0, [[]]);
    };

    const rectRegion = (frame: CameraFrame, x0: number, y0: number, x1: number, y1: number): SelectRegion => {
        const { width, height } = frame.target;
        const py0 = Math.max(0, Math.floor(y0 * height));
        const py1 = Math.min(height - 1, Math.ceil(y1 * height) - 1);
        const px0 = Math.max(0, Math.floor(x0 * width));
        const px1 = Math.min(width - 1, Math.ceil(x1 * width) - 1);
        if (py1 < py0 || px1 < px0) {
            return emptyRegion();
        }
        const rowRuns: number[][] = [];
        for (let r = py0; r <= py1; r++) {
            rowRuns.push([px0, px1]);
        }
        return packRegion(py0, py1, rowRuns);
    };

    const maskRegion = (frame: CameraFrame, context: CanvasRenderingContext2D, maskWidth: number, maskHeight: number): SelectRegion => {
        const { width, height } = frame.target;
        const mask = context.getImageData(0, 0, maskWidth, maskHeight);
        const xScale = width / maskWidth;

        // covered runs of a mask row, scaled to render-target pixels
        const rowRuns = (maskY: number) => {
            const runs: number[] = [];
            const rowBase = maskY * maskWidth * 4;
            let start = -1;
            for (let x = 0; x <= maskWidth; x++) {
                const covered = x < maskWidth && mask.data[rowBase + x * 4 + 3] === 255;
                if (covered && start === -1) {
                    start = x;
                } else if (!covered && start !== -1) {
                    runs.push(Math.floor(start * xScale), Math.ceil(x * xScale) - 1);
                    start = -1;
                }
            }
            return runs;
        };

        // mask row bounds
        let my0 = maskHeight;
        let my1 = -1;
        for (let y = 0; y < maskHeight; y++) {
            const rowBase = y * maskWidth * 4;
            for (let x = 0; x < maskWidth; x++) {
                if (mask.data[rowBase + x * 4 + 3] === 255) {
                    my0 = Math.min(my0, y);
                    my1 = Math.max(my1, y);
                    break;
                }
            }
        }
        if (my1 < my0) {
            return emptyRegion();
        }

        const py0 = Math.max(0, Math.floor(my0 / maskHeight * height));
        const py1 = Math.min(height - 1, Math.ceil((my1 + 1) / maskHeight * height) - 1);
        const cache = new Map<number, number[]>();
        const rows: number[][] = [];
        for (let r = py0; r <= py1; r++) {
            const maskY = Math.min(maskHeight - 1, Math.floor((r + 0.5) / height * maskHeight));
            let runs = cache.get(maskY);
            if (!runs) {
                runs = rowRuns(maskY);
                cache.set(maskY, runs);
            }
            rows.push(runs);
        }
        return packRegion(py0, py1, rows);
    };

    // world-space volume selection. transform maps the unit sphere (diameter 1)
    // / unit cube (side 1) to world space
    events.on('select.bySphere', (op: 'add'|'remove'|'set'|'intersect', transform: Mat4) => {
        withActive(() => api.selection.byVolume('sphere', transform, PUBLIC_OP[op]));
    });

    events.on('select.byBox', (op: 'add'|'remove'|'set'|'intersect', transform: Mat4) => {
        withActive(() => api.selection.byVolume('box', transform, PUBLIC_OP[op]));
    });

    // the screen-space gestures snapshot their inputs at invocation - the
    // camera frame, target size and footprint the user saw, the target layers
    // and a private copy of the stroke - and run every pick, intersect and op
    // for every target in one command slot (see runSelectionGesture)
    const gestureSnapshot = () => ({
        frame: scene.camera.captureFrame(),
        method: selectionMethod(),
        footprint: events.invoke('selection.footprint') as number,
        splats: selectedSplats()
    });

    events.function('select.rect', (op: 'add'|'remove'|'set'|'intersect', rect: any) => {
        // copy the coordinates: the caller owns rect and may reuse it before
        // the slot runs
        const { x: x1, y: y1 } = rect.start;
        const { x: x2, y: y2 } = rect.end;
        const region = { x1, y1, x2, y2 };

        return runSelectionGesture(scene.commandQueue, {
            snapshot: gestureSnapshot,
            run: async ({ frame, method, footprint, splats }, ctx) => {
                for (const splat of splats) {
                    if (!splat.scene) continue;
                    if (method === 'centers') {
                        await selectIntersect(ctx, splat, op, { rect: region }, frame);
                    } else if (method === 'footprint') {
                        await footprintSelect(ctx, splat, op, rectRegion(frame, x1, y1, x2, y2), footprint, frame);
                    } else {
                        const { ids } = await scene.camera.pickIds(ctx, frame, splat, op, footprint, x1, y1, x2 - x1, y2 - y1);

                        if (footprint === 0) {
                            await visibleCentersSelect(ctx, splat, op, new Set(ids), { rect: region }, frame);
                        } else {
                            await ctx.apply(new SelectOp(splat, op, new Uint32Array(new Set(ids)).sort()));
                        }
                    }
                }
            }
        });
    });

    // build an operation-private mask texture from the stroke canvas: the gpu
    // upload from setSource is deferred until the queued intersect dispatches,
    // so the pixels are copied into a fresh canvas nothing else repaints, and
    // the texture is not shared with any other gesture. Callers destroy it
    // once their queued tasks have consumed it.
    const createMaskTexture = (canvas: HTMLCanvasElement) => {
        const snapshot = document.createElement('canvas');
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        snapshot.getContext('2d').drawImage(canvas, 0, 0);
        const texture = new Texture(scene.graphicsDevice);
        texture.setSource(snapshot);
        return texture;
    };

    events.function('select.byMask', (op: 'add'|'remove'|'set'|'intersect', canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => {
        return runSelectionGesture(scene.commandQueue, {
            // the canvas reads are part of the snapshot so later gestures
            // repainting it can't leak into this selection (or make splats
            // within one gesture see different masks). the texture is
            // allocated last: nothing after it can throw and leak it
            snapshot: () => {
                const inputs = gestureSnapshot();
                const { frame, method } = inputs;
                return {
                    ...inputs,
                    region: method === 'footprint' ? maskRegion(frame, context, canvas.width, canvas.height) : null,
                    maskPixels: method === 'pick' ? context.getImageData(0, 0, canvas.width, canvas.height) : null,
                    maskTexture: method === 'footprint' ? null : createMaskTexture(canvas)
                };
            },
            run: async ({ frame, method, footprint, splats, region, maskPixels, maskTexture }, ctx) => {
                for (const splat of splats) {
                    if (!splat.scene) continue;
                    if (method === 'centers') {
                        await selectIntersect(ctx, splat, op, {
                            mask: maskTexture
                        }, frame);
                    } else if (method === 'footprint') {
                        await footprintSelect(ctx, splat, op, region, footprint, frame);
                    } else {
                        const mask = maskPixels;

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

                        // map each pixel actually read back into the mask through
                        // the readback's own rectangle and target size: the read
                        // is rounded outward to whole pixels, and the render target
                        // may have been resized while this gesture waited for its slot
                        const pick = await scene.camera.pickIds(ctx, frame, splat, op, footprint, nx0, ny0, nw, nh);
                        const { ids, width: pw, height: ph } = pick;

                        const selected = new Set<number>();
                        for (let y = 0; y < ph; ++y) {
                            const my = Math.floor((pick.y + y + 0.5) / pick.targetHeight * mask.height);
                            for (let x = 0; x < pw; ++x) {
                                const mx = Math.floor((pick.x + x + 0.5) / pick.targetWidth * mask.width);
                                if (mask.data[(my * mask.width + mx) * 4] === 255) {
                                    selected.add(ids[y * pw + x]);
                                }
                            }
                        }

                        if (footprint === 0) {
                            await visibleCentersSelect(ctx, splat, op, selected, { mask: maskTexture }, frame);
                        } else {
                            await ctx.apply(new SelectOp(splat, op, new Uint32Array(selected).sort()));
                        }
                    }
                }
            },
            release: ({ maskTexture }) => maskTexture?.destroy()
        });
    });

    // points are stroke samples in normalized screen coordinates with radii in
    // css pixels. Each sample is depth-picked to a world position and the world
    // radius matched to the on-screen brush size, giving a capsule path the
    // compute pass tests splat centers against.
    events.function('select.bySphereBrush', (
        op: 'add'|'remove'|'set'|'intersect',
        points: { x: number, y: number, radius: number }[],
        canvas: HTMLCanvasElement
    ) => {
        return runSelectionGesture(scene.commandQueue, {
            // the shared stroke canvas may be repainted by another tool before
            // the queued work runs, so the mask is a private copy
            snapshot: () => ({ ...gestureSnapshot(), mask: createMaskTexture(canvas) }),
            // the depth picking and the intersect run against the same scene
            // state through the in-slot pickDepths and selectIntersect: the
            // public intersectMany would enqueue behind this task and deadlock
            run: async ({ frame, footprint, splats, mask }, ctx) => {
                const hits = await scene.camera.pickDepths(ctx, frame, points, splats);
                const path: number[] = [];
                let previous: { position: Vec3, radius: number } | null = null;

                for (let i = 0; i < points.length; ++i) {
                    const hit = hits[i];
                    if (!hit) {
                        previous = null;
                        continue;
                    }

                    const radius = points[i].radius * frame.pixelScale * (frame.ortho ? 1 : hit.depth);
                    const startsPath = !previous || previous.position.distance(hit.position) > Math.max(previous.radius, radius) * 2;
                    path.push(hit.position.x, hit.position.y, hit.position.z, startsPath ? -radius : radius);
                    previous = { position: hit.position, radius };
                }

                const pathPoints = new Float32Array(path);
                for (const splat of splats) {
                    await selectIntersect(ctx, splat, op, {
                        sphereBrush: { points: pathPoints, mask, footprint }
                    }, frame);
                }
            },
            release: ({ mask }) => mask.destroy()
        });
    });

    events.function('select.point', (op: 'add'|'remove'|'set'|'intersect', point: { x: number, y: number }) => {
        return runSelectionGesture(scene.commandQueue, {
            snapshot: gestureSnapshot,
            run: async ({ frame, method, footprint, splats }, ctx) => {
                const { width, height } = frame.target;
                for (const splat of splats) {
                    if (!splat.scene) continue;
                    if (method === 'centers') {
                        await selectIntersect(ctx, splat, op, {
                            rect: {
                                x1: point.x,
                                y1: point.y,
                                x2: point.x + 1 / width,
                                y2: point.y + 1 / height
                            }
                        }, frame);
                    } else if (method === 'footprint') {
                        await footprintSelect(ctx, splat, op, rectRegion(
                            frame, point.x, point.y, point.x + 1 / width, point.y + 1 / height), footprint, frame);
                    } else {
                        // depth-mode clicks deliberately ignore the footprint toggle
                        // and pick the frontmost splat under the cursor: requiring a
                        // visible center at the clicked pixel (as rect/mask gestures do
                        // in centers mode) would make clicking practically never land.
                        // Use normalized coordinates with minimal size for single pixel pick
                        const { ids } = await scene.camera.pickIds(ctx, frame, splat, op, footprint,
                            point.x, point.y, 1 / width, 1 / height);
                        await ctx.apply(new SelectOp(splat, op, new Uint32Array([ids[0]])));
                    }
                }
            }
        });
    });

    // Eyedropper selection with SelectOp so undo/redo and selection state updates remain consistent.
    // Threshold acts as a per-channel absolute difference: 0 only matches identical colors while 1 matches everything.
    // TO DO:
    // -  alternative distance metrics such as HSV.
    // -  alternative UI for threshold, two handles for min/max?
    events.function('select.colorMatch', (op: 'add'|'remove'|'set'|'intersect', point: { x: number, y: number }, threshold = 0) => {
        if (!point) {
            return;
        }

        // Clamp normalized coordinates to valid range
        const nx = Math.max(0, Math.min(1, point.x));
        const ny = Math.max(0, Math.min(1, point.y));
        const colorThreshold = Math.min(1, Math.max(0, Number.isFinite(threshold) ? threshold : 0));

        return runSelectionGesture(scene.commandQueue, {
            snapshot: gestureSnapshot,
            run: async ({ frame, footprint, splats }, ctx) => {
                const { width, height } = frame.target;
                if (!width || !height) {
                    return;
                }

                for (const splat of splats) {
                    if (!splat.scene) continue;
                    // Use normalized coordinates with minimal size for single pixel pick
                    const { ids } = await scene.camera.pickIds(ctx, frame, splat, 'set', footprint, nx, ny, 1 / width, 1 / height);
                    const pickId = ids[0];
                    if (pickId === undefined || pickId === 0xffffffff) {
                        continue;
                    }

                    if (pickId < 0 || pickId >= splat.instances.count) {
                        continue;
                    }
                    // the view-dependent colour is evaluated from the gesture's camera
                    const mask = await scene.dataProcessor.colorMatch(splat, pickId, colorThreshold, {
                        entityMatrix: splat.entity.getWorldTransform(),
                        cameraPos: frame.position
                    });
                    let selectOp: SelectOp;
                    try {
                        selectOp = new SelectOp(splat, op, mask);
                    } finally {
                        scene.dataProcessor.releaseMask(mask);
                    }
                    await ctx.apply(selectOp);
                }
            }
        });
    });

    events.on('select.hide', () => withActive(() => api.selection.hide()));

    events.on('select.unhide', () => {
        api.selection.unhide();
    });

    events.on('select.delete', () => {
        // Don't delete gaussians when a point-placing tool is active (backspace deletes its points instead)
        if (['measure', 'orient'].includes(events.invoke('tool.active'))) {
            return;
        }
        // Don't delete gaussians while a polygon selection is in progress (backspace removes the last point instead)
        if (events.invoke('polygonSelection.removeLastPoint')) {
            return;
        }
        withActive(() => api.selection.delete());
    });

    // Duplicate and separate both create a new layer holding the selected
    // gaussians. The new layer *shares* the source layer's static data, so this
    // copies the instance list only: no gaussians are duplicated, and there is no
    // PLY round trip to lose SH precision, drop extra columns or reorder out of
    // Morton. The asset is reference counted, so it outlives either layer.
    const performSelectionFunc = (func: 'duplicate' | 'separate') => {
        const splat = selectedSplats()[0];
        if (!splat) {
            return;
        }

        // the selection is read in the slot, after any pending gesture's op
        return scene.commandQueue.enqueue(async (ctx) => {
            if (!splat.scene) return;

            const ranges = selectedRanges(splat);
            if (ranges.count === 0) {
                return;
            }

            const copy = splat.createLayer(ranges, splat.name);

            if (func === 'separate') {
                await ctx.apply(new MultiOp([
                    new RemoveInstancesOp(splat),
                    new AddSplatOp(scene, copy)
                ]));
            } else {
                await ctx.apply(new AddSplatOp(scene, copy));
            }
        });
    };

    // duplicate the current selection
    events.on('edit.duplicate', () => {
        performSelectionFunc('duplicate');
    });

    events.on('edit.separate', () => {
        performSelectionFunc('separate');
    });

    // bake the panel's pending grade into the selected gaussians. `params` are the
    // seven authored values; the op composes them onto whatever grade the targets
    // already carry, so applying twice is the same as applying the composition.
    events.on('edit.applyColor', (params: GradeParams) => withActive(() => api.color.apply(params)));

    // clear the grade on the selected gaussians
    events.on('edit.resetColor', () => withActive(() => api.color.reset()));

    events.on('scene.reset', () => withActive(() => api.selection.restoreDeleted()));

    // display

    let showGaussians = true;
    let showCenters = false;
    let showRings = false;
    let ringSize = 4;

    events.function('view.gaussians', () => showGaussians);
    events.function('view.centers', () => showCenters);
    events.function('view.rings', () => showRings);
    events.function('view.ringSize', () => ringSize);

    events.on('view.setGaussians', (value: boolean) => {
        if (value !== showGaussians) {
            showGaussians = value;
            events.fire('view.gaussians', value);
        }
    });

    events.on('view.setCenters', (value: boolean) => {
        if (value !== showCenters) {
            showCenters = value;
            events.fire('view.centers', value);
        }
    });

    events.on('view.setRings', (value: boolean) => {
        if (value !== showRings) {
            showRings = value;
            events.fire('view.rings', value);
        }
    });

    events.on('view.setRingSize', (value: number) => {
        if (value !== ringSize) {
            ringSize = value;
            events.fire('view.ringSize', value);
        }
    });

    // per-surface colour blend weights. colorBlend mixes the base colour from
    // the gaussian's own colour (0) toward the flat unselected colour (1);
    // selectionBlend mixes a selected splat from that base toward the
    // selection colour
    const blends: [name: string, value: number][] = [
        ['splatsColorBlend', 0],
        ['splatsSelectionBlend', 1],
        ['centersColorBlend', 1],
        ['centersSelectionBlend', 1],
        ['ringsColorBlend', 0],
        ['ringsSelectionBlend', 1]
    ];
    blends.forEach(([name, initial]) => {
        let value = initial;
        const setEvent = `view.set${name[0].toUpperCase()}${name.slice(1)}`;
        events.function(`view.${name}`, () => value);
        events.on(setEvent, (next: number) => {
            if (next !== value) {
                value = next;
                events.fire(`view.${name}`, next);
            }
        });
    });

    // selection controls: depth on = the per-pixel id pick (frontmost wins),
    // depth off = through all layers; footprint scales how much of each splat's
    // projected ellipse counts, from its center point (0) to the full footprint (1)

    let selectionUseDepth = false;
    let selectionFootprint = 0;

    events.function('selection.useDepth', () => selectionUseDepth);

    events.on('selection.setUseDepth', (value: boolean) => {
        if (value !== selectionUseDepth) {
            selectionUseDepth = value;
            events.fire('selection.useDepth', value);
        }
    });

    events.on('selection.toggleUseDepth', () => {
        events.fire('selection.setUseDepth', !selectionUseDepth);
    });

    events.function('selection.footprint', () => selectionFootprint);

    events.on('selection.setFootprint', (value: number) => {
        if (value !== selectionFootprint) {
            selectionFootprint = value;
            events.fire('selection.footprint', value);
        }
    });

    events.on('selection.toggleFootprint', () => {
        events.fire('selection.setFootprint', selectionFootprint > 0 ? 0 : 1);
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

    // center size

    let centerSize = 2;

    const setCenterSize = (value: number) => {
        if (value !== centerSize) {
            centerSize = value;
            events.fire('view.centerSize', centerSize);
        }
    };

    events.function('view.centerSize', () => {
        return centerSize;
    });

    events.on('view.setCenterSize', (value: number) => {
        setCenterSize(value);
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

    // selection display

    let selectionColor = false;
    let selectionCenters = true;
    let selectionRings = false;

    events.function('view.selectionColor', () => selectionColor);
    events.function('view.selectionCenters', () => selectionCenters);
    events.function('view.selectionRings', () => selectionRings);

    events.on('view.setSelectionColor', (value: boolean) => {
        if (value !== selectionColor) {
            selectionColor = value;
            events.fire('view.selectionColor', value);
        }
    });

    events.on('view.setSelectionCenters', (value: boolean) => {
        if (value !== selectionCenters) {
            selectionCenters = value;
            events.fire('view.selectionCenters', value);
        }
    });

    events.on('view.setSelectionRings', (value: boolean) => {
        if (value !== selectionRings) {
            selectionRings = value;
            events.fire('view.selectionRings', value);
        }
    });

    // per-footprint-mode view profiles: each footprint mode (centers/rings)
    // remembers its own overlay arrangement. The live view flags are the
    // active mode's profile; this holds the other mode's, applied when the
    // footprint toggle crosses the centers/rings boundary. Encoded as 0/1 in
    // [gaussians, centers, rings, selectionCenters, selectionRings] order
    const profileFlags: [get: string, set: string][] = [
        ['view.gaussians', 'view.setGaussians'],
        ['view.centers', 'view.setCenters'],
        ['view.rings', 'view.setRings'],
        ['view.selectionCenters', 'view.setSelectionCenters'],
        ['view.selectionRings', 'view.setSelectionRings']
    ];
    let inactiveProfile = [1, 0, 1, 0, 1];
    let profileMode = (events.invoke('selection.footprint') as number) > 0;

    // preference application sets the footprint, the live flags and the
    // inactive profile explicitly, so the boundary-crossing swap below must
    // stay out of its way or it shuffles the slots it is being loaded into
    let prefsSuspendDepth = 0;
    events.on('preferences.suspend', () => {
        prefsSuspendDepth++;
    });
    events.on('preferences.resume', () => {
        prefsSuspendDepth = Math.max(0, prefsSuspendDepth - 1);
    });

    events.function('view.inactiveProfile', () => inactiveProfile.slice());

    events.on('view.setInactiveProfile', (profile: number[]) => {
        inactiveProfile = profile.slice();
    });

    // the swap is a mode change, not an appearance edit: it must not switch
    // the edit view back on (see below)
    let swappingProfile = false;

    events.on('selection.footprint', (value: number) => {
        const mode = value > 0;
        if (mode !== profileMode) {
            profileMode = mode;
            if (prefsSuspendDepth > 0) {
                return;
            }
            const snapshot = profileFlags.map(([get]) => (events.invoke(get) ? 1 : 0));
            swappingProfile = true;
            profileFlags.forEach(([, set], i) => {
                events.fire(set, !!inactiveProfile[i]);
            });
            swappingProfile = false;
            inactiveProfile = snapshot;
            events.fire('view.inactiveProfile', inactiveProfile.slice());
        }
    });

    // edit view switch (tab): while off, the non-selection overlays hide
    // and gaussians render regardless of the profile, so it toggles between
    // the editing view and the raw scene. Off by default and stored as a
    // preference. Toggling one of the display overlays below switches it
    // back on so the toggle is never adjusted blind - but not preference
    // application or the footprint profile swap, which are not the user
    // toggling a display overlay
    let editView = false;

    const setEditView = (value: boolean) => {
        if (value !== editView) {
            editView = value;
            events.fire('view.editView', value);
        }
    };

    events.function('view.editView', () => editView);

    events.on('view.setEditView', setEditView);

    events.on('view.toggleEditView', () => {
        setEditView(!editView);
    });

    ['view.gaussians', 'view.centers', 'view.rings'].forEach((eventName) => {
        events.on(eventName, () => {
            if (prefsSuspendDepth === 0 && !swappingProfile) {
                setEditView(true);
            }
        });
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

    // minimum projected splat size in pixels (0 disables the cull)

    let minPixelSize = 2;

    events.function('view.minPixelSize', () => {
        return minPixelSize;
    });

    events.on('view.setMinPixelSize', (value: number) => {
        if (value !== minPixelSize) {
            minPixelSize = value;
            events.fire('view.minPixelSize', minPixelSize);
        }
    });

    // stochastic-transparency splat renderer (1 spp, no sort).
    // 'disabled' never uses it, 'enabled' always does, 'movement' uses it only
    // while the scene is changing - trading the sort for speed exactly when the
    // eye is least able to see the sampling noise - and 'auto' behaves like
    // 'movement' while the last sorted frame proved slow (see
    // Scene.autoEngageMs).

    let stochastic = 'auto';

    events.function('view.stochastic', () => {
        return stochastic;
    });

    events.on('view.setStochastic', (value: string) => {
        if (value !== stochastic) {
            stochastic = value;
            events.fire('view.stochastic', value);
        }
    });

    // gpu/cpu frame timing overlay

    let perfOverlay = false;

    events.function('view.perfOverlay', () => {
        return perfOverlay;
    });

    events.on('view.setPerfOverlay', (value: boolean) => {
        if (value !== perfOverlay) {
            perfOverlay = value;
            events.fire('view.perfOverlay', value);
        }
    });

    // overdraw heat map. Session-only: it replaces the scene with a fill count,
    // so unlike the frame timings it is never stored as a preference

    let overdraw = false;

    events.function('view.overdraw', () => {
        return overdraw;
    });

    events.on('view.setOverdraw', (value: boolean) => {
        if (value !== overdraw) {
            overdraw = value;
            events.fire('view.overdraw', value);
        }
    });

    events.function('camera.getPose', () => {
        const camera = scene.camera;
        const position = camera.position;
        const focalPoint = camera.focalPoint;
        return {
            position: { x: position.x, y: position.y, z: position.z },
            target: { x: focalPoint.x, y: focalPoint.y, z: focalPoint.z },
            fov: camera.fov
        };
    });

    events.on('camera.setPose', (pose: { position: Vec3, target: Vec3, fov?: number }, speed = 1) => {
        // assign fov before setPose so distance is computed using the new fovFactor
        if (pose.fov !== undefined) {
            // pose-driven fov (timeline playback, fly-to-pose) is not a user
            // preference - suspend capture around the notify and the
            // synchronous ui echo it triggers
            events.fire('preferences.suspend');
            try {
                scene.camera.fov = pose.fov;
                events.fire('camera.fov', pose.fov);
            } finally {
                events.fire('preferences.resume');
            }
        }
        scene.camera.setPose(pose.position, pose.target, speed);
    });

    // hack: fire events to initialize UI
    events.fire('camera.fov', scene.camera.fov);
    events.fire('view.bands', viewBands);
    events.fire('camera.showInfo', showInfo);
    // needed because view.setStochastic only notifies on a change, so a stored
    // preference equal to the initial value leaves the ui showing its own default
    events.fire('view.stochastic', stochastic);

    // doc serialization
    events.function('docSerialize.view', () => {
        const packC = (c: Color) => [c.r, c.g, c.b, c.a];
        return {
            bgColor: packC(events.invoke('bgClr')),
            selectedColor: packC(events.invoke('selectedClr')),
            unselectedColor: packC(events.invoke('unselectedClr')),
            lockedColor: packC(events.invoke('lockedClr')),
            shBands: events.invoke('view.bands'),
            centersSize: events.invoke('view.centerSize'),
            outlineSelection: events.invoke('view.outlineSelection'),
            showGrid: events.invoke('grid.visible'),
            gridPlanes: events.invoke('grid.planes'),
            showBound: events.invoke('camera.bound'),
            showBoundDimensions: events.invoke('camera.boundDimensions'),
            showCameraPoses: events.invoke('camera.showPoses'),
            showCameraInfo: events.invoke('camera.showInfo'),
            flySpeed: events.invoke('camera.flySpeed'),
            fovDolly: events.invoke('camera.fovDolly')
        };
    });

    events.function('docDeserialize.view', (docView: any) => {
        events.fire('setBgClr', new Color(docView.bgColor));
        events.fire('setSelectedClr', new Color(docView.selectedColor));
        events.fire('setUnselectedClr', new Color(docView.unselectedColor));
        events.fire('setLockedClr', new Color(docView.lockedColor));
        events.fire('view.setBands', docView.shBands);
        events.fire('view.setCenterSize', docView.centersSize);
        events.fire('view.setOutlineSelection', docView.outlineSelection);
        events.fire('grid.setVisible', docView.showGrid);
        // documents before the per-plane toggles stored a single gridPlane
        events.fire('grid.setPlanes', docView.gridPlanes ?? [docView.gridPlane ?? 'xz']);
        events.fire('camera.setBound', docView.showBound);
        events.fire('camera.setBoundDimensions', docView.showBoundDimensions ?? false);
        events.fire('camera.setShowPoses', docView.showCameraPoses ?? false);
        events.fire('camera.setShowInfo', docView.showCameraInfo ?? false);
        events.fire('camera.setFlySpeed', docView.flySpeed);
        events.fire('camera.setFovDolly', docView.fovDolly ?? false);
    });
};

export { registerEditorEvents };
