import { BoundingBox, Color, Mat4, Quat, Vec3 } from 'playcanvas';

import type { EditorAPI, ScreenPoint, SelectionOp } from './editor-api';
import type { EditScope } from './editor-command';
import { checkCancelled, EditorError } from './editor-command';
import type { CameraSettings } from './editor-session';
import type { TimelineSettings } from './editor-timeline';
import { isFinalColorMode, propModeFor } from './splat-properties';
import { i18n } from './ui/localization';

type Schema = {
    type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
    description?: string;
    properties?: Record<string, Schema>;
    required?: string[];
    additionalProperties?: boolean;
    items?: Schema;
    minItems?: number;
    maxItems?: number;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    enum?: readonly (string | number)[];
};
type Input = Record<string, unknown>;
type Tool = {
    name: string;
    description: string;
    inputSchema: Schema;
    annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean; consequentialHint?: boolean };
    execute(input: unknown, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
};
type ModelContext = {
    registerTool(tool: Tool & { title: string }, options: { signal: AbortSignal }): void | Promise<void>;
};

const number = (description: string, minimum = -1e30, maximum = 1e30): Schema => ({
    type: 'number',
    description,
    minimum,
    maximum
});
const integer = (description: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): Schema => ({
    type: 'integer',
    description,
    minimum,
    maximum
});
const boolean = (description: string): Schema => ({ type: 'boolean', description });
const string = (description: string, maxLength = 256): Schema => ({
    type: 'string',
    description,
    minLength: 1,
    maxLength
});
const enumeration = (values: readonly string[], description: string): Schema => ({
    type: 'string',
    enum: values,
    description
});
const array = (items: Schema, count: number, description: string): Schema => ({
    type: 'array',
    items,
    minItems: count,
    maxItems: count,
    description
});
const vector = (description: string) => array(number('Component'), 3, description);
const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false
});
const layer = integer('Session layer ID from get_scene. Naming a layer does not activate it.');
const scope = enumeration(
    ['selection', 'layer'],
    'Explicit edit scope. An empty selection is an error; it never expands to the layer.'
);
const op = enumeration(['replace', 'add', 'subtract', 'intersect'], 'Combine with current selection; default replace.');
const preview = boolean('Return matching count and world bounds without changing selection or history.');
const outside = boolean('Match outside the region or range; default false.');
const footprint = number('0 tests centres; values up to 1 test that fraction of the splat footprint. Default 0.', 0, 1);
const viewToken = string('viewToken from get_scene or a camera tool. Rejects if camera or viewport has changed.', 64);
const point = object({ x: number('Viewport x, left to right.', 0, 1), y: number('Viewport y, top to bottom.', 0, 1) }, [
    'x',
    'y'
]);
const xyz = (v: number[]) => new Vec3(v[0], v[1], v[2]);
const color = (v: number[]) => new Color(v[0], v[1], v[2]);

// Validate exactly the schema we publish. No coercion or silent dropping of
// unknown arguments; the native browser API does not guarantee schema checks.
const validate = (schema: Schema, value: unknown, path = 'input'): void => {
    const invalid = (message: string): never => {
        throw new EditorError('invalid_input', `${path}: ${message}`);
    };
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('expected an object');
        const fields = value as Record<string, unknown>;
        for (const key of schema.required ?? []) if (!Object.hasOwn(fields, key)) invalid(`missing '${key}'`);
        for (const [key, field] of Object.entries(fields)) {
            if (!Object.hasOwn(schema.properties, key)) invalid(`unknown parameter '${key}'`);
            validate(schema.properties[key], field, `${path}.${key}`);
        }
    } else if (schema.type === 'array') {
        if (!Array.isArray(value)) invalid('expected an array');
        const values = value as unknown[];
        if (values.length < schema.minItems || values.length > schema.maxItems)
            invalid(`expected ${schema.minItems}-${schema.maxItems} items`);
        values.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`));
    } else if (schema.type === 'number' || schema.type === 'integer') {
        if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < schema.minimum ||
            value > schema.maximum ||
            (schema.type === 'integer' && !Number.isInteger(value)) ||
            (schema.enum && !schema.enum.includes(value))
        )
            invalid('number is outside the allowed range');
    } else if (schema.type === 'string') {
        if (typeof value !== 'string') invalid('expected a string');
        const text = value as string;
        if (
            (schema.minLength && !text.trim()) ||
            text.length > schema.maxLength ||
            (schema.enum && !schema.enum.includes(text))
        )
            invalid('string is outside the allowed values');
    } else if (typeof value !== 'boolean') invalid('expected a boolean');
};

const jsonValue = (value: unknown): unknown => {
    if (value instanceof Vec3) return [value.x, value.y, value.z];
    if (value instanceof Quat) return [value.x, value.y, value.z, value.w];
    if (value instanceof Color) return [value.r, value.g, value.b];
    if (value instanceof BoundingBox) return { min: jsonValue(value.getMin()), max: jsonValue(value.getMax()) };
    if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
    if (Array.isArray(value)) return value.map(jsonValue);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonValue(v)]));
    return value;
};
const requireChange = (input: Input, fields: string[]) => {
    if (!fields.some((key) => input[key] !== undefined))
        throw new EditorError('invalid_input', `Provide at least one of: ${fields.join(', ')}.`);
};

// This registry is also the test seam: it can be exercised without installing
// a browser polyfill or adding a second public execution API to the page.
const createWebMCPTools = (editor: EditorAPI): Tool[] => {
    const tools: Tool[] = [];
    let tail: Promise<unknown> = Promise.resolve();
    const add = <T extends object>(
        name: string,
        description: string,
        properties: Record<string, Schema>,
        required: string[],
        run: (input: T, options: { signal?: AbortSignal }) => unknown | Promise<unknown>,
        annotations: Tool['annotations'] = {},
        render = !annotations.readOnlyHint
    ) => {
        const inputSchema = object(properties, required);
        tools.push({
            name,
            description,
            inputSchema,
            annotations,
            execute: (input, options = {}) => {
                let args: T;
                try {
                    validate(inputSchema, input);
                    args = structuredClone(input) as T;
                } catch (error) {
                    return Promise.resolve({ ok: false, error: { code: 'invalid_input', message: error.message } });
                }
                const execute = async () => {
                    try {
                        checkCancelled(options);
                        if (!annotations.readOnlyHint) editor.viewport.assertIdle();
                        const result = await run(args, options);
                        // Once committed, cancellation must not misreport an edit
                        // as unapplied. Rendering is best-effort after the result.
                        const rendered = render && !(args as Input).preview ? await editor.viewport.ready() : undefined;
                        return {
                            ok: true,
                            ...(jsonValue(result) as Record<string, unknown>),
                            ...(rendered === undefined ? {} : { rendered })
                        };
                    } catch (error) {
                        const code =
                            error instanceof EditorError
                                ? error.code
                                : options.signal?.aborted || error?.name === 'AbortError'
                                  ? 'cancelled'
                                  : 'operation_failed';
                        return { ok: false, error: { code, message: error?.message ?? String(error) } };
                    }
                };
                const pending = tail.then(execute);
                // keep the queue running whether or not the call succeeded
                tail = pending.then(
                    () => {
                        // settled
                    },
                    () => {
                        // settled
                    }
                );
                return pending;
            }
        });
    };
    add(
        'get_scene',
        'Inspect the shared editor: document, layers, active layer, camera, viewport, display settings and global undo/redo. World axes are Y-up, right-handed; units come from the file. Rotations in results are quaternions [x,y,z,w]. Screen coordinates are normalized within viewport.rect, origin top-left. Layer IDs last for this session. total counts live instances; deleted counts removed instances.',
        {
            offset: integer('First layer to return.', 0),
            limit: integer('Maximum layers to return; default 32.', 1, 128)
        },
        [],
        async (i: { offset?: number; limit?: number }, o) => {
            const state = await editor.inspect.scene(o);
            const offset = i.offset ?? 0;
            const end = offset + (i.limit ?? 32);
            return {
                ...state,
                layers: state.layers.slice(offset, end),
                totalLayers: state.layers.length,
                nextOffset: end < state.layers.length ? end : null
            };
        },
        { readOnlyHint: true, untrustedContentHint: true }
    );
    add(
        'get_layer',
        'Inspect one layer, including world bounds and selection bounds. Hidden splats remain in the layer and are exported; deleted splats are excluded.',
        { layer },
        ['layer'],
        async (i: { layer: number }, o) => {
            const info = await editor.inspect.layer(i.layer, o);
            return { layer: info, properties: editor.inspect.properties(info.shBands) };
        },
        { readOnlyHint: true, untrustedContentHint: true }
    );
    add(
        'get_histogram',
        'Read a property distribution without editing. x/y/z and distance are world-space (distance from origin); camera-depth is along the current view. opacity is graded alpha (0-1 normally); scale_0/1/2 are source-axis scales, volume their product, surface-area the sum of their squares. RGB/HSV include committed grades and view-dependent SH; hue is degrees. f_dc_N and f_rest_N are raw source coefficients.',
        { layer, property: string('Data panel property name from get_layer.', 32) },
        ['layer', 'property'],
        (i: { layer: number; property: string }, o) => editor.inspect.histogram(i.layer, i.property, o),
        { readOnlyHint: true }
    );
    add(
        'set_selection',
        'Select all, clear selection or invert it on the named layer. Hidden splats are excluded. Undoable.',
        { layer, mode: enumeration(['all', 'none', 'invert'], 'Selection operation.') },
        ['layer', 'mode'],
        (i: { layer: number; mode: string }, o) => editor.selection[i.mode as 'all' | 'none' | 'invert'](i.layer, o)
    );
    add(
        'select_region',
        'Select or preview splats inside/outside a world-space sphere, ellipsoid or box. Box size and ellipsoid size are full extents; radius is a sphere shorthand. Rotate uses Euler angles in degrees. Cropping: preview/select outside the region to keep, then delete_selection.',
        {
            layer,
            shape: enumeration(['sphere', 'box'], 'Region shape.'),
            center: vector('World-space centre.'),
            size: array(number('Positive extent.', 1e-12), 3, 'Full extents.'),
            radius: number('Sphere radius; use radius or size.', 1e-12),
            rotate: vector('Euler rotation in degrees; default zero.'),
            op,
            outside,
            preview,
            footprint
        },
        ['layer', 'shape', 'center'],
        (
            i: {
                layer: number;
                shape: 'sphere' | 'box';
                center: number[];
                size?: number[];
                radius?: number;
                rotate?: number[];
                op?: SelectionOp;
                outside?: boolean;
                preview?: boolean;
                footprint?: number;
            },
            o
        ) => {
            if ((i.size !== undefined) === (i.radius !== undefined))
                throw new EditorError('invalid_input', 'Provide exactly one of size or radius.');
            if (i.radius !== undefined && i.shape !== 'sphere')
                throw new EditorError('invalid_input', 'radius requires shape sphere.');
            const rotation = i.rotate
                ? new Quat().setFromEulerAngles(...(i.rotate as [number, number, number]))
                : new Quat();
            const size = i.size ? xyz(i.size) : new Vec3(i.radius * 2, i.radius * 2, i.radius * 2);
            return editor.selection.byVolume(
                i.shape,
                new Mat4().setTRS(xyz(i.center), rotation, size),
                i.op ?? 'replace',
                i.layer,
                { ...o, outside: i.outside, preview: i.preview, footprint: i.footprint ?? 0 }
            );
        }
    );
    add(
        'select_rectangle',
        'Select within a normalized viewport rectangle using the specified visibility and footprint. A viewToken is required so an old screenshot cannot silently select from a different view. Visible selection follows the editor depth-pick/peeling behaviour.',
        {
            layer,
            start: point,
            end: point,
            visibility: enumeration(['visible', 'through'], 'Visible surface or through all depths in this layer.'),
            footprint,
            op,
            viewToken
        },
        ['layer', 'start', 'end', 'visibility', 'viewToken'],
        (
            i: {
                layer: number;
                start: ScreenPoint;
                end: ScreenPoint;
                visibility: 'visible' | 'through';
                footprint?: number;
                op?: SelectionOp;
                viewToken: string;
            },
            o
        ) =>
            editor.viewport.selectRect({ start: i.start, end: i.end }, i.op ?? 'replace', {
                ...o,
                layer: i.layer,
                depth: i.visibility === 'visible',
                footprint: i.footprint ?? 0,
                viewToken: i.viewToken
            })
    );
    add(
        'select_property',
        'Select or preview an inclusive range in Data panel property units. Uses the same values as get_histogram, independent of histogram binning. Hidden splats are excluded. Supply viewToken for camera-dependent properties.',
        {
            layer,
            property: string('Data panel property name.', 32),
            min: number('Inclusive minimum.'),
            max: number('Inclusive maximum.'),
            op,
            outside,
            preview,
            viewToken
        },
        ['layer', 'property', 'min', 'max'],
        (
            i: {
                layer: number;
                property: string;
                min: number;
                max: number;
                op?: SelectionOp;
                outside?: boolean;
                preview?: boolean;
                viewToken?: string;
            },
            o
        ) => {
            const mode = propModeFor(i.property);
            if ((mode === 4 || isFinalColorMode(mode)) && !i.viewToken)
                throw new EditorError(
                    'invalid_input',
                    'viewToken is required for camera-dependent properties. Read get_scene or get_histogram first.'
                );
            return editor.selection.byProperty(i.layer, i.property, i.min, i.max, i.op ?? 'replace', {
                ...o,
                outside: i.outside,
                preview: i.preview,
                viewToken: i.viewToken
            });
        }
    );
    for (const [name, method, description] of [
        [
            'delete_selection',
            'delete',
            'Delete selected splats from the named layer. Undoable. Hidden splats are untouched.'
        ],
        [
            'hide_selection',
            'hide',
            'Hide selected splats so they cannot be edited. They remain included in exports. Undoable.'
        ],
        [
            'duplicate_selection',
            'duplicate',
            'Copy selected splats into a new layer, preserving their transforms, colours and SH. Undoable; returns createdLayer.'
        ],
        [
            'separate_selection',
            'separate',
            'Move selected splats into a new layer. Undoable as one edit; returns createdLayer.'
        ]
    ] as const)
        add(name, description, { layer }, ['layer'], (i: { layer: number }, o) => editor.selection[method](i.layer, o));
    add(
        'restore_splats',
        'Restore hidden or deleted splats on one layer. Restoring deleted splats appends missing source splats with their original state; undo is the way to recover the exact deleted edits. Undoable.',
        { layer, what: enumeration(['hidden', 'deleted', 'both'], 'What to restore.') },
        ['layer', 'what'],
        (i: { layer: number; what: 'hidden' | 'deleted' | 'both' }, o) => editor.selection.restore(i.layer, i.what, o)
    );
    add(
        'update_layer',
        'Rename, show/hide, or explicitly activate/deactivate a layer. Rename is undoable; visibility and active layer are session settings. Hidden layers are excluded from export.',
        {
            layer,
            name: string('New display name.', 128),
            visible: boolean('Show the layer.'),
            active: boolean('Make active, or deactivate if currently active.')
        },
        ['layer'],
        (i: { layer: number; name?: string; visible?: boolean; active?: boolean }, o) => {
            requireChange(i, ['name', 'visible', 'active']);
            return editor.layers.update(i.layer, { name: i.name, visible: i.visible, active: i.active }, o);
        }
    );
    add(
        'transform',
        'Apply a world-space translation, Euler rotation and/or uniform scale to an explicit selection or whole layer. Rotation and scale act about its bounds centre unless center is provided. Selection excludes hidden splats; a layer transform moves the entire layer. One undoable edit.',
        {
            layer,
            scope,
            translate: vector('World-space offset.'),
            rotate: vector('World X/Y/Z Euler angles in degrees.'),
            scale: number('Uniform scale multiplier.', 1e-6, 1e6),
            center: vector('World-space rotation/scaling centre.')
        },
        ['layer', 'scope'],
        (
            i: {
                layer: number;
                scope: EditScope;
                translate?: number[];
                rotate?: number[];
                scale?: number;
                center?: number[];
            },
            o
        ) => {
            requireChange(i, ['translate', 'rotate', 'scale']);
            return editor.transform(
                i.layer,
                i.scope,
                {
                    translate: i.translate && xyz(i.translate),
                    rotate: i.rotate && new Quat().setFromEulerAngles(...(i.rotate as [number, number, number])),
                    scale: i.scale,
                    center: i.center && xyz(i.center)
                },
                o
            );
        }
    );
    add(
        'apply_color',
        'Compose a colour adjustment onto the explicit scope using the editor colour panel maths. Repeating the command composes again. Hidden splats are excluded. Omitted parameters are identity values. Undoable.',
        {
            layer,
            scope,
            tint: array(number('RGB multiplier.', 0, 1), 3, 'RGB tint; default [1,1,1].'),
            temperature: number('Temperature offset; default 0.', -0.5, 0.5),
            saturation: number('Saturation multiplier; default 1.', 0, 2),
            brightness: number('Brightness offset; default 0.', -1, 1),
            blackPoint: number('Black point; default 0.', 0, 1),
            whitePoint: number('White point; default 1; greater than blackPoint.', 0, 1),
            opacity: number('Alpha multiplier; default 1. The UI expresses this as stops.', 0, 64)
        },
        ['layer', 'scope'],
        (
            i: {
                layer: number;
                scope: EditScope;
                tint?: number[];
                temperature?: number;
                saturation?: number;
                brightness?: number;
                blackPoint?: number;
                whitePoint?: number;
                opacity?: number;
            },
            o
        ) => {
            requireChange(i, [
                'tint',
                'temperature',
                'saturation',
                'brightness',
                'blackPoint',
                'whitePoint',
                'opacity'
            ]);
            return editor.color.apply(
                {
                    tintClr: color(i.tint ?? [1, 1, 1]),
                    temperature: i.temperature ?? 0,
                    saturation: i.saturation ?? 1,
                    brightness: i.brightness ?? 0,
                    blackPoint: i.blackPoint ?? 0,
                    whitePoint: i.whitePoint ?? 1,
                    transparency: i.opacity ?? 1
                },
                i.layer,
                i.scope,
                o
            );
        }
    );
    add(
        'reset_color',
        'Remove committed colour adjustments from the explicit scope, restoring original colours. Hidden splats are excluded. Undoable.',
        { layer, scope },
        ['layer', 'scope'],
        (i: { layer: number; scope: EditScope }, o) => editor.color.reset(i.layer, i.scope, o)
    );
    add(
        'undo',
        'Undo one entry in the shared editor history, including edits made by the user. Returns changed=false when nothing can be undone.',
        {},
        [],
        (_, o) => editor.history.undo(o)
    );
    add(
        'redo',
        'Redo one entry in the shared editor history. Returns changed=false when nothing can be redone.',
        {},
        [],
        (_, o) => editor.history.redo(o)
    );
    add(
        'set_camera',
        'Set an instant camera pose using position+target, or a named view/orbit parameters. Y-up; azimuth 0 views from +Z, 90 from +X; positive elevation is above target. Orbit distance 1 frames the scene. Returns the resulting pose and viewToken.',
        {
            position: vector('World position; requires target.'),
            target: vector('World look-at point; requires position.'),
            view: enumeration(
                ['front', 'back', 'left', 'right', 'top', 'bottom'],
                'Named view around the current target.'
            ),
            azimuth: number('Orbit azimuth in degrees.', -360000, 360000),
            elevation: number('Orbit elevation in degrees.', -90, 90),
            distance: number('Orbit distance relative to scene size.', 1e-6, 10),
            fov: number('Field of view in degrees.', 5, 170),
            orthographic: boolean('Orthographic projection.')
        },
        [],
        (
            i: {
                position?: number[];
                target?: number[];
                view?: CameraSettings['view'];
                azimuth?: number;
                elevation?: number;
                distance?: number;
                fov?: number;
                orthographic?: boolean;
            },
            o
        ) => {
            requireChange(i, ['position', 'view', 'azimuth', 'elevation', 'distance', 'fov', 'orthographic']);
            return editor.viewport.setCamera(
                { ...i, position: i.position && xyz(i.position), target: i.target && xyz(i.target) },
                o
            );
        }
    );
    add(
        'focus_camera',
        'Frame a selection, a layer, or the scene. Switches to orbit control and moves instantly. Returns the resulting camera and viewToken.',
        { scope: enumeration(['selection', 'layer', 'scene'], 'What to frame.'), layer },
        ['scope'],
        (i: { scope: 'selection' | 'layer' | 'scene'; layer?: number }, o) => {
            if (i.scope !== 'scene' && i.layer === undefined)
                throw new EditorError('invalid_input', 'layer is required for this scope.');
            return editor.viewport.focus(i.scope, i.layer, o);
        }
    );
    add(
        'pick_points',
        'Find the surface under viewport points using the editor depth picker. Returns world positions and layer IDs, or null for misses. Does not alter selection.',
        {
            points: { type: 'array', items: point, minItems: 1, maxItems: 64 },
            layers: { type: 'array', items: layer, minItems: 1, maxItems: 128 },
            viewToken
        },
        ['points', 'viewToken'],
        async (i: { points: ScreenPoint[]; layers?: number[]; viewToken: string }, o) => ({
            hits: await editor.viewport.pickDepth(i.points, i.layers, { ...o, viewToken: i.viewToken })
        }),
        { readOnlyHint: true }
    );
    add(
        'set_view',
        'Set viewport display options without changing splat data. These follow the editor preference controls.',
        {
            background: array(number('Channel', 0, 1), 3, 'RGB background.'),
            showGrid: boolean('Show grid.'),
            shBands: integer('Rendered SH bands.', 0, 3),
            tonemapping: enumeration(['linear', 'neutral', 'aces', 'aces2', 'filmic', 'hejl'], 'Tone mapping.'),
            showGaussians: boolean('Show splats.'),
            showCenters: boolean('Show centres.'),
            showRings: boolean('Show footprints.'),
            selectionColor: boolean('Tint selection.'),
            selectionCenters: boolean('Show selection centres.'),
            selectionRings: boolean('Show selection rings.')
        },
        [],
        (
            i: {
                background?: number[];
                showGrid?: boolean;
                shBands?: number;
                tonemapping?: string;
                showGaussians?: boolean;
                showCenters?: boolean;
                showRings?: boolean;
                selectionColor?: boolean;
                selectionCenters?: boolean;
                selectionRings?: boolean;
            },
            o
        ) => {
            if (!Object.keys(i).length) throw new EditorError('invalid_input', 'Provide a display setting.');
            return editor.viewport.setView({ ...i, background: i.background && color(i.background) }, o);
        }
    );
    add(
        'get_timeline',
        'Inspect the timeline: length in frames, frame rate, duration in seconds, playhead, playback, path smoothness, looping, and camera keyframes sorted by frame. Keys at or beyond frames are kept but do not play (inRange false). While keys exist the camera follows the animation at the playhead.',
        {
            offset: integer('First key to return.', 0),
            limit: integer('Maximum keys to return; default 128.', 1, 1024)
        },
        [],
        async (i: { offset?: number; limit?: number }, o) => {
            const timeline = await editor.inspect.timeline(o);
            const offset = i.offset ?? 0;
            const end = offset + (i.limit ?? 128);
            return {
                ...timeline,
                keys: timeline.keys.slice(offset, end),
                nextOffset: end < timeline.keys.length ? end : null
            };
        },
        { readOnlyHint: true }
    );
    add(
        'set_timeline',
        'Change timeline settings and the playhead as the timeline panel does. Settings apply before frame; moving the playhead during playback continues from there. With keys the camera follows the animation, so this returns the resulting camera and viewToken. Saved with the document but not undoable. Playback moves the camera every tick: pause before view-dependent tools.',
        {
            frames: integer('Timeline length in frames.', 1, 10000),
            frameRate: { type: 'integer', enum: [1, 6, 12, 24, 30, 60], description: 'Frames per second.' },
            smoothness: number('Camera path smoothness: 0 is linear, 1 smoothest.', 0, 1),
            loop: boolean('Loop the camera path; otherwise the first and last keys hold.'),
            frame: integer('Playhead frame, below frames.', 0, 9999),
            playing: boolean('Start or pause playback.')
        },
        [],
        (i: TimelineSettings, o) => {
            requireChange(i, ['frames', 'frameRate', 'smoothness', 'loop', 'frame', 'playing']);
            return editor.timeline.update(i, o);
        }
    );
    add(
        'set_keyframes',
        "Add or replace camera keyframes as one undoable edit. Give position with target, and fov in degrees; omitted fields are captured from the current camera, like the panel's Add Key. Frames must be below the timeline length; unchanged keys are skipped. The camera then follows the animation at the playhead, so this returns the resulting camera and viewToken.",
        {
            keys: {
                type: 'array',
                items: object(
                    {
                        frame: integer('Key frame, below the timeline length.', 0, 9999),
                        position: vector('Camera world position; requires target.'),
                        target: vector('World look-at point; requires position.'),
                        fov: number('Field of view in degrees.', 5, 170)
                    },
                    ['frame']
                ),
                minItems: 1,
                maxItems: 1024,
                description: 'Keys to write; each frame at most once.'
            }
        },
        ['keys'],
        (i: { keys: { frame: number; position?: number[]; target?: number[]; fov?: number }[] }, o) =>
            editor.timeline.setKeys(
                i.keys.map((k) => ({
                    frame: k.frame,
                    position: k.position && xyz(k.position),
                    target: k.target && xyz(k.target),
                    fov: k.fov
                })),
                o
            )
    );
    add(
        'move_keyframe',
        'Move or copy one camera keyframe to another frame, replacing any key there (reported as replaced). Keys stranded beyond the timeline end can be moved back into range. Undoable.',
        {
            from: integer('Frame of the existing key.'),
            to: integer('Destination frame, below the timeline length.', 0, 9999),
            copy: boolean('Keep the original key; default false.')
        },
        ['from', 'to'],
        (i: { from: number; to: number; copy?: boolean }, o) => editor.timeline.moveKey(i.from, i.to, i.copy, o)
    );
    add(
        'delete_keyframes',
        'Delete camera keyframes at the given frames as one undoable edit. Every frame must hold a key, otherwise nothing changes.',
        { frames: { type: 'array', items: integer('Key frame.'), minItems: 1, maxItems: 1024 } },
        ['frames'],
        (i: { frames: number[] }, o) => editor.timeline.deleteKeys(i.frames, o)
    );
    add(
        'import_url',
        'Import a model from a CORS-enabled HTTP(S) URL as a new layer. Existing layers are kept. Supports PLY, SPLAT, SOG, SPZ and KSPLAT. Optional LOD index; otherwise uses the loader recommended LOD. Import is undoable.',
        {
            url: string('Absolute HTTP(S) model URL.', 4096),
            filename: string('Filename with format extension; defaults to URL path.', 256),
            lod: integer('LOD index, if the source has multiple LODs.', 0, 255)
        },
        ['url'],
        (i: { url: string; filename?: string; lod?: number }, o) =>
            editor.files.importUrl(i.url, i.filename, { ...o, lod: i.lod }),
        { untrustedContentHint: true }
    );
    add(
        'export_scene',
        'Export selected splats, one layer, or all visible layers through the editor exporters. Hidden splats are included; deleted splats are excluded. Requests a browser download, not a guaranteed filesystem save. Source SH bands are preserved unless shBands is specified.',
        {
            format: enumeration(
                ['ply', 'compressed-ply', 'splat', 'sog', 'spz', 'viewer-html', 'viewer-zip'],
                'Output format.'
            ),
            filename: string('Download filename with matching extension.', 256),
            scope: enumeration(['selection', 'layer', 'visible_layers'], 'Export scope.'),
            layer,
            shBands: integer('Output SH bands.', 0, 3),
            sogIterations: integer('SOG compression iterations; default 10.', 1, 100),
            spzVersion: integer('SPZ version, 3 or 4; default 4.', 3, 4)
        },
        ['format', 'filename', 'scope'],
        (
            i: {
                format: string;
                filename: string;
                scope: 'selection' | 'layer' | 'visible_layers';
                layer?: number;
                shBands?: number;
                sogIterations?: number;
                spzVersion?: number;
            },
            o
        ) => {
            if (/[\\/:*?"<>|]/.test(i.filename) || i.filename === '.' || i.filename === '..')
                throw new EditorError('invalid_input', 'filename must be a filename without path separators.');
            if (i.scope !== 'visible_layers' && i.layer === undefined)
                throw new EditorError('invalid_input', 'layer is required for this scope.');
            if (i.scope === 'visible_layers' && i.layer !== undefined)
                throw new EditorError('invalid_input', 'Omit layer when exporting visible_layers.');
            const ext =
                i.format === 'compressed-ply'
                    ? 'ply'
                    : i.format === 'viewer-html'
                      ? 'html'
                      : i.format === 'viewer-zip'
                        ? 'zip'
                        : i.format;
            if (!i.filename.toLowerCase().endsWith(`.${ext}`))
                throw new EditorError('invalid_input', `filename must end in .${ext}`);
            return editor.files.export(i as Parameters<EditorAPI['files']['export']>[0], o);
        },
        { consequentialHint: true },
        false
    );
    return tools;
};

// Keep the evolving browser surface isolated. Feature detection leaves the
// editor usable in browsers without WebMCP. The navigator location supports
// existing preview browsers; document is the current specification location.
const registerWebMCP = (editor: EditorAPI, context?: ModelContext) => {
    const provider =
        context ??
        (document as Document & { modelContext?: ModelContext }).modelContext ??
        (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
    if (!provider?.registerTool) {
        return () => {
            // nothing to unregister
        };
    }
    const tools = createWebMCPTools(editor);
    let controller: AbortController;
    let disposed = false;
    let registration = Promise.resolve();
    const unbind = i18n.onChange(() => {
        registration = registration
            .then(async () => {
                if (disposed) return;
                controller?.abort();
                controller = new AbortController();
                const results = await Promise.allSettled(
                    tools.map((tool) =>
                        Promise.resolve().then(() =>
                            provider.registerTool(
                                { ...tool, title: i18n.t(`webmcp.${tool.name}`) },
                                { signal: controller.signal }
                            )
                        )
                    )
                );
                const failed = results.find((r) => r.status === 'rejected');
                if (failed) {
                    controller.abort();
                    console.warn('WebMCP registration failed', (failed as PromiseRejectedResult).reason);
                }
            })
            .catch((error) => console.warn('WebMCP registration failed', error));
    });
    return () => {
        disposed = true;
        unbind();
        controller?.abort();
    };
};

export { createWebMCPTools, registerWebMCP };
export type { Tool, ModelContext };
