import { EventHandler, Mat4, Quat, Vec3 } from 'playcanvas';

import type { CameraFrame } from './camera';
import { createGradeTerms, gradeTerms, type GradeParams } from './color-grade';
import type { CommandContext, CommandQueue } from './command-queue';
import { EditHistory } from './edit-history';
import { EditOp, HideSelectionOp, MultiOp, RemoveInstancesOp, RestoreMissingInstancesOp, SelectAllOp, SelectInvertOp, SelectNoneOp, SelectOp, SplatRenameOp, SplatsColorOp, UnhideAllOp } from './edit-ops';
import { Element, ElementType } from './element';
import { Events } from './events';
import { Scene } from './scene';
import { Splat } from './splat';

// The typed editor API: one awaitable surface for the UI and for scripts
// (window.editor). Commands take a command-queue slot, apply their edit op in
// that slot and resolve once the op and its history bookkeeping have settled;
// they reject on failure and leave the queue usable. State is read through
// the queries after awaiting. Screen-space operations live under `viewport`,
// which is the explicit dependency on a camera and GPU; everything else is
// document and session logic that needs neither.
//
// Interim contracts, replaced when stable identity lands (editor-api-plan.md,
// phase 3): layer ids are Element.uid, stable for the session but not saved;
// no per-instance identity is exposed, so selection is set operations,
// volumes and viewport queries.

type LayerId = number;

// replace/add/subtract/intersect rather than the internal set/add/remove/
// intersect: 'remove' reads as delete to agents
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
};

type ScreenPoint = { x: number, y: number };
type ScreenRect = { start: ScreenPoint, end: ScreenPoint };

// a depth-pick hit: world position, along-view distance and linear depth
type DepthHit = { layer: LayerId, position: Vec3, distance: number, depth: number };

// selectionChanged: the active layer or the selection flags (session state,
// undoable but not a document mutation). documentChanged: layers added,
// removed, renamed or shown/hidden, instances or colours edited.
// historyChanged: canUndo/canRedo.
type ChangeEvent = 'documentChanged' | 'selectionChanged' | 'historyChanged';
type ChangeDetail = { layer?: LayerId };

interface EditorAPI {
    layers: {
        list(): LayerInfo[];
        active(): LayerId | null;
        setActive(id: LayerId | null): void;
        setVisible(id: LayerId, visible: boolean): void;
        rename(id: LayerId, name: string): Promise<void>;
    };
    // all commands target one layer, the active one by default. A hidden
    // layer or a missing id rejects; a layer removed before the command runs
    // makes it a no-op
    selection: {
        all(layer?: LayerId): Promise<void>;
        none(layer?: LayerId): Promise<void>;
        invert(layer?: LayerId): Promise<void>;
        // transform maps the unit sphere (diameter 1) / unit cube (side 1) to
        // world space; tested against splat centers, or their footprint when
        // the selection footprint setting is on
        byVolume(shape: 'sphere' | 'box', transform: Mat4, op?: SelectionOp, layer?: LayerId): Promise<void>;
        hide(layer?: LayerId): Promise<void>;
        // every layer
        unhide(): Promise<void>;
        delete(layer?: LayerId): Promise<void>;
        restoreDeleted(layer?: LayerId): Promise<void>;
    };
    color: {
        // grades the selection, or the whole layer when nothing is selected
        apply(params: GradeParams, layer?: LayerId): Promise<void>;
        reset(layer?: LayerId): Promise<void>;
    };
    history: {
        undo(): Promise<void>;
        redo(): Promise<void>;
        canUndo(): boolean;
        canRedo(): boolean;
    };
    viewport: {
        captureFrame(): CameraFrame;
        // normalized 0-1 screen points; null where nothing is hit
        pickDepth(points: ScreenPoint[], layers?: LayerId[]): Promise<(DepthHit | null)[]>;
        // normalized 0-1 rect, on the active layer, through the rect tool's
        // machinery (centers / footprint / depth per the selection settings)
        selectRect(rect: ScreenRect, op?: SelectionOp): Promise<void>;
    };
    on(event: ChangeEvent, fn: (detail: ChangeDetail) => void): () => void;
}

// in-slot GPU intersect followed by the SelectOp it produces, in the same
// slot. Shared with the screen-space gestures in editor.ts
const intersectSelect = async (scene: Scene, ctx: CommandContext, splat: Splat, op: InternalOp, options: any, frame?: CameraFrame) => {
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

const createEditorAPI = (events: Events, scene: Scene, editHistory: EditHistory, commandQueue: CommandQueue): EditorAPI => {
    const allSplats = () => scene.getElementsByType(ElementType.splat) as Splat[];

    const layerById = (id: LayerId): Splat => {
        const splat = allSplats().find(s => s.uid === id);
        if (!splat) {
            throw new Error(`No layer with id ${id}`);
        }
        return splat;
    };

    // the command's target: the given layer, else the active one
    const target = (id?: LayerId): Splat => {
        if (id !== undefined) {
            return layerById(id);
        }
        const active = events.invoke('selection') as Splat | null;
        if (!active) {
            throw new Error('No active layer');
        }
        return active;
    };

    const visibleTarget = (id?: LayerId): Splat => {
        const splat = target(id);
        if (!splat.visible) {
            throw new Error(`Layer '${splat.name}' is hidden`);
        }
        return splat;
    };

    // ops read the instance flags in their constructors, so they are built in
    // the slot, after earlier commands have applied. make may return null to
    // skip the command once it sees the up-to-date state
    const apply = (splat: Splat, make: () => EditOp | null) => {
        return commandQueue.enqueue(async (ctx) => {
            if (!splat.scene) return;
            const op = make();
            if (op) await ctx.apply(op);
        });
    };

    const layerInfo = (splat: Splat): LayerInfo => {
        const { entity } = splat;
        return {
            id: splat.uid,
            name: splat.name,
            visible: splat.visible,
            total: splat.numSplats,
            selected: splat.numSelected,
            hidden: splat.numLocked,
            deleted: splat.numDeleted,
            position: entity.getLocalPosition().clone(),
            rotation: entity.getLocalRotation().clone(),
            scale: entity.getLocalScale().clone()
        };
    };

    // change notifications, derived from the bus events the modules already
    // fire. Hide/unhide and visibility are classed as document changes until
    // the session/document classification pass decides otherwise
    const changes = new EventHandler();
    const changed = (event: ChangeEvent, detail: ChangeDetail = {}) => changes.fire(event, detail);

    events.on('selection.changed', (splat: Splat | null) => changed('selectionChanged', { layer: splat?.uid }));
    events.on('edit.apply', (op: EditOp) => {
        changed(isSelectionOp(op) ? 'selectionChanged' : 'documentChanged', { layer: (op as any).splat?.uid });
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
        layers: {
            list: () => allSplats().map(layerInfo),
            active: () => (events.invoke('selection') as Splat | null)?.uid ?? null,
            setActive: (id) => {
                events.fire('selection', id === null ? null : layerById(id));
            },
            setVisible: (id, visible) => {
                layerById(id).visible = visible;
            },
            rename: (id, name) => {
                const splat = layerById(id);
                // compared in the slot: an earlier queued rename may still be pending
                return apply(splat, () => (name === splat.name ? null : new SplatRenameOp(splat, name)));
            }
        },

        selection: {
            all: (layer) => {
                const splat = visibleTarget(layer);
                return apply(splat, () => new SelectAllOp(splat));
            },
            none: (layer) => {
                const splat = visibleTarget(layer);
                return apply(splat, () => new SelectNoneOp(splat));
            },
            invert: (layer) => {
                const splat = visibleTarget(layer);
                return apply(splat, () => new SelectInvertOp(splat));
            },
            byVolume: (shape, transform, op = 'replace', layer) => {
                const splat = visibleTarget(layer);
                // the caller keeps its matrix; the queued work must not see it move
                const shapeTransform = transform.clone();
                const footprint = events.invoke('selection.footprint') as number;
                return commandQueue.enqueue(ctx => intersectSelect(scene, ctx, splat, INTERNAL_OP[op], {
                    [shape]: { transform: shapeTransform, footprint }
                }));
            },
            hide: (layer) => {
                const splat = visibleTarget(layer);
                return apply(splat, () => new HideSelectionOp(splat));
            },
            unhide: () => {
                return commandQueue.enqueue(async (ctx) => {
                    const ops = allSplats()
                    .map(splat => new UnhideAllOp(splat))
                    .filter(op => !op.ranges.empty);
                    if (ops.length > 0) {
                        await ctx.apply(ops.length === 1 ? ops[0] : new MultiOp(ops));
                    }
                });
            },
            delete: (layer) => {
                const splat = visibleTarget(layer);
                return apply(splat, () => new RemoveInstancesOp(splat));
            },
            restoreDeleted: (layer) => {
                const splat = visibleTarget(layer);
                return apply(splat, () => new RestoreMissingInstancesOp(splat));
            }
        },

        color: {
            apply: (params, layer) => {
                const splat = visibleTarget(layer);
                const grade = gradeTerms(params, createGradeTerms());
                return apply(splat, () => new SplatsColorOp({ splat, grade }));
            },
            reset: (layer) => {
                const splat = visibleTarget(layer);
                return apply(splat, () => new SplatsColorOp({ splat, grade: null }));
            }
        },

        history: {
            undo: () => editHistory.undo(),
            redo: () => editHistory.redo(),
            canUndo: () => editHistory.canUndo(),
            canRedo: () => editHistory.canRedo()
        },

        viewport: {
            captureFrame: () => scene.camera.captureFrame(),
            pickDepth: async (points, layers) => {
                const splats = layers?.map(layerById);
                const hits = await scene.camera.intersectMany(points, splats);
                return hits.map(hit => (hit ? {
                    layer: hit.splat.uid,
                    position: hit.position,
                    distance: hit.distance,
                    depth: hit.depth
                } : null));
            },
            // the rect gesture's implementation still lives in editor.ts; it
            // moves here with the rest of the screen-space machinery
            selectRect: (rect, op = 'replace') => {
                return events.invoke('select.rect', INTERNAL_OP[op], rect) as Promise<void>;
            }
        },

        on: (event, fn) => {
            const handle = changes.on(event, fn);
            return () => handle.off();
        }
    };
};

export { createEditorAPI, intersectSelect, PUBLIC_OP };
export type { EditorAPI, LayerId, LayerInfo, SelectionOp, ScreenPoint, ScreenRect, DepthHit, ChangeEvent, ChangeDetail };
