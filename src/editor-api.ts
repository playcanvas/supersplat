import { BoundingBox, EventHandler, Mat4, Quat, Vec3 } from 'playcanvas';

import type { CameraFrame } from './camera';
import { createGradeTerms, gradeTerms } from './color-grade';
import type { GradeParams } from './color-grade';
import type { CommandContext, CommandQueue } from './command-queue';
import type { IntersectOptions } from './data-processor/intersect';
import type { EditHistory } from './edit-history';
import type { EditOp } from './edit-ops';
import {
    AddSplatOp,
    EntityTransformOp,
    HideSelectionOp,
    MultiOp,
    RemoveInstancesOp,
    RestoreMissingInstancesOp,
    SelectAllOp,
    SelectInvertOp,
    SelectNoneOp,
    SelectOp,
    SplatRenameOp,
    SplatsColorOp,
    SplatsTransformOp,
    UnhideAllOp,
    selectedRanges
} from './edit-ops';
import type { CommandOptions, EditScope } from './editor-command';
import { checkCancelled, EditorError } from './editor-command';
import { createEditorSession } from './editor-session';
import type { Element } from './element';
import { ElementType } from './element';
import type { Events } from './events';
import type { Scene } from './scene';
import { rectangleOp } from './selection-rectangle';
import type { Splat } from './splat';
import { isFinalColorMode, propModeFor, PROP_MODE, SH_NUM_COEFFS } from './splat-properties';
import { State } from './splat-state';
import { Transform } from './transform';

type LayerId = number;
type SelectionOp = 'replace' | 'add' | 'subtract' | 'intersect';
type InternalOp = 'set' | 'add' | 'remove' | 'intersect';
const INTERNAL_OP: Record<SelectionOp, InternalOp> = {
    replace: 'set',
    add: 'add',
    subtract: 'remove',
    intersect: 'intersect'
};
const PUBLIC_OP: Record<InternalOp, SelectionOp> = {
    set: 'replace',
    add: 'add',
    remove: 'subtract',
    intersect: 'intersect'
};

type LayerInfo = {
    id: LayerId;
    name: string;
    visible: boolean;
    total: number;
    selected: number;
    hidden: number;
    deleted: number;
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
    bounds: BoundingBox | null;
    selectionBounds: BoundingBox | null;
    shBands: number;
};
type ScreenPoint = { x: number; y: number };
type ScreenRect = { start: ScreenPoint; end: ScreenPoint };
type DepthHit = { layer: LayerId; position: Vec3; distance: number; depth: number };
type ChangeEvent = 'documentChanged' | 'selectionChanged' | 'historyChanged';
type ChangeDetail = { layer?: LayerId };
type SelectionOptions = CommandOptions & {
    preview?: boolean;
    outside?: boolean;
    footprint?: number;
    viewToken?: string;
};
type RectangleOptions = CommandOptions & { layer?: LayerId; depth?: boolean; footprint?: number; viewToken?: string };
type TransformOptions = { translate?: Vec3; rotate?: Quat; scale?: number; center?: Vec3 };

// in-slot GPU intersect followed by the SelectOp it produces, in the same
// slot. Shared with the screen-space gestures in editor.ts
const intersectSelect = async (
    scene: Scene,
    ctx: CommandContext,
    splat: Splat,
    op: InternalOp,
    options: IntersectOptions,
    frame?: CameraFrame
) => {
    // the splat may have been deleted while the task was queued
    if (!splat.scene) return;
    const data = await scene.dataProcessor.intersect(options, splat, frame);
    // SelectOp consumes `data` synchronously in its constructor
    // (IndexRanges.fromPredicate iterates immediately), so the buffer goes
    // back to the pool as soon as the op is constructed
    let selectOp: SelectOp;
    try {
        selectOp = new SelectOp(splat, op, data);
    } finally {
        scene.dataProcessor.releaseMask(data);
    }
    await ctx.apply(selectOp);
};

const SELECTION_OPS = new Set(['selectOp', 'selectAll', 'selectNone', 'selectInvert']);

const isSelectionOp = (op: EditOp): boolean => {
    if (op instanceof MultiOp) {
        return op.ops.every(isSelectionOp);
    }
    return SELECTION_OPS.has(op.name);
};

// Commands own their queue slot, including the result snapshot. The UI and
// WebMCP both use these methods; no caller should enqueue an API command inside
// another queue task. Layer IDs identify layers for this editor session only.
// Commands are async so that invalid input, missing layers and cancellation
// reject the returned promise rather than throwing at the call site; the slot
// is still reserved synchronously, before the first await.
const createEditorAPI = (events: Events, scene: Scene, editHistory: EditHistory, commandQueue: CommandQueue) => {
    const allSplats = () => scene.getElementsByType(ElementType.splat) as Splat[];
    const historyInfo = () => ({ canUndo: editHistory.canUndo(), canRedo: editHistory.canRedo() });
    const layerById = (id: LayerId): Splat => {
        const splat = allSplats().find((s) => s.uid === id);
        if (!splat) throw new EditorError('layer_not_found', `No layer with id ${id}. Read the scene again.`);
        return splat;
    };
    const target = (id?: LayerId) => {
        const splat = id === undefined ? (events.invoke('selection') as Splat) : layerById(id);
        if (!splat) throw new EditorError('no_active_layer', 'No active layer. Specify a layer ID.');
        return splat;
    };
    const checkTarget = (splat: Splat, visible = true) => {
        if (splat.scene !== scene)
            throw new EditorError('layer_removed', 'The target layer was removed before the command completed.');
        if (visible && !splat.visible) throw new EditorError('layer_hidden', `Layer '${splat.name}' is hidden.`);
    };
    const layerInfo = (splat: Splat): LayerInfo => {
        const selectionBounds = splat.instances.numSelected ? new BoundingBox() : null;
        selectionBounds?.setFromTransformedAabb(splat.selectionBound, splat.worldTransform);
        return {
            id: splat.uid,
            name: splat.name,
            visible: splat.visible,
            total: splat.instances.count,
            selected: splat.instances.numSelected,
            hidden: splat.instances.numLocked,
            deleted: splat.instances.numRemoved,
            position: splat.entity.getLocalPosition().clone(),
            rotation: splat.entity.getLocalRotation().clone(),
            scale: splat.entity.getLocalScale().clone(),
            bounds: splat.instances.count ? splat.worldBound.clone() : null,
            selectionBounds,
            shBands: splat.resource.shBands
        };
    };
    const result = (splats: Splat[], affected: number) => ({
        affected,
        layers: splats.map(layerInfo),
        history: historyInfo()
    });
    const run = <T>(
        splat: Splat,
        fn: (ctx: CommandContext) => T | Promise<T>,
        options?: CommandOptions,
        visible = true
    ) => {
        checkCancelled(options);
        return commandQueue.enqueue((ctx) => {
            checkCancelled(options);
            checkTarget(splat, visible);
            return fn(ctx);
        });
    };
    const applyState = async (
        layer: LayerId | undefined,
        make: (splat: Splat) => SelectAllOp | SelectNoneOp | SelectInvertOp | HideSelectionOp | RemoveInstancesOp,
        options?: CommandOptions,
        requireSelection = false
    ) => {
        const splat = target(layer);
        return await run(
            splat,
            async (ctx) => {
                if (requireSelection && !splat.instances.numSelected)
                    throw new EditorError('empty_selection', 'No splats are selected.');
                const op = make(splat);
                const affected = op.ranges.count;
                if (affected) await ctx.apply(op);
                return result([splat], affected);
            },
            options
        );
    };
    const scopeCount = (splat: Splat, scope?: EditScope) => {
        const count =
            scope === 'layer' ? splat.instances.count - splat.instances.numLocked : splat.instances.numSelected;
        if (scope === 'selection' && !count)
            throw new EditorError('empty_selection', 'No splats are selected. Use scope layer to edit the layer.');
        return scope === undefined && !count ? splat.instances.count - splat.instances.numLocked : count;
    };
    const session = createEditorSession(events, scene, commandQueue, { allSplats, layerById, layerInfo, historyInfo });
    const propertyMode = (splat: Splat, property: string) => {
        const mode = propModeFor(property);
        const rest = /^f_rest_(\d+)$/.exec(property);
        if (mode === undefined || (rest && Number(rest[1]) >= SH_NUM_COEFFS[splat.resource.shBands] * 3)) {
            throw new EditorError('unsupported_property', `Property '${property}' is not available on this layer.`);
        }
        return mode;
    };
    const propertyOptions = (splat: Splat, frame: CameraFrame) => ({
        entityMatrix: splat.worldTransform.clone(),
        viewMatrix: frame.view,
        viewProjection: new Mat4().mul2(frame.projection, frame.view),
        cameraPos: frame.position
    });
    const applyMask = async (
        ctx: CommandContext,
        splat: Splat,
        mask: Uint8Array,
        op: SelectionOp,
        options: SelectionOptions
    ) => {
        try {
            checkCancelled(options);
            checkTarget(splat);
            let matched = 0;
            for (let i = 0; i < splat.instances.count; i++) {
                const hit = (mask[i] === 255) !== !!options.outside;
                mask[i] = hit && (splat.instances.flags[i] & State.locked) === 0 ? 255 : 0;
                if (mask[i]) matched++;
            }
            const edit = new SelectOp(splat, INTERNAL_OP[op], mask);
            const bounds = options.preview && matched ? await scene.dataProcessor.calcMaskBound(splat, mask) : null;
            checkCancelled(options);
            checkTarget(splat);
            if (options.viewToken) session.checkView(options.viewToken);
            if (!options.preview && edit.ranges.count) await ctx.apply(edit);
            return {
                ...result([splat], options.preview ? 0 : edit.ranges.count),
                preview: !!options.preview,
                matched,
                bounds
            };
        } finally {
            scene.dataProcessor.releaseMask(mask);
        }
    };
    const copySelection = async (separate: boolean, layer?: LayerId, options?: CommandOptions) => {
        const splat = target(layer);
        return await run(
            splat,
            async (ctx) => {
                const ranges = selectedRanges(splat);
                if (!ranges.count) throw new EditorError('empty_selection', 'No splats are selected.');
                const copy = splat.createLayer(ranges, splat.name);
                await ctx.apply(
                    separate
                        ? new MultiOp([new RemoveInstancesOp(splat), new AddSplatOp(scene, copy)])
                        : new AddSplatOp(scene, copy)
                );
                return { ...result([splat, copy], ranges.count), createdLayer: copy.uid };
            },
            options
        );
    };
    const colorEdit = async (
        params: GradeParams | null,
        layer?: LayerId,
        scope?: EditScope,
        options?: CommandOptions
    ) => {
        const splat = target(layer);
        if (params && !(params.whitePoint > params.blackPoint))
            throw new EditorError('invalid_input', 'whitePoint must be greater than blackPoint.');
        const grade = params && gradeTerms(params, createGradeTerms());
        return await run(
            splat,
            async (ctx) => {
                const affected = scopeCount(splat, scope);
                if (affected) await ctx.apply(new SplatsColorOp({ splat, grade, scope }));
                return result([splat], affected);
            },
            options
        );
    };

    // change notifications, derived from the bus events the modules already
    // fire. Hide/unhide and visibility are classed as document changes until
    // the session/document classification pass decides otherwise
    const changes = new EventHandler();
    const changed = (event: ChangeEvent, detail: ChangeDetail = {}) => changes.fire(event, detail);

    events.on('selection.changed', (splat: Splat | null) => changed('selectionChanged', { layer: splat?.uid }));
    events.on('splat.stateChanged', (splat: Splat) => changed('selectionChanged', { layer: splat.uid }));
    events.on('edit.apply', (op: EditOp) => {
        if (!isSelectionOp(op)) changed('documentChanged', { layer: (op as EditOp & { splat?: Splat }).splat?.uid });
    });
    events.on('scene.elementAdded', (element: Element) => {
        if (element.type === ElementType.splat) changed('documentChanged', { layer: element.uid });
    });
    events.on('scene.elementRemoved', (element: Element) => {
        if (element.type === ElementType.splat) changed('documentChanged', { layer: element.uid });
    });
    events.on('splat.visibility', (splat: Splat) => changed('documentChanged', { layer: splat.uid }));
    // fired once per history mutation (alongside edit.canRedo)
    events.on('edit.canUndo', () => changed('historyChanged'));

    return {
        inspect: {
            scene: (options?: CommandOptions) =>
                commandQueue.enqueue(() => {
                    checkCancelled(options);
                    return {
                        ...session.read(),
                        layers: allSplats().map(layerInfo),
                        activeLayer: (events.invoke('selection') as Splat | null)?.uid ?? null,
                        history: historyInfo()
                    };
                }),
            layer: async (id: LayerId, options?: CommandOptions) =>
                await run(layerById(id), () => layerInfo(layerById(id)), options, false),
            histogram: async (id: LayerId, property: string, options?: CommandOptions) => {
                const splat = layerById(id);
                const frame = scene.camera.captureFrame();
                const viewToken = session.viewport.info().viewToken;
                return await run(
                    splat,
                    async () => {
                        const mode = propertyMode(splat, property);
                        const viewDependent = mode === 4 || isFinalColorMode(mode);
                        const data = await scene.dataProcessor.calcHistogram(
                            splat,
                            mode,
                            propertyOptions(splat, frame)
                        );
                        checkCancelled(options);
                        if (viewDependent) session.checkView(viewToken);
                        return { layer: id, property, ...data, viewDependent, ...(viewDependent ? { viewToken } : {}) };
                    },
                    options
                );
            },
            properties: (shBands = 0) => [
                ...Object.keys(PROP_MODE),
                ...Array.from({ length: SH_NUM_COEFFS[shBands] * 3 }, (_, i) => `f_rest_${i}`)
            ]
        },
        layers: {
            list: () => allSplats().map(layerInfo),
            active: () => (events.invoke('selection') as Splat | null)?.uid ?? null,
            setActive: (id: LayerId | null) => events.fire('selection', id === null ? null : layerById(id)),
            setVisible: (id: LayerId, visible: boolean) => {
                layerById(id).visible = visible;
            },
            rename: async (id: LayerId, name: string, options?: CommandOptions) => {
                const splat = layerById(id);
                return await run(
                    splat,
                    async (ctx) => {
                        const changed = name !== splat.name;
                        if (changed) await ctx.apply(new SplatRenameOp(splat, name));
                        return result([splat], changed ? 1 : 0);
                    },
                    options,
                    false
                );
            },
            update: async (
                id: LayerId,
                changes: { name?: string; visible?: boolean; active?: boolean },
                options?: CommandOptions
            ) => {
                const splat = layerById(id);
                const values = { ...changes };
                return await run(
                    splat,
                    async (ctx) => {
                        if (values.active && !(values.visible ?? splat.visible))
                            throw new EditorError('layer_hidden', 'Show the layer before activating it.');
                        let affected = 0;
                        if (values.name !== undefined && values.name !== splat.name) {
                            await ctx.apply(new SplatRenameOp(splat, values.name));
                            affected++;
                        }
                        if (values.visible !== undefined && values.visible !== splat.visible) {
                            splat.visible = values.visible;
                            affected++;
                        }
                        const active = events.invoke('selection');
                        if (values.active === true && active !== splat) {
                            events.fire('selection', splat);
                            affected++;
                        }
                        if (values.active === false && active === splat) {
                            events.fire('selection', null);
                            affected++;
                        }
                        return result([splat], affected);
                    },
                    options,
                    false
                );
            }
        },
        selection: {
            all: (layer?: LayerId, options?: CommandOptions) => applyState(layer, (s) => new SelectAllOp(s), options),
            none: (layer?: LayerId, options?: CommandOptions) => applyState(layer, (s) => new SelectNoneOp(s), options),
            invert: (layer?: LayerId, options?: CommandOptions) =>
                applyState(layer, (s) => new SelectInvertOp(s), options),
            byVolume: async (
                shape: 'sphere' | 'box',
                transform: Mat4,
                op: SelectionOp = 'replace',
                layer?: LayerId,
                options: SelectionOptions = {}
            ) => {
                const splat = target(layer);
                const shapeTransform = transform.clone();
                const settings = { ...options };
                const footprint = settings.footprint ?? (events.invoke('selection.footprint') as number);
                return await run(
                    splat,
                    async (ctx) => {
                        const volume = { transform: shapeTransform, footprint };
                        const mask = await scene.dataProcessor.intersect(
                            shape === 'sphere' ? { sphere: volume } : { box: volume },
                            splat
                        );
                        return applyMask(ctx, splat, mask, op, settings);
                    },
                    settings
                );
            },
            byProperty: async (
                id: LayerId,
                property: string,
                min: number,
                max: number,
                op: SelectionOp = 'replace',
                options: SelectionOptions = {}
            ) => {
                const splat = layerById(id);
                const frame = scene.camera.captureFrame();
                const settings = { ...options };
                if (!Number.isFinite(min) || !Number.isFinite(max) || min > max)
                    throw new EditorError('invalid_input', 'The property range must have finite min <= max.');
                if (settings.viewToken) session.checkView(settings.viewToken);
                return await run(
                    splat,
                    async (ctx) => {
                        const mode = propertyMode(splat, property);
                        const mask = await scene.dataProcessor.selectByRange(splat, mode, {
                            ...propertyOptions(splat, frame),
                            min,
                            max,
                            numBins: 0,
                            rangeStart: 0,
                            rangeEnd: 0
                        });
                        return applyMask(ctx, splat, mask, op, settings);
                    },
                    settings
                );
            },
            hide: (layer?: LayerId, options?: CommandOptions) =>
                applyState(layer, (s) => new HideSelectionOp(s), options, true),
            unhide: (options?: CommandOptions) =>
                commandQueue.enqueue(async (ctx) => {
                    checkCancelled(options);
                    const splats = allSplats();
                    const ops = splats.map((s) => new UnhideAllOp(s)).filter((op) => !op.ranges.empty);
                    if (ops.length) await ctx.apply(ops.length === 1 ? ops[0] : new MultiOp(ops));
                    return result(
                        splats,
                        ops.reduce((n, op) => n + op.ranges.count, 0)
                    );
                }),
            delete: (layer?: LayerId, options?: CommandOptions) =>
                applyState(layer, (s) => new RemoveInstancesOp(s), options, true),
            restoreDeleted: async (layer?: LayerId, options?: CommandOptions) => {
                const splat = target(layer);
                return await run(
                    splat,
                    async (ctx) => {
                        const before = splat.instances.count;
                        if (splat.instances.numRemoved) await ctx.apply(new RestoreMissingInstancesOp(splat));
                        return result([splat], splat.instances.count - before);
                    },
                    options
                );
            },
            restore: async (id: LayerId, what: 'hidden' | 'deleted' | 'both', options?: CommandOptions) => {
                const splat = layerById(id);
                return await run(
                    splat,
                    async (ctx) => {
                        const before = splat.instances.count;
                        const hidden = what !== 'deleted' ? splat.instances.numLocked : 0;
                        const ops: EditOp[] = [];
                        if (hidden) ops.push(new UnhideAllOp(splat));
                        if (what !== 'hidden' && splat.instances.numRemoved)
                            ops.push(new RestoreMissingInstancesOp(splat));
                        if (ops.length) await ctx.apply(ops.length === 1 ? ops[0] : new MultiOp(ops));
                        return result([splat], hidden + splat.instances.count - before);
                    },
                    options
                );
            },
            duplicate: (layer?: LayerId, options?: CommandOptions) => copySelection(false, layer, options),
            separate: (layer?: LayerId, options?: CommandOptions) => copySelection(true, layer, options)
        },
        color: {
            apply: (params: GradeParams, layer?: LayerId, scope?: EditScope, options?: CommandOptions) =>
                colorEdit(params, layer, scope, options),
            reset: (layer?: LayerId, scope?: EditScope, options?: CommandOptions) =>
                colorEdit(null, layer, scope, options)
        },
        transform: async (id: LayerId, scope: EditScope, delta: TransformOptions, options?: CommandOptions) => {
            const splat = layerById(id);
            const translation = delta.translate?.clone() ?? new Vec3();
            const rotation = delta.rotate?.clone() ?? new Quat();
            const factor = delta.scale ?? 1;
            const center = delta.center?.clone();
            if (!Number.isFinite(factor) || factor <= 0)
                throw new EditorError('invalid_input', 'Scale must be positive.');
            return await run(
                splat,
                async (ctx) => {
                    const affected = scope === 'layer' ? splat.instances.count : scopeCount(splat, scope);
                    if (!affected || (translation.lengthSq() === 0 && rotation.equals(Quat.IDENTITY) && factor === 1))
                        return result([splat], 0);
                    const origin =
                        center ??
                        (scope === 'selection'
                            ? splat.worldTransform.transformPoint(splat.selectionBound.center, new Vec3())
                            : splat.worldBound.center.clone());
                    const position = rotation
                        .transformVector(origin.clone().mulScalar(-factor))
                        .add(origin)
                        .add(translation);
                    const matrix = new Mat4().setTRS(position, rotation, new Vec3(factor, factor, factor));
                    if (scope === 'layer') {
                        const oldt = new Transform(
                            splat.entity.getLocalPosition(),
                            splat.entity.getLocalRotation(),
                            splat.entity.getLocalScale()
                        );
                        const world = new Mat4().mul2(matrix, splat.worldTransform);
                        const parent = splat.entity.parent;
                        if (parent) world.mul2(new Mat4().invert(parent.getWorldTransform()), world);
                        const newt = new Transform(
                            world.getTranslation(),
                            new Quat().setFromMat4(world),
                            world.getScale()
                        );
                        await ctx.apply(new EntityTransformOp({ splat, oldt, newt }));
                    } else {
                        const local = new Mat4()
                            .mul2(new Mat4().invert(splat.worldTransform), matrix)
                            .mul(splat.worldTransform);
                        const paletteMap = new Map<number, number>();
                        selectedRanges(splat).forEach((i) => {
                            const index = splat.instances.transformIndex(i);
                            if (!paletteMap.has(index))
                                paletteMap.set(index, splat.transformPalette.size + paletteMap.size);
                        });
                        await ctx.apply(new SplatsTransformOp({ splat, transform: local, paletteMap }));
                    }
                    return result([splat], affected);
                },
                options
            );
        },
        history: {
            undo: (options?: CommandOptions) => editHistory.undo(options),
            redo: (options?: CommandOptions) => editHistory.redo(false, options),
            canUndo: () => editHistory.canUndo(),
            canRedo: () => editHistory.canRedo()
        },
        viewport: {
            ...session.viewport,
            captureFrame: () => scene.camera.captureFrame(),
            pickDepth: async (
                points: ScreenPoint[],
                layers?: LayerId[],
                options: CommandOptions & { viewToken?: string } = {}
            ) => {
                const frame = scene.camera.captureFrame();
                const capturedPoints = points.map((p) => ({ ...p }));
                const splats = layers?.map(layerById) ?? allSplats().filter((s) => s.visible);
                if (options.viewToken) session.checkView(options.viewToken);
                return await commandQueue.enqueue(async (ctx) => {
                    checkCancelled(options);
                    for (const splat of splats) checkTarget(splat);
                    if (options.viewToken) session.checkView(options.viewToken);
                    const hits = await scene.camera.pickDepths(ctx, frame, capturedPoints, splats);
                    checkCancelled(options);
                    if (options.viewToken) session.checkView(options.viewToken);
                    return hits.map((hit) =>
                        hit
                            ? ({
                                  layer: hit.splat.uid,
                                  position: hit.position,
                                  distance: hit.distance,
                                  depth: hit.depth
                              } as DepthHit)
                            : null
                    );
                });
            },
            selectRect: async (rect: ScreenRect, op: SelectionOp = 'replace', options: RectangleOptions = {}) => {
                const splat = target(options.layer);
                const frame = scene.camera.captureFrame();
                const captured = { start: { ...rect.start }, end: { ...rect.end } };
                const settings = { ...options };
                const depth = settings.depth ?? (events.invoke('selection.useDepth') as boolean);
                const footprint = settings.footprint ?? (events.invoke('selection.footprint') as number);
                if (settings.viewToken) session.checkView(settings.viewToken);
                return await run(
                    splat,
                    async (ctx) => {
                        if (settings.viewToken) session.checkView(settings.viewToken);
                        const edit = await rectangleOp(
                            scene,
                            ctx,
                            splat,
                            frame,
                            captured,
                            INTERNAL_OP[op],
                            depth,
                            footprint
                        );
                        checkCancelled(settings);
                        checkTarget(splat);
                        if (settings.viewToken) session.checkView(settings.viewToken);
                        if (edit.ranges.count) await ctx.apply(edit);
                        return result([splat], edit.ranges.count);
                    },
                    settings
                );
            }
        },
        files: session.files,
        on: (event: ChangeEvent, fn: (detail: ChangeDetail) => void) => {
            const handle = changes.on(event, fn);
            return () => handle.off();
        }
    };
};

type EditorAPI = ReturnType<typeof createEditorAPI>;
export { createEditorAPI, intersectSelect, PUBLIC_OP };
export type {
    EditorAPI,
    LayerId,
    LayerInfo,
    SelectionOp,
    ScreenPoint,
    ScreenRect,
    DepthHit,
    ChangeEvent,
    ChangeDetail,
    SelectionOptions,
    RectangleOptions
};
