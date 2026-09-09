import { Color, Mat4, Quat, Vec3 } from 'playcanvas';

import { SplatRenameOp } from './edit-ops';
import { Events } from './events';
import type { FileType, SceneExportOptions } from './file-handler';
import type { Pivot } from './pivot';
import { Scene } from './scene';
import { Splat } from './splat';
import { State } from './splat-state';

// WebMCP integration: exposes the editor to browser-hosted AI agents as a small
// set of typed tools via document.modelContext (W3C WebMCP; Chrome 149+ origin
// trial, chrome://flags/#enable-webmcp-testing for local development). The
// tools are a thin adapter over the existing event bus: every edit goes through
// the same events, edit ops and command queue as the UI, so undo/redo and the
// panels stay in sync with what an agent does.
//
// - execute() never rejects. A rejected tool promise reaches the agent only as
//   an opaque UnknownError, so failures are returned as { ok: false, error }.
// - fire()-based editor events drop their handlers' promises. Tools wait on
//   scene.commandQueue.idle() and then re-read state, returning the counts the
//   agent needs to continue without a second call.
// - two conventions differ from the internals on purpose: elevation is positive
//   when the camera is above its target (internally negative), and selection
//   ops are replace/add/subtract/intersect (internally set/add/remove/
//   intersect) because agents reliably misread 'remove' as delete.
// - the tools are reachable without the browser API through
//   scene.events.invoke('webmcp.tools') and
//   scene.events.invoke('webmcp.execute', name, input), for testing in any
//   browser and for driving the editor from the console.

type JsonSchema = Record<string, any>;
type ToolInput = Record<string, any>;
type ToolResult = Record<string, any>;

// structurally identical to the spec's ToolAnnotations dictionary (global.d.ts)
interface ToolAnnotations {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
    consequentialHint?: boolean;
}

interface Tool {
    name: string;
    title: string;
    description: string;
    inputSchema: JsonSchema;
    annotations?: ToolAnnotations;
    run: (input: ToolInput) => Promise<ToolResult> | ToolResult;
}

// an error whose message is meant for the agent
class ToolError extends Error {}

const fail = (message: string): never => {
    throw new ToolError(message);
};

// schema helpers

const prop = (type: string, description: string, extra: JsonSchema = {}): JsonSchema => {
    return { type, description, ...extra };
};

const vec3Prop = (description: string): JsonSchema => {
    return { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description };
};

const enumProp = (values: readonly string[], description: string): JsonSchema => {
    return { type: 'string', enum: [...values], description };
};

const schema = (properties: JsonSchema, required: string[] = []): JsonSchema => {
    return { type: 'object', properties, required, additionalProperties: false };
};

// argument validation: strict in code, loose in schema

const present = (input: ToolInput, key: string) => input[key] !== undefined && input[key] !== null;

const numArg = (input: ToolInput, key: string, min = -Infinity, max = Infinity, required = false): number | undefined => {
    if (!present(input, key)) {
        if (required) {
            fail(`'${key}' is required`);
        }
        return undefined;
    }
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        fail(`'${key}' must be a number between ${min} and ${max}`);
    }
    return value;
};

const intArg = (input: ToolInput, key: string, min: number, max: number, required = false): number | undefined => {
    const value = numArg(input, key, min, max, required);
    if (value !== undefined && !Number.isInteger(value)) {
        fail(`'${key}' must be a whole number between ${min} and ${max}`);
    }
    return value;
};

const boolArg = (input: ToolInput, key: string): boolean | undefined => {
    if (!present(input, key)) {
        return undefined;
    }
    const value = input[key];
    if (typeof value !== 'boolean') {
        fail(`'${key}' must be true or false`);
    }
    return value;
};

const strArg = (input: ToolInput, key: string, maxLength = 256, required = false): string | undefined => {
    if (!present(input, key)) {
        if (required) {
            fail(`'${key}' is required`);
        }
        return undefined;
    }
    const value = input[key];
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
        fail(`'${key}' must be a non-empty string of at most ${maxLength} characters`);
    }
    return value.trim();
};

const enumArg = <T extends string>(input: ToolInput, key: string, values: readonly T[], required = false): T | undefined => {
    if (!present(input, key)) {
        if (required) {
            fail(`'${key}' is required; one of: ${values.join(', ')}`);
        }
        return undefined;
    }
    const value = input[key];
    if (typeof value !== 'string' || !values.includes(value as T)) {
        fail(`'${key}' must be one of: ${values.join(', ')}`);
    }
    return value as T;
};

const vec3Arg = (input: ToolInput, key: string, required = false): number[] | undefined => {
    if (!present(input, key)) {
        if (required) {
            fail(`'${key}' is required: an array of three numbers [x, y, z]`);
        }
        return undefined;
    }
    const value = input[key];
    if (!Array.isArray(value) || value.length !== 3 || value.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        fail(`'${key}' must be an array of three numbers [x, y, z]`);
    }
    return value;
};

// compact numbers keep results inside the agent's output budget
const r3 = (value: number) => Math.round(value * 1000) / 1000;
const arr3 = (v: { x: number, y: number, z: number }) => [r3(v.x), r3(v.y), r3(v.z)];

const SHAPES = ['sphere', 'box'] as const;
const OPS = ['replace', 'add', 'subtract', 'intersect'] as const;
const OP_MAP: Record<typeof OPS[number], 'set' | 'add' | 'remove' | 'intersect'> = {
    replace: 'set',
    add: 'add',
    subtract: 'remove',
    intersect: 'intersect'
};
const MODES = ['all', 'none', 'invert'] as const;
const RESTORE = ['hidden', 'deleted', 'both'] as const;
const ABOUT = ['center', 'pivot'] as const;
const FOCUS = ['auto', 'selection', 'layer', 'scene'] as const;
const VIEWS = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;
// internal azimuth/elevation of each named view (matches camera.align in editor.ts)
const VIEW_ANGLES: Record<typeof VIEWS[number], [number, number]> = {
    front: [0, 0],
    back: [180, 0],
    right: [90, 0],
    left: [270, 0],
    top: [0, -90],
    bottom: [0, 90]
};
const TONEMAPPINGS = ['linear', 'neutral', 'aces', 'aces2', 'filmic', 'hejl'] as const;
const FORMATS = ['ply', 'compressed-ply', 'splat', 'sog', 'spz'] as const;
const FORMAT_INFO: Record<typeof FORMATS[number], { fileType: FileType, ext: string, accepts: string[] }> = {
    'ply': { fileType: 'ply', ext: '.ply', accepts: ['.ply'] },
    'compressed-ply': { fileType: 'compressedPly', ext: '.compressed.ply', accepts: ['.ply'] },
    'splat': { fileType: 'splat', ext: '.splat', accepts: ['.splat'] },
    'sog': { fileType: 'sog', ext: '.sog', accepts: ['.sog'] },
    'spz': { fileType: 'spz', ext: '.spz', accepts: ['.spz'] }
};
const IMPORT_EXTENSIONS = ['.ply', '.splat', '.sog', '.spz', '.ksplat'];
// tools whose pointer interaction intercepts delete and transform requests
const BLOCKING_TOOLS = ['measure', 'orient', 'polygonSelection'];
const LAYER_LIMIT = 10;

const CONVENTIONS = 'Conventions for all tools: Y-up right-handed world in the file\'s units (usually metres); \'selection\' = individual Gaussian splats in the active layer; elevation > 0 = camera above its target; distance 1 frames the whole scene; azimuth 0 looks from +Z (front), 90 from +X (right).';

const registerWebMCP = (events: Events, scene: Scene) => {
    if (events.functions.has('webmcp.tools')) {
        console.warn('WebMCP: already registered');
        return;
    }

    // mirrored editor state: these are notify-only events with no getter
    let canUndo = false;
    let canRedo = false;
    let busy = 0;

    events.on('edit.canUndo', (value: boolean) => {
        canUndo = value;
    });
    events.on('edit.canRedo', (value: boolean) => {
        canRedo = value;
    });
    events.on('startSpinner', () => {
        busy++;
    });
    events.on('stopSpinner', () => {
        busy = Math.max(0, busy - 1);
    });
    events.on('progressStart', () => {
        busy++;
    });
    events.on('progressEnd', () => {
        busy = Math.max(0, busy - 1);
    });

    const assertIdle = () => {
        if (busy > 0) {
            fail('The editor is busy loading or exporting. Wait for it to finish, then retry.');
        }
    };

    // wait for every queued edit and GPU task, including the ones they enqueue
    const settle = () => scene.commandQueue.idle();

    // run an edit and count the history entries it produced, so tools can tell
    // a silently ignored request from a successful one
    const applyEdits = async (fn: () => void | Promise<void>) => {
        let applied = 0;
        const handle = events.on('edit.apply', () => {
            applied++;
        });
        try {
            await fn();
            await settle();
        } finally {
            handle.off();
        }
        return applied;
    };

    // layers are addressed by a stable id as well as by name: duplicate and
    // separate create layers that share their source's name
    const layerIds = new WeakMap<Splat, number>();
    let nextLayerId = 1;

    const layerId = (splat: Splat) => {
        let id = layerIds.get(splat);
        if (id === undefined) {
            id = nextLayerId++;
            layerIds.set(splat, id);
        }
        return id;
    };

    const allLayers = (): Splat[] => {
        const layers = (events.invoke('scene.allSplats') as Splat[]) ?? [];
        layers.forEach(layerId);
        return layers;
    };

    const layerRef = (splat: Splat) => ({ id: layerId(splat), name: splat.name });

    const describeLayers = () => allLayers().map(l => `${layerId(l)}:'${l.name}'`).join(', ') || 'none';

    const resolveLayer = (ref: unknown): Splat => {
        const layers = allLayers();
        if (layers.length === 0) {
            fail('The scene has no layers. Use import_from_url first.');
        }
        if (typeof ref === 'number') {
            const splat = layers.find(l => layerId(l) === ref);
            if (!splat) {
                fail(`No layer with id ${ref}. Layers: ${describeLayers()}`);
            }
            return splat;
        }
        if (typeof ref === 'string') {
            let matches = layers.filter(l => l.name === ref);
            if (matches.length === 0) {
                const lower = ref.toLowerCase();
                matches = layers.filter(l => l.name.toLowerCase() === lower);
            }
            if (matches.length === 0) {
                fail(`No layer named '${ref}'. Layers: ${describeLayers()}`);
            }
            if (matches.length > 1) {
                fail(`Layer name '${ref}' is ambiguous; use the numeric id. Layers: ${describeLayers()}`);
            }
            return matches[0];
        }
        return fail(`'layer' must be a layer id (number) or name (string). Layers: ${describeLayers()}`);
    };

    const activeLayerOrNull = () => (events.invoke('selection') as Splat | null) ?? null;

    const activeLayer = (): Splat => {
        const splat = activeLayerOrNull();
        if (!splat) {
            fail('No active layer. Import a file with import_from_url or activate one with update_layer.');
        }
        if (!splat.visible) {
            fail(`The active layer '${splat.name}' is hidden. Call update_layer with visible: true first.`);
        }
        return splat;
    };

    // optional 'layer' argument: make it the active layer, else use the active one
    const targetLayer = (input: ToolInput): Splat => {
        if (!present(input, 'layer')) {
            return activeLayer();
        }
        const splat = resolveLayer(input.layer);
        if (!splat.visible) {
            fail(`Layer '${splat.name}' is hidden. Call update_layer with visible: true first.`);
        }
        if (activeLayerOrNull() !== splat) {
            events.fire('selection', splat);
        }
        return splat;
    };

    const layerSummary = (splat: Splat) => {
        const entity = splat.entity;
        return {
            id: layerId(splat),
            name: splat.name,
            active: activeLayerOrNull() === splat,
            visible: splat.visible,
            splats: splat.numSplats,
            selected: splat.numSelected,
            hidden: splat.numLocked,
            deleted: splat.numDeleted,
            position: arr3(entity.getLocalPosition()),
            rotation: arr3(entity.getLocalEulerAngles()),
            scale: arr3(entity.getLocalScale())
        };
    };

    const cameraSummary = () => {
        const camera = scene.camera;
        const pose = events.invoke('camera.getPose');
        return {
            position: arr3(pose.position),
            target: arr3(pose.target),
            fov: r3(camera.fov),
            azimuth: r3(camera.azim),
            elevation: r3(-camera.elevation),
            distance: r3(camera.distance),
            orthographic: camera.ortho,
            controlMode: events.invoke('camera.controlMode')
        };
    };

    const viewSummary = () => {
        const bg = events.invoke('bgClr') as Color;
        return {
            background: [r3(bg.r), r3(bg.g), r3(bg.b)],
            showGrid: !!events.invoke('grid.visible'),
            shBands: events.invoke('view.bands'),
            tonemapping: events.invoke('camera.tonemapping'),
            showGaussians: !!events.invoke('view.gaussians'),
            showCenters: !!events.invoke('view.centers'),
            showRings: !!events.invoke('view.rings')
        };
    };

    const sceneBounds = () => {
        if (allLayers().length === 0) {
            return null;
        }
        const bound = scene.bound;
        return { center: arr3(bound.center), halfExtents: arr3(bound.halfExtents) };
    };

    // world-space centre and radius of a layer's selection or of the whole layer
    const worldCenter = (splat: Splat, selection: boolean) => {
        const result = new Vec3();
        if (selection) {
            result.copy(splat.selectionBound.center);
            splat.worldTransform.transformPoint(result, result);
        } else {
            result.copy(splat.worldBound.center);
        }
        return result;
    };

    const worldRadius = (splat: Splat, selection: boolean) => {
        if (selection) {
            const scale = new Vec3();
            splat.worldTransform.getScale(scale);
            return splat.selectionBound.halfExtents.length() * scale.x;
        }
        return splat.worldBound.halfExtents.length();
    };

    const focusOn = (focalPoint: Vec3, radius: number) => {
        events.fire('camera.setControlMode', 'orbit');
        scene.camera.focus({ focalPoint, radius: Math.max(radius, 0.01), speed: 0 });
        scene.camera.onUpdate(0);
        scene.forceRender = true;
    };

    const regionArgs = (input: ToolInput) => {
        const shape = enumArg(input, 'shape', SHAPES, true);
        const center = vec3Arg(input, 'center', true);
        let size = vec3Arg(input, 'size');
        const radius = numArg(input, 'radius', 0, Infinity);
        if (radius !== undefined) {
            if (shape !== 'sphere') {
                fail('\'radius\' only applies to shape \'sphere\'; use \'size\' for a box');
            }
            size = [radius * 2, radius * 2, radius * 2];
        }
        if (!size) {
            fail('\'size\' is required (or \'radius\' for a sphere)');
        }
        if (size.some(v => v <= 0)) {
            fail('\'size\' components must be positive');
        }
        // the intersect shaders map the unit sphere (diameter 1) / unit cube (side 1) to world space
        const transform = new Mat4().setTRS(
            new Vec3(center[0], center[1], center[2]),
            new Quat(),
            new Vec3(size[0], size[1], size[2])
        );
        return { shape, transform };
    };

    // GPU-test which splats of a layer lie inside the region. Runs on the shared
    // queue like the editor's own intersect selects, hands the pooled mask to
    // `consume` (255 = hit) and releases it afterwards.
    const intersectRegion = (splat: Splat, shape: 'sphere' | 'box', transform: Mat4, invert: boolean, consume: (mask: Uint8Array) => void) => {
        return scene.commandQueue.enqueue(async () => {
            const footprint = events.invoke('selection.footprint') as number;
            const options = shape === 'sphere' ? { sphere: { transform, footprint } } : { box: { transform, footprint } };
            const mask = await scene.dataProcessor.intersect(options, splat);
            try {
                if (invert) {
                    const count = splat.instances.count;
                    for (let i = 0; i < count; i++) {
                        mask[i] = mask[i] === 255 ? 0 : 255;
                    }
                }
                consume(mask);
            } finally {
                scene.dataProcessor.releaseMask(mask);
            }
        });
    };

    // hits among the splats that are not hidden (hidden ones can't be selected)
    const countHits = (splat: Splat, mask: Uint8Array) => {
        const flags = splat.instances.flags;
        const count = splat.instances.count;
        let hits = 0;
        for (let i = 0; i < count; i++) {
            if (mask[i] === 255 && (flags[i] & State.locked) === 0) {
                hits++;
            }
        }
        return hits;
    };

    const deactivateBlockingTool = () => {
        const active = events.invoke('tool.active') as string | null;
        if (active && BLOCKING_TOOLS.includes(active)) {
            events.fire('tool.deactivate');
        }
    };

    const layerProp = prop('string', 'Layer id (number) or name (string) from get_scene_state. Defaults to the active layer.', { type: ['integer', 'string'] });

    const regionProps = {
        shape: enumProp(SHAPES, 'Region shape: a sphere (ellipsoid when size is non-uniform) or an axis-aligned box.'),
        center: vec3Prop('World-space centre [x, y, z] of the region.'),
        size: vec3Prop('Extents [x, y, z]: full side lengths of the box, or diameters of the sphere.'),
        radius: prop('number', 'Sphere radius; shorthand for size = [2r, 2r, 2r].', { exclusiveMinimum: 0 })
    };

    const tools: Tool[] = [
        {
            name: 'get_scene_state',
            title: 'Get scene state',
            description: `Read the editor state: document, layers (imported splat files with total/selected/hidden/deleted counts and transform), scene bounds, camera, active tool, undo/redo availability, view options, busy flag. ${CONVENTIONS}`,
            inputSchema: schema({}),
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            run: () => {
                const layers = allLayers();
                const active = activeLayerOrNull();
                const shown = layers.slice(0, LAYER_LIMIT);
                return {
                    document: { name: events.invoke('doc.name') ?? null, unsavedChanges: !!events.invoke('scene.dirty') },
                    layers: shown.map(layerSummary),
                    moreLayers: layers.length - shown.length,
                    activeLayer: active ? layerRef(active) : null,
                    sceneBounds: sceneBounds(),
                    camera: cameraSummary(),
                    activeTool: events.invoke('tool.active') ?? null,
                    history: { canUndo, canRedo },
                    view: viewSummary(),
                    busy: busy > 0
                };
            }
        },
        {
            name: 'count_in_region',
            title: 'Count splats in a region',
            description: 'Count the visible Gaussian splats of a layer whose centres fall inside a world-space sphere or box, without changing the selection. Use it to probe for floaters or to size a crop region before calling select_region.',
            inputSchema: schema({ ...regionProps, layer: layerProp }, ['shape', 'center']),
            annotations: { readOnlyHint: true },
            run: async (input) => {
                const splat = present(input, 'layer') ? resolveLayer(input.layer) : activeLayer();
                const { shape, transform } = regionArgs(input);
                let count = 0;
                await intersectRegion(splat, shape, transform, false, (mask) => {
                    count = countHits(splat, mask);
                });
                return { count, total: splat.numSplats - splat.numLocked, layer: layerRef(splat) };
            }
        },
        {
            name: 'import_from_url',
            title: 'Import splat file from URL',
            description: 'Load a Gaussian splat file from an http(s) URL into the scene as a new layer, which becomes the active layer. Supported: .ply (including compressed .ply), .splat, .sog, .spz, .ksplat. The server must allow cross-origin access. Existing layers are kept; call new_scene first to start from an empty scene.',
            inputSchema: schema({
                url: prop('string', 'Absolute http(s) URL of the splat file.'),
                filename: prop('string', 'Filename with extension; detects the format and becomes the layer name. Defaults to the last URL path segment.')
            }, ['url']),
            annotations: { untrustedContentHint: true },
            run: async (input) => {
                assertIdle();
                const url = strArg(input, 'url', 2048, true);
                let parsed: URL;
                try {
                    parsed = new URL(url);
                } catch (error) {
                    return fail('\'url\' must be an absolute http(s) URL');
                }
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                    fail('\'url\' must use http or https');
                }
                if (parsed.username || parsed.password) {
                    fail('URLs with embedded credentials are not allowed');
                }
                const filename = strArg(input, 'filename', 256) ?? decodeURIComponent(parsed.pathname.split('/').pop() ?? '');
                if (!filename) {
                    fail('Could not derive a filename from the URL; pass \'filename\' (e.g. scene.ply)');
                }
                const lower = filename.toLowerCase();
                if (!IMPORT_EXTENSIONS.some(ext => lower.endsWith(ext))) {
                    fail(`Unsupported file type '${filename}'. Supported: ${IMPORT_EXTENSIONS.join(', ')}`);
                }
                const before = new Set(allLayers());
                const result = (await events.invoke('import', [{ filename, url }], false, true)) as Splat[] | undefined;
                await settle();
                const added = (result ?? []).filter(s => !before.has(s));
                if (added.length === 0) {
                    fail('The import produced no layer.');
                }
                // single remote files are loaded under their full URL, which is
                // what the layer would otherwise be called; the short filename is
                // the name the agent asked for and will refer back to
                added[0].name = filename;
                return { layer: layerSummary(added[0]), layers: allLayers().map(layerRef) };
            }
        },
        {
            name: 'new_scene',
            title: 'New scene',
            description: 'Remove every layer, clear the undo history and reset the camera, leaving an empty scene. Unsaved edits are lost; confirm with the user first when get_scene_state reports unsavedChanges.',
            inputSchema: schema({}),
            annotations: { consequentialHint: true },
            run: async () => {
                assertIdle();
                const removedLayers = allLayers().length;
                const discardedUnsavedChanges = !!events.invoke('scene.dirty');
                events.invoke('doc.reset');
                await settle();
                scene.forceRender = true;
                return { removedLayers, discardedUnsavedChanges };
            }
        },
        {
            name: 'update_layer',
            title: 'Update layer',
            description: 'Change a layer: show or hide it, make it the active layer (the target of selection and edit tools), or rename it. A hidden layer is excluded from export and cannot be edited until shown again.',
            inputSchema: schema({
                layer: prop('string', 'Layer id (number) or name (string) from get_scene_state.', { type: ['integer', 'string'] }),
                visible: prop('boolean', 'true to show the layer, false to hide it.'),
                active: prop('boolean', 'true to make it the active layer (it must be visible); false to deactivate it.'),
                name: prop('string', 'New display name for the layer (undoable).')
            }, ['layer']),
            run: async (input) => {
                assertIdle();
                if (!present(input, 'layer')) {
                    fail('\'layer\' is required');
                }
                const splat = resolveLayer(input.layer);
                const visible = boolArg(input, 'visible');
                const active = boolArg(input, 'active');
                const name = strArg(input, 'name', 128);
                if (visible === undefined && active === undefined && name === undefined) {
                    fail('Provide at least one of visible, active or name.');
                }
                if (active === true && (visible ?? splat.visible) === false) {
                    fail('A hidden layer cannot be activated; pass visible: true as well.');
                }
                if (visible !== undefined) {
                    splat.visible = visible;
                }
                if (name !== undefined && name !== splat.name) {
                    events.fire('edit.add', new SplatRenameOp(splat, name));
                }
                if (active === true && activeLayerOrNull() !== splat) {
                    events.fire('selection', splat);
                } else if (active === false && activeLayerOrNull() === splat) {
                    events.fire('selection', null);
                }
                await settle();
                scene.forceRender = true;
                return { layer: layerSummary(splat) };
            }
        },
        {
            name: 'set_selection',
            title: 'Select all, none or invert',
            description: 'Select all, none, or invert the selection of Gaussian splats in the active layer (or in the given layer, which becomes active). Hidden splats are never selected. Follow with delete_selected, hide_selected or transform_selection.',
            inputSchema: schema({
                mode: enumProp(MODES, 'all selects every splat, none clears the selection, invert flips it.'),
                layer: layerProp
            }, ['mode']),
            run: async (input) => {
                assertIdle();
                const mode = enumArg(input, 'mode', MODES, true);
                const splat = targetLayer(input);
                const previouslySelected = splat.numSelected;
                await applyEdits(() => {
                    events.fire(`select.${mode}`);
                });
                return { selected: splat.numSelected, previouslySelected, total: splat.numSplats, layer: layerSummary(splat) };
            }
        },
        {
            name: 'select_region',
            title: 'Select splats in a region',
            description: 'Select the Gaussian splats of the active layer whose centres lie inside (or, with invert, outside) a world-space sphere or box, combined with the current selection according to op. To crop a scene: call select_region with invert = true around the part to keep, then delete_selected. Use count_in_region to preview.',
            inputSchema: schema({
                ...regionProps,
                op: enumProp(OPS, 'replace the selection (default), add to it, subtract from it, or intersect with it.'),
                invert: prop('boolean', 'true selects the splats OUTSIDE the region instead of inside (crop helper).'),
                layer: layerProp
            }, ['shape', 'center']),
            run: async (input) => {
                assertIdle();
                const splat = targetLayer(input);
                const { shape, transform } = regionArgs(input);
                const op = enumArg(input, 'op', OPS) ?? 'replace';
                const invert = boolArg(input, 'invert') ?? false;
                const previouslySelected = splat.numSelected;
                let matched = 0;
                await applyEdits(() => intersectRegion(splat, shape, transform, invert, (mask) => {
                    matched = countHits(splat, mask);
                    // SelectOp snapshots the mask synchronously, so the pooled
                    // buffer can be released as soon as this returns
                    events.fire('select.mask', OP_MAP[op], mask);
                }));
                return { selected: splat.numSelected, previouslySelected, matched, total: splat.numSplats, layer: layerSummary(splat) };
            }
        },
        {
            name: 'delete_selected',
            title: 'Delete selected splats',
            description: 'Delete the currently selected Gaussian splats from the active layer. Undoable with undo. Deleted splats are excluded from export; restore_all brings them back.',
            inputSchema: schema({}),
            run: async () => {
                assertIdle();
                const splat = activeLayer();
                if (splat.numSelected === 0) {
                    fail(`Nothing is selected in layer '${splat.name}'. Use set_selection or select_region first.`);
                }
                deactivateBlockingTool();
                const before = splat.numDeleted;
                await applyEdits(() => {
                    events.fire('select.delete');
                });
                const deleted = splat.numDeleted - before;
                if (deleted === 0) {
                    fail('Delete had no effect; the active tool may have intercepted it. Retry.');
                }
                return { deleted, layer: layerSummary(splat) };
            }
        },
        {
            name: 'hide_selected',
            title: 'Hide selected splats',
            description: 'Hide the currently selected Gaussian splats of the active layer so they are neither shown nor editable. Hidden splats are still exported; use delete_selected to remove them. Reverse with undo or restore_all.',
            inputSchema: schema({}),
            run: async () => {
                assertIdle();
                const splat = activeLayer();
                if (splat.numSelected === 0) {
                    fail(`Nothing is selected in layer '${splat.name}'. Use set_selection or select_region first.`);
                }
                const before = splat.numLocked;
                await applyEdits(() => {
                    events.fire('select.hide');
                });
                const hidden = splat.numLocked - before;
                if (hidden === 0) {
                    fail('Hide had no effect.');
                }
                return { hidden, layer: layerSummary(splat) };
            }
        },
        {
            name: 'restore_all',
            title: 'Restore hidden or deleted splats',
            description: 'Bring back hidden and/or deleted Gaussian splats: hidden unhides in every layer, deleted restores the deleted splats of the active layer, both (default) does both. Undoable.',
            inputSchema: schema({
                what: enumProp(RESTORE, 'hidden, deleted, or both (default).')
            }),
            run: async (input) => {
                assertIdle();
                const what = enumArg(input, 'what', RESTORE) ?? 'both';
                const layers = allLayers();
                if (layers.length === 0) {
                    fail('The scene has no layers.');
                }
                const active = activeLayerOrNull();
                const restoreDeleted = what !== 'hidden' && !!active?.visible;
                if (what === 'deleted' && !restoreDeleted) {
                    fail('Restoring deleted splats needs an active, visible layer.');
                }
                const hiddenBefore = layers.reduce((sum, l) => sum + l.numLocked, 0);
                const deletedBefore = active?.numDeleted ?? 0;
                await applyEdits(() => {
                    if (what !== 'deleted') {
                        events.fire('select.unhide');
                    }
                    if (restoreDeleted) {
                        events.fire('scene.reset');
                    }
                });
                return {
                    unhidden: hiddenBefore - layers.reduce((sum, l) => sum + l.numLocked, 0),
                    restored: restoreDeleted ? deletedBefore - active.numDeleted : 0,
                    layer: active ? layerSummary(active) : null
                };
            }
        },
        {
            name: 'undo',
            title: 'Undo',
            description: 'Undo the most recent edit(s): selection changes, deletes, hides, transforms and renames. get_scene_state reports history.canUndo.',
            inputSchema: schema({
                steps: prop('integer', 'Number of edits to undo, 1-50 (default 1).', { minimum: 1, maximum: 50 })
            }),
            run: async (input) => {
                assertIdle();
                const steps = intArg(input, 'steps', 1, 50) ?? 1;
                if (!canUndo) {
                    fail('Nothing to undo.');
                }
                let undone = 0;
                for (let i = 0; i < steps; i++) {
                    if (!canUndo) {
                        break;
                    }
                    events.fire('edit.undo');
                    await settle();
                    undone++;
                }
                const active = activeLayerOrNull();
                return { undone, history: { canUndo, canRedo }, layer: active ? layerSummary(active) : null };
            }
        },
        {
            name: 'redo',
            title: 'Redo',
            description: 'Redo previously undone edit(s). get_scene_state reports history.canRedo.',
            inputSchema: schema({
                steps: prop('integer', 'Number of edits to redo, 1-50 (default 1).', { minimum: 1, maximum: 50 })
            }),
            run: async (input) => {
                assertIdle();
                const steps = intArg(input, 'steps', 1, 50) ?? 1;
                if (!canRedo) {
                    fail('Nothing to redo.');
                }
                let redone = 0;
                for (let i = 0; i < steps; i++) {
                    if (!canRedo) {
                        break;
                    }
                    events.fire('edit.redo');
                    await settle();
                    redone++;
                }
                const active = activeLayerOrNull();
                return { redone, history: { canUndo, canRedo }, layer: active ? layerSummary(active) : null };
            }
        },
        {
            name: 'set_camera',
            title: 'Set camera',
            description: 'Move the editor camera. Either pick a named view, set orbit parameters (azimuth and elevation in degrees, distance where 1 frames the whole scene), or give an explicit position and target in world space. fov and orthographic can be combined with any of these. Moves are instant unless animate is true.',
            inputSchema: schema({
                view: enumProp(VIEWS, 'Named view, orbiting the current target in perspective: front, back, left, right, top or bottom.'),
                azimuth: prop('number', 'Orbit angle in degrees around the vertical axis: 0 = camera on the +Z side (front), 90 = +X side (right).'),
                elevation: prop('number', 'Orbit elevation in degrees, -90 to 90; positive places the camera above its target.', { minimum: -90, maximum: 90 }),
                distance: prop('number', 'Orbit distance relative to the scene size: 1 frames the whole scene, 0.5 is twice as close.', { exclusiveMinimum: 0, maximum: 10 }),
                fov: prop('number', 'Field of view in degrees (5-170).', { minimum: 5, maximum: 170 }),
                position: vec3Prop('Camera position [x, y, z] in world space; requires target.'),
                target: vec3Prop('Point [x, y, z] the camera looks at; requires position.'),
                orthographic: prop('boolean', 'true for an orthographic projection, false for perspective.'),
                animate: prop('boolean', 'true to tween smoothly (about a second); default false moves instantly.')
            }),
            run: (input) => {
                const view = enumArg(input, 'view', VIEWS);
                const azimuth = numArg(input, 'azimuth', -100000, 100000);
                const elevation = numArg(input, 'elevation', -90, 90);
                const distance = numArg(input, 'distance', 1e-6, 10);
                const fov = numArg(input, 'fov', 5, 170);
                const position = vec3Arg(input, 'position');
                const target = vec3Arg(input, 'target');
                const orthographic = boolArg(input, 'orthographic');
                const animate = boolArg(input, 'animate') ?? false;
                const orbit = view !== undefined || azimuth !== undefined || elevation !== undefined;

                if (!!position !== !!target) {
                    fail('\'position\' and \'target\' must be given together');
                }
                if (position && (orbit || distance !== undefined)) {
                    fail('\'position\'/\'target\' cannot be combined with view, azimuth, elevation or distance');
                }
                if (position && position.every((v, i) => v === target[i])) {
                    fail('\'position\' and \'target\' must differ');
                }
                if (!position && !orbit && distance === undefined && fov === undefined && orthographic === undefined) {
                    fail('Provide at least one camera parameter.');
                }

                const speed = animate ? 1 : 0;
                const camera = scene.camera;

                if (fov !== undefined) {
                    events.fire('camera.setFov', fov);
                }
                if (position) {
                    events.fire('camera.setPose', {
                        position: new Vec3(position[0], position[1], position[2]),
                        target: new Vec3(target[0], target[1], target[2])
                    }, speed);
                } else if (orbit) {
                    let [azim, elev] = view ? VIEW_ANGLES[view] : [camera.azim, camera.elevation];
                    if (azimuth !== undefined) {
                        azim = azimuth;
                    }
                    if (elevation !== undefined) {
                        // agents see elevation positive above the target; the camera stores the opposite sign
                        elev = -elevation;
                    }
                    camera.setAzimElev(azim, elev, speed);
                }
                if (distance !== undefined) {
                    camera.setDistance(distance, speed);
                }
                if (orthographic !== undefined) {
                    // after setAzimElev, which always returns to perspective
                    camera.ortho = orthographic;
                }
                if (!animate) {
                    // land the pose now so the returned state is what the agent set
                    camera.onUpdate(0);
                }
                scene.forceRender = true;
                return { camera: cameraSummary(), animating: animate };
            }
        },
        {
            name: 'focus_camera',
            title: 'Focus camera',
            description: 'Frame the camera on the current selection, the active layer or the whole scene, switching to orbit mode. auto (default) uses the selection if any, else the active layer, else the scene.',
            inputSchema: schema({
                target: enumProp(FOCUS, 'auto (default), selection, layer or scene.')
            }),
            run: (input) => {
                const requested = enumArg(input, 'target', FOCUS) ?? 'auto';
                if (allLayers().length === 0) {
                    fail('The scene is empty.');
                }
                const active = activeLayerOrNull();
                let mode = requested;
                if (mode === 'auto') {
                    mode = active?.visible ? (active.numSelected > 0 ? 'selection' : 'layer') : 'scene';
                }
                if (mode === 'scene') {
                    const bound = scene.bound;
                    focusOn(bound.center.clone(), bound.halfExtents.length());
                } else {
                    const splat = activeLayer();
                    const selection = mode === 'selection';
                    if (selection && splat.numSelected === 0) {
                        fail(`Nothing is selected in layer '${splat.name}'.`);
                    }
                    focusOn(worldCenter(splat, selection), worldRadius(splat, selection));
                }
                return { focused: mode, camera: cameraSummary() };
            }
        },
        {
            name: 'transform_selection',
            title: 'Move, rotate or scale',
            description: 'Move, rotate and/or scale the selected Gaussian splats of the active layer, or the whole layer when nothing is selected. Deltas are applied in world space about the centre of the selection or layer (or about the pivot). Undoable.',
            inputSchema: schema({
                translate: vec3Prop('Offset [x, y, z] in world units.'),
                rotate: vec3Prop('Rotation deltas in degrees about the world X, Y and Z axes.'),
                scale: prop('number', 'Uniform scale factor (> 0); 2 doubles the size, 0.5 halves it.', { exclusiveMinimum: 0 }),
                about: enumProp(ABOUT, 'center (default) rotates and scales about the bounds centre; pivot uses the transform pivot (layer origin by default).')
            }),
            run: async (input) => {
                assertIdle();
                const splat = activeLayer();
                const translate = vec3Arg(input, 'translate');
                const rotate = vec3Arg(input, 'rotate');
                const scale = numArg(input, 'scale', 1e-6, 1e6);
                const about = enumArg(input, 'about', ABOUT) ?? 'center';
                if (!translate && !rotate && scale === undefined) {
                    fail('Provide at least one of translate, rotate or scale.');
                }
                deactivateBlockingTool();
                // the transform handler is rebound asynchronously after selection changes
                await settle();

                const pivot = events.invoke('pivot') as Pivot;
                const start = pivot.transform.clone();
                const toSelection = splat.numSelected > 0;
                const center = about === 'pivot' ? start.position.clone() : worldCenter(splat, toSelection);
                const rotation = rotate ? new Quat().setFromEulerAngles(rotate[0], rotate[1], rotate[2]) : new Quat();
                const factor = scale ?? 1;

                // rotate/scale the pivot about `center`, then translate. The bound
                // transform handler turns the pivot delta into the layer or splat
                // transform - the same path as the numeric transform panel.
                const offset = new Vec3().sub2(start.position, center);
                rotation.transformVector(offset, offset);
                offset.mulScalar(factor);
                const position = new Vec3().add2(center, offset);
                if (translate) {
                    position.add(new Vec3(translate[0], translate[1], translate[2]));
                }
                const orientation = new Quat().mul2(rotation, start.rotation);
                if (orientation.w < 0) {
                    orientation.mulScalar(-1);
                }
                const size = start.scale.clone().mulScalar(factor);

                const applied = await applyEdits(() => {
                    pivot.start();
                    pivot.moveTRS(position, orientation, size);
                    pivot.end();
                });
                if (applied === 0) {
                    fail('The transform had no effect (zero delta, or no transform handler is bound).');
                }
                return { appliedTo: toSelection ? 'selection' : 'layer', layer: layerSummary(splat) };
            }
        },
        {
            name: 'set_view_options',
            title: 'Set view options',
            description: 'Change how the viewport is displayed: background colour, grid, spherical-harmonic bands, tone mapping, and whether splats, centre points or rings are drawn. Does not modify the scene data.',
            inputSchema: schema({
                background: vec3Prop('Background colour [r, g, b] with components 0-1.'),
                showGrid: prop('boolean', 'Show the ground grid.'),
                shBands: prop('integer', 'Spherical harmonic bands to render, 0-3 (3 = full colour detail).', { minimum: 0, maximum: 3 }),
                tonemapping: enumProp(TONEMAPPINGS, 'Tone mapping curve.'),
                showGaussians: prop('boolean', 'Draw the Gaussian splats.'),
                showCenters: prop('boolean', 'Draw splat centre points.'),
                showRings: prop('boolean', 'Draw splat rings (footprint outlines).')
            }),
            run: (input) => {
                const background = vec3Arg(input, 'background');
                const showGrid = boolArg(input, 'showGrid');
                const shBands = intArg(input, 'shBands', 0, 3);
                const tonemapping = enumArg(input, 'tonemapping', TONEMAPPINGS);
                const showGaussians = boolArg(input, 'showGaussians');
                const showCenters = boolArg(input, 'showCenters');
                const showRings = boolArg(input, 'showRings');
                if ([background, showGrid, shBands, tonemapping, showGaussians, showCenters, showRings].every(v => v === undefined)) {
                    fail('Provide at least one view option.');
                }
                if (background && background.some(v => v < 0 || v > 1)) {
                    fail('\'background\' components must be between 0 and 1');
                }
                if (background) {
                    events.fire('setBgClr', new Color(background[0], background[1], background[2]));
                }
                if (showGrid !== undefined) {
                    events.fire('grid.setVisible', showGrid);
                }
                if (shBands !== undefined) {
                    events.fire('view.setBands', shBands);
                }
                if (tonemapping !== undefined) {
                    events.fire('camera.setTonemapping', tonemapping);
                }
                if (showGaussians !== undefined) {
                    events.fire('view.setGaussians', showGaussians);
                }
                if (showCenters !== undefined) {
                    events.fire('view.setCenters', showCenters);
                }
                if (showRings !== undefined) {
                    events.fire('view.setRings', showRings);
                }
                scene.forceRender = true;
                return { view: viewSummary() };
            }
        },
        {
            name: 'export_scene',
            title: 'Export scene',
            description: 'Export the visible layers (or one layer) as a file that the browser downloads: ply, compressed-ply, splat, sog or spz. Hidden layers and deleted splats are excluded; hidden splats are included. The browser may block a second automatic download until the user allows it.',
            inputSchema: schema({
                format: enumProp(FORMATS, 'Output format.'),
                filename: prop('string', 'Output filename; defaults to the document or first layer name plus the format extension.'),
                layer: prop('string', 'Layer id or name to export alone; default all exports every visible layer merged.', { type: ['integer', 'string'] }),
                selectedOnly: prop('boolean', 'true exports only the currently selected splats.'),
                shBands: prop('integer', 'Spherical harmonic bands to keep, 0-3 (default 3).', { minimum: 0, maximum: 3 })
            }, ['format']),
            annotations: { consequentialHint: true },
            run: async (input) => {
                assertIdle();
                const format = enumArg(input, 'format', FORMATS, true);
                const exportable = events.invoke('scene.splats') as Splat[];
                if (exportable.length === 0) {
                    fail('Nothing to export: the scene has no visible layers with splats.');
                }
                let splatIdx: 'all' | number = 'all';
                if (present(input, 'layer') && input.layer !== 'all') {
                    const splat = resolveLayer(input.layer);
                    splatIdx = exportable.indexOf(splat);
                    if (splatIdx < 0) {
                        fail(`Layer '${splat.name}' is hidden or empty and cannot be exported.`);
                    }
                }
                const selectedOnly = boolArg(input, 'selectedOnly') ?? false;
                const targets = splatIdx === 'all' ? exportable : [exportable[splatIdx]];
                if (selectedOnly && !targets.some(s => s.numSelected > 0)) {
                    fail('selectedOnly was requested but nothing is selected.');
                }
                const shBands = intArg(input, 'shBands', 0, 3) ?? 3;
                const { fileType, ext, accepts } = FORMAT_INFO[format];
                let filename = strArg(input, 'filename', 256) ?? `${events.invoke('render.baseFilename')}${ext}`;
                filename = filename.replace(/[\\/:*?"<>|]/g, '_');
                if (!accepts.some(a => filename.toLowerCase().endsWith(a))) {
                    filename += ext;
                }
                const options: SceneExportOptions = {
                    filename,
                    splatIdx,
                    serializeSettings: { maxSHBands: shBands, selected: selectedOnly },
                    compressedPly: format === 'compressed-ply'
                };
                await events.invoke('scene.write', fileType, options, undefined, true);
                await settle();
                return {
                    filename,
                    format,
                    layers: targets.map(layerRef),
                    note: 'Saved to the browser\'s downloads folder. The browser may block further automatic downloads until the user allows them for this site.'
                };
            }
        }
    ];

    const toolMap = new Map(tools.map(tool => [tool.name, tool]));

    const runTool = async (name: string, input: unknown): Promise<ToolResult> => {
        const tool = toolMap.get(name);
        if (!tool) {
            return { ok: false, error: `Unknown tool '${name}'. Available tools: ${tools.map(t => t.name).join(', ')}` };
        }
        try {
            let args: ToolInput = {};
            if (typeof input === 'string' && input.trim().length > 0) {
                try {
                    args = JSON.parse(input);
                } catch (error) {
                    fail('Input must be a JSON object');
                }
            } else if (input && typeof input === 'object') {
                args = input as ToolInput;
            }
            const known = Object.keys(tool.inputSchema.properties ?? {});
            const unknown = Object.keys(args).filter(key => !known.includes(key));
            if (unknown.length > 0) {
                fail(`Unknown parameter(s) ${unknown.map(key => `'${key}'`).join(', ')}. Accepted: ${known.join(', ') || 'none'}`);
            }
            const result = await tool.run(args);
            return { ok: true, ...result };
        } catch (error) {
            if (error instanceof ToolError) {
                return { ok: false, error: error.message };
            }
            console.warn(`WebMCP: tool '${name}' failed`, error);
            return { ok: false, error: `${name} failed: ${error?.message ?? error}` };
        }
    };

    // tool calls are serialised so two agent requests can't interleave their
    // queue barriers and state reads
    let chain: Promise<unknown> = Promise.resolve();
    const execute = (name: string, input: unknown) => {
        const result = chain.then(() => runTool(name, input));
        chain = result.then(() => {}, () => {});
        return result;
    };

    const descriptors = tools.map(({ name, title, description, inputSchema, annotations }) => {
        return { name, title, description, inputSchema, annotations };
    });

    // in-page access for testing and console use, independent of the browser API
    events.function('webmcp.tools', () => descriptors);
    events.function('webmcp.execute', (name: string, input: unknown) => execute(name, input));

    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== 'function') {
        console.log('WebMCP: API not available in this browser; tools remain reachable via scene.events.invoke(\'webmcp.execute\', name, input)');
        return;
    }

    // registrations are owned by one signal so they can be withdrawn together
    const controller = new AbortController();
    const registrations = descriptors.map(async (descriptor) => {
        await modelContext.registerTool({
            ...descriptor,
            execute: (input: unknown) => execute(descriptor.name, input)
        }, { signal: controller.signal });
    });

    Promise.allSettled(registrations).then((results) => {
        const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
        console.log(`WebMCP: registered ${results.length - failed.length} of ${results.length} tools`);
        failed.forEach((r) => {
            console.warn('WebMCP: tool registration failed', r.reason);
        });
    });
};

export { registerWebMCP };
