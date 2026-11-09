import { BoundingBox, Color, Mat4, Quat, Vec3 } from 'playcanvas';

import type { EditorAPI } from './editor-api';
import { checkCancelled, EditorError } from './editor-command';
import { GENERATOR_MAX_COUNT, GENERATOR_TIMEOUT_MS } from './generator-sandbox';
import { isFinalColorMode, propModeFor } from './splat-properties';
import { i18n } from './ui/localization';

type Schema = {
    type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
    description?: string;
    properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean;
    items?: Schema; minItems?: number; maxItems?: number;
    minimum?: number; maximum?: number; minLength?: number; maxLength?: number; enum?: readonly string[];
};
type Input = Record<string, any>;
type Tool = {
    name: string; description: string; inputSchema: Schema;
    annotations?: { readOnlyHint?: boolean, untrustedContentHint?: boolean, consequentialHint?: boolean };
    execute(input: unknown, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
};
type ModelContext = {
    registerTool(tool: Tool & { title: string }, options: { signal: AbortSignal }): void | Promise<void>;
};

const number = (description: string, minimum = -1e30, maximum = 1e30): Schema => ({ type: 'number', description, minimum, maximum });
const integer = (description: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): Schema => ({ type: 'integer', description, minimum, maximum });
const boolean = (description: string): Schema => ({ type: 'boolean', description });
const string = (description: string, maxLength = 256): Schema => ({ type: 'string', description, minLength: 1, maxLength });
const enumeration = (values: readonly string[], description: string): Schema => ({ type: 'string', enum: values, description });
const array = (items: Schema, count: number, description: string): Schema => ({ type: 'array', items, minItems: count, maxItems: count, description });
const vector = (description: string) => array(number('Component'), 3, description);
const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: 'object', properties, required, additionalProperties: false });
const layer = integer('Session layer ID from get_scene. Naming a layer does not activate it.');
const scope = enumeration(['selection', 'layer'], 'Explicit edit scope. An empty selection is an error; it never expands to the layer.');
const op = enumeration(['replace', 'add', 'subtract', 'intersect'], 'Combine with current selection; default replace.');
const preview = boolean('Return matching count and world bounds without changing selection or history.');
const outside = boolean('Match outside the region or range; default false.');
const footprint = number('0 tests centres; values up to 1 test that fraction of the splat footprint. Default 0.', 0, 1);
const viewToken = string('viewToken from get_scene or a camera tool. Rejects if camera or viewport has changed.', 64);
const point = object({ x: number('Viewport x, left to right.', 0, 1), y: number('Viewport y, top to bottom.', 0, 1) }, ['x', 'y']);
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
        if (values.length < schema.minItems || values.length > schema.maxItems) invalid(`expected ${schema.minItems}-${schema.maxItems} items`);
        values.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`));
    } else if (schema.type === 'number' || schema.type === 'integer') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < schema.minimum || value > schema.maximum ||
            (schema.type === 'integer' && !Number.isInteger(value))) invalid('number is outside the allowed range');
    } else if (schema.type === 'string') {
        if (typeof value !== 'string') invalid('expected a string');
        const text = value as string;
        if ((schema.minLength && !text.trim()) || text.length > schema.maxLength || (schema.enum && !schema.enum.includes(text))) invalid('string is outside the allowed values');
    } else if (typeof value !== 'boolean') invalid('expected a boolean');
};

const jsonValue = (value: any): any => {
    if (value instanceof Vec3) return [value.x, value.y, value.z];
    if (value instanceof Quat) return [value.x, value.y, value.z, value.w];
    if (value instanceof Color) return [value.r, value.g, value.b];
    if (value instanceof BoundingBox) return { min: jsonValue(value.getMin()), max: jsonValue(value.getMax()) };
    if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
    if (Array.isArray(value)) return value.map(jsonValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonValue(v)]));
    return value;
};
const requireChange = (input: Input, fields: string[]) => {
    if (!fields.some(key => input[key] !== undefined)) throw new EditorError('invalid_input', `Provide at least one of: ${fields.join(', ')}.`);
};

// This registry is also the test seam: it can be exercised without installing
// a browser polyfill or adding a second public execution API to the page.
const createWebMCPTools = (editor: EditorAPI): Tool[] => {
    const tools: Tool[] = [];
    let tail: Promise<unknown> = Promise.resolve();
    const add = (name: string, description: string, properties: Record<string, Schema>, required: string[],
        run: (input: Input, options: { signal?: AbortSignal }) => unknown | Promise<unknown>,
        annotations: Tool['annotations'] = {}, render = !annotations.readOnlyHint) => {
        const inputSchema = object(properties, required);
        tools.push({
            name,
            description,
            inputSchema,
            annotations,
            execute: (input, options = {}) => {
                let args: Input;
                try {
                    validate(inputSchema, input);
                    args = structuredClone(input) as Input;
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
                        const rendered = render && !args.preview ? await editor.viewport.ready() : undefined;
                        return { ok: true, ...jsonValue(result), ...(rendered === undefined ? {} : { rendered }) };
                    } catch (error) {
                        const code = error instanceof EditorError ? error.code : options.signal?.aborted || error?.name === 'AbortError' ? 'cancelled' : 'operation_failed';
                        return { ok: false, error: { code, message: error?.message ?? String(error) } };
                    }
                };
                const pending = tail.then(execute);
                tail = pending.then(() => {}, () => {});
                return pending;
            }
        });
    };
    add('get_scene', 'Inspect the shared editor: document, layers, active layer, camera, viewport, display settings and global undo/redo. World axes are Y-up, right-handed; units come from the file. Rotations in results are quaternions [x,y,z,w]. Screen coordinates are normalized within viewport.rect, origin top-left. Layer IDs last for this session. total counts live instances; deleted counts removed instances.',
        { offset: integer('First layer to return.', 0), limit: integer('Maximum layers to return; default 32.', 1, 128) }, [],
        async (i, o) => {
            const state = await editor.inspect.scene(o);
            const offset = i.offset ?? 0;
            const end = offset + (i.limit ?? 32);
            return { ...state, layers: state.layers.slice(offset, end), totalLayers: state.layers.length, nextOffset: end < state.layers.length ? end : null };
        }, { readOnlyHint: true, untrustedContentHint: true });
    add('get_layer', 'Inspect one layer, including world bounds and selection bounds. Hidden splats remain in the layer and are exported; deleted splats are excluded.',
        { layer }, ['layer'], async (i, o) => {
            const info = await editor.inspect.layer(i.layer, o);
            return { layer: info, properties: editor.inspect.properties(info.shBands) };
        }, { readOnlyHint: true, untrustedContentHint: true });
    add('get_histogram', 'Read a property distribution without editing. Returns equal-width bins over [min, max], split into selected and unselected counts, plus stats (count, mean and p1/p5/p25/p50/p75/p95/p99, accurate to one bin width) for all splats and for the selection. Use the percentiles to choose select_property thresholds, and range to zoom into a tail (values outside it are excluded). Hidden splats are excluded. x/y/z and distance are world-space (distance from origin); camera-depth is along the current view. opacity is graded alpha (0-1 normally); scale_0/1/2 are source-axis scales, volume their product, surface-area the sum of their squares. RGB/HSV include committed grades and view-dependent SH; hue is degrees. f_dc_N and f_rest_N are raw source coefficients.',
        { layer,
            property: string('Data panel property name from get_layer.', 32),
            range: array(number('Bound'), 2, '[min, max] to bin instead of the measured range; min < max.'),
            bins: integer('Number of bins: 8, 16, 32, 64, 128 or 256 (default).', 8, 256) }, ['layer', 'property'],
        (i, o) => {
            if (i.bins !== undefined && 256 % i.bins) throw new EditorError('invalid_input', 'bins must be 8, 16, 32, 64, 128 or 256.');
            return editor.inspect.histogram(i.layer, i.property, { ...o, range: i.range, bins: i.bins });
        }, { readOnlyHint: true });
    add('set_selection', 'Select all, clear selection or invert it on the named layer. Hidden splats are excluded. Undoable.',
        { layer, mode: enumeration(['all', 'none', 'invert'], 'Selection operation.') }, ['layer', 'mode'],
        (i, o) => editor.selection[i.mode as 'all' | 'none' | 'invert'](i.layer, o));
    add('select_region', 'Select or preview splats inside/outside a world-space sphere, ellipsoid or box. Box size and ellipsoid size are full extents; radius is a sphere shorthand. Rotate uses Euler angles in degrees. Cropping: preview/select outside the region to keep, then delete_selection.',
        { layer, shape: enumeration(['sphere', 'box'], 'Region shape.'), center: vector('World-space centre.'), size: array(number('Positive extent.', 1e-12), 3, 'Full extents.'), radius: number('Sphere radius; use radius or size.', 1e-12), rotate: vector('Euler rotation in degrees; default zero.'), op, outside, preview, footprint },
        ['layer', 'shape', 'center'], (i, o) => {
            if ((i.size !== undefined) === (i.radius !== undefined)) throw new EditorError('invalid_input', 'Provide exactly one of size or radius.');
            if (i.radius !== undefined && i.shape !== 'sphere') throw new EditorError('invalid_input', 'radius requires shape sphere.');
            const rotation = i.rotate ? new Quat().setFromEulerAngles(...i.rotate as [number, number, number]) : new Quat();
            const size = i.size ? xyz(i.size) : new Vec3(i.radius * 2, i.radius * 2, i.radius * 2);
            return editor.selection.byVolume(i.shape, new Mat4().setTRS(xyz(i.center), rotation, size), i.op ?? 'replace', i.layer,
                { ...o, outside: i.outside, preview: i.preview, footprint: i.footprint ?? 0 });
        });
    add('select_rectangle', 'Select within a normalized viewport rectangle using the specified visibility and footprint. A viewToken is required so an old screenshot cannot silently select from a different view. Visible selection follows the editor depth-pick/peeling behaviour.',
        { layer, start: point, end: point, visibility: enumeration(['visible', 'through'], 'Visible surface or through all depths in this layer.'), footprint, op, viewToken },
        ['layer', 'start', 'end', 'visibility', 'viewToken'], (i, o) => editor.viewport.selectRect({ start: i.start, end: i.end }, i.op ?? 'replace',
            { ...o, layer: i.layer, depth: i.visibility === 'visible', footprint: i.footprint ?? 0, viewToken: i.viewToken }));
    add('select_property', 'Select or preview an inclusive range in Data panel property units. Uses the same values as get_histogram, independent of histogram binning. Hidden splats are excluded. Supply viewToken for camera-dependent properties.',
        { layer, property: string('Data panel property name.', 32), min: number('Inclusive minimum.'), max: number('Inclusive maximum.'), op, outside, preview, viewToken },
        ['layer', 'property', 'min', 'max'], (i, o) => {
            const mode = propModeFor(i.property);
            if ((mode === 4 || isFinalColorMode(mode)) && !i.viewToken) throw new EditorError('invalid_input', 'viewToken is required for camera-dependent properties. Read get_scene or get_histogram first.');
            return editor.selection.byProperty(i.layer, i.property, i.min, i.max, i.op ?? 'replace',
                { ...o, outside: i.outside, preview: i.preview, viewToken: i.viewToken });
        });
    for (const [name, method, description] of [
        ['delete_selection', 'delete', 'Delete selected splats from the named layer. Undoable. Hidden splats are untouched.'],
        ['hide_selection', 'hide', 'Hide selected splats so they cannot be edited. They remain included in exports. Undoable.'],
        ['duplicate_selection', 'duplicate', 'Copy selected splats into a new layer, preserving their transforms, colours and SH. Undoable; returns createdLayer.'],
        ['separate_selection', 'separate', 'Move selected splats into a new layer. Undoable as one edit; returns createdLayer.']
    ] as const) add(name, description, { layer }, ['layer'], (i, o) => editor.selection[method](i.layer, o));
    add('restore_splats', 'Restore hidden or deleted splats on one layer. Restoring deleted splats appends missing source splats with their original state; undo is the way to recover the exact deleted edits. Undoable.',
        { layer, what: enumeration(['hidden', 'deleted', 'both'], 'What to restore.') }, ['layer', 'what'], (i, o) => editor.selection.restore(i.layer, i.what, o));
    add('update_layer', 'Rename, show/hide, or explicitly activate/deactivate a layer. Rename is undoable; visibility and active layer are session settings. Hidden layers are excluded from export.',
        { layer, name: string('New display name.', 128), visible: boolean('Show the layer.'), active: boolean('Make active, or deactivate if currently active.') }, ['layer'],
        (i, o) => {
            requireChange(i, ['name', 'visible', 'active']); return editor.layers.update(i.layer, { name: i.name, visible: i.visible, active: i.active }, o);
        });
    add('transform', 'Apply a world-space translation, Euler rotation and/or uniform scale to an explicit selection or whole layer. Rotation and scale act about its bounds centre unless center is provided. Selection excludes hidden splats; a layer transform moves the entire layer. One undoable edit.',
        { layer, scope, translate: vector('World-space offset.'), rotate: vector('World X/Y/Z Euler angles in degrees.'), scale: number('Uniform scale multiplier.', 1e-6, 1e6), center: vector('World-space rotation/scaling centre.') },
        ['layer', 'scope'], (i, o) => {
            requireChange(i, ['translate', 'rotate', 'scale']);
            return editor.transform(i.layer, i.scope, {
                translate: i.translate && xyz(i.translate),
                rotate: i.rotate && new Quat().setFromEulerAngles(...i.rotate as [number, number, number]),
                scale: i.scale,
                center: i.center && xyz(i.center)
            }, o);
        });
    add('apply_color', 'Compose a colour adjustment onto the explicit scope using the editor colour panel maths. Repeating the command composes again. Hidden splats are excluded. Omitted parameters are identity values. Undoable.',
        { layer,
            scope,
            tint: array(number('RGB multiplier.', 0, 1), 3, 'RGB tint; default [1,1,1].'),
            temperature: number('Temperature offset; default 0.', -0.5, 0.5),
            saturation: number('Saturation multiplier; default 1.', 0, 2),
            brightness: number('Brightness offset; default 0.', -1, 1),
            blackPoint: number('Black point; default 0.', 0, 1),
            whitePoint: number('White point; default 1; greater than blackPoint.', 0, 1),
            opacity: number('Alpha multiplier; default 1. The UI expresses this as stops.', 0, 64) }, ['layer', 'scope'],
        (i, o) => {
            requireChange(i, ['tint', 'temperature', 'saturation', 'brightness', 'blackPoint', 'whitePoint', 'opacity']);
            return editor.color.apply({
                tintClr: color(i.tint ?? [1, 1, 1]),
                temperature: i.temperature ?? 0,
                saturation: i.saturation ?? 1,
                brightness: i.brightness ?? 0,
                blackPoint: i.blackPoint ?? 0,
                whitePoint: i.whitePoint ?? 1,
                transparency: i.opacity ?? 1
            }, i.layer, i.scope, o);
        });
    add('reset_color', 'Remove committed colour adjustments from the explicit scope, restoring original colours. Hidden splats are excluded. Undoable.',
        { layer, scope }, ['layer', 'scope'], (i, o) => editor.color.reset(i.layer, i.scope, o));
    add('undo', 'Undo one entry in the shared editor history, including edits made by the user. Returns changed=false when nothing can be undone.', {}, [], (_, o) => editor.history.undo(o));
    add('redo', 'Redo one entry in the shared editor history. Returns changed=false when nothing can be redone.', {}, [], (_, o) => editor.history.redo(o));
    add('set_camera', 'Set an instant camera pose using position+target, or a named view/orbit parameters. Y-up; azimuth 0 views from +Z, 90 from +X; positive elevation is above target. Orbit distance 1 frames the scene. Returns the resulting pose and viewToken.',
        { position: vector('World position; requires target.'),
            target: vector('World look-at point; requires position.'),
            view: enumeration(['front', 'back', 'left', 'right', 'top', 'bottom'], 'Named view around the current target.'),
            azimuth: number('Orbit azimuth in degrees.', -360000, 360000),
            elevation: number('Orbit elevation in degrees.', -90, 90),
            distance: number('Orbit distance relative to scene size.', 1e-6, 10),
            fov: number('Field of view in degrees.', 5, 170),
            orthographic: boolean('Orthographic projection.') }, [],
        (i, o) => {
            requireChange(i, ['position', 'view', 'azimuth', 'elevation', 'distance', 'fov', 'orthographic']);
            return editor.viewport.setCamera({ ...i, position: i.position && xyz(i.position), target: i.target && xyz(i.target) }, o);
        });
    add('render_view', 'Render an image of the scene to check your work, without moving the user\'s view: the camera is restored afterwards. Camera parameters work as in set_camera and default to the current view. No grid, gizmos or markers are drawn. mode "selection" shows the selection on every layer in orange with everything else grey: check it before deleting. mode "property" colours splats by a histogram property (blue = range min, red = max, grey = outside range; faint splats are boosted so they show), defaulting to the measured range: use it to see where floaters or oversized splats are. mode "layers" gives each layer a flat colour. views renders up to four labelled views in one 2x2 image (e.g. ["current","front","right","top"]) to judge 3D layout. Returns image { type: "image", mimeType, data (base64), width, height }, the camera (or cameras per view) and, for analysis modes, a legend; pass a camera to set_camera before screen-space selection. Default size is 512 px on the longest side at the viewport aspect; keep images small, as the result is returned as text.',
        { position: vector('World position; requires target.'),
            target: vector('World look-at point; requires position.'),
            view: enumeration(['front', 'back', 'left', 'right', 'top', 'bottom'], 'Named view around the current target.'),
            azimuth: number('Orbit azimuth in degrees.', -360000, 360000),
            elevation: number('Orbit elevation in degrees.', -90, 90),
            distance: number('Orbit distance relative to scene size.', 1e-6, 10),
            fov: number('Field of view in degrees.', 5, 170),
            orthographic: boolean('Orthographic projection.'),
            width: integer('Image width in pixels.', 16, 2048),
            height: integer('Image height in pixels.', 16, 2048),
            format: enumeration(['jpeg', 'png'], 'Image format; default jpeg.'),
            quality: number('JPEG quality; default 0.85.', 0.1, 1),
            mode: enumeration(['color', 'selection', 'property', 'layers'], 'What to show; default color.'),
            property: string('Property for mode property: x, y, z, distance, camera-depth, red, green, blue, opacity, scale_0..2, volume or surface-area.', 32),
            range: array(number('Bound'), 2, '[min, max] for mode property; default the measured range of visible layers.'),
            views: { type: 'array', items: enumeration(['current', 'front', 'back', 'left', 'right', 'top', 'bottom'], 'View: current uses the camera parameters; named views orbit its target.'), minItems: 1, maxItems: 4, description: 'Views to render into one labelled grid; default ["current"]. width and height size the whole grid.' } }, [],
        (i, o) => editor.viewport.render({ ...i, position: i.position && xyz(i.position), target: i.target && xyz(i.target) }, o),
        { readOnlyHint: true });
    add('focus_camera', 'Frame a selection, a layer, or the scene. Switches to orbit control and moves instantly. Returns the resulting camera and viewToken.',
        { scope: enumeration(['selection', 'layer', 'scene'], 'What to frame.'), layer }, ['scope'], (i, o) => {
            if (i.scope !== 'scene' && i.layer === undefined) throw new EditorError('invalid_input', 'layer is required for this scope.');
            return editor.viewport.focus(i.scope, i.layer, o);
        });
    add('pick_points', 'Find the surface under viewport points using the editor depth picker. Returns world positions and layer IDs, or null for misses. Does not alter selection.',
        { points: { type: 'array', items: point, minItems: 1, maxItems: 64 }, layers: { type: 'array', items: layer, minItems: 1, maxItems: 128 }, viewToken },
        ['points', 'viewToken'], async (i, o) => ({ hits: await editor.viewport.pickDepth(i.points, i.layers, { ...o, viewToken: i.viewToken }) }), { readOnlyHint: true });
    add('set_view', 'Set viewport display options without changing splat data. These follow the editor preference controls.',
        { background: array(number('Channel', 0, 1), 3, 'RGB background.'),
            showGrid: boolean('Show grid.'),
            shBands: integer('Rendered SH bands.', 0, 3),
            tonemapping: enumeration(['linear', 'neutral', 'aces', 'aces2', 'filmic', 'hejl'], 'Tone mapping.'),
            showGaussians: boolean('Show splats.'),
            showCenters: boolean('Show centres.'),
            showRings: boolean('Show footprints.'),
            selectionColor: boolean('Tint selection.'),
            selectionCenters: boolean('Show selection centres.'),
            selectionRings: boolean('Show selection rings.') }, [],
        (i, o) => {
            if (!Object.keys(i).length) throw new EditorError('invalid_input', 'Provide a display setting.');
            return editor.viewport.setView({ ...i, background: i.background && color(i.background) }, o);
        });
    add('import_url', 'Import a model from a CORS-enabled HTTP(S) URL as a new layer. Existing layers are kept. Supports PLY, SPLAT, SOG, SPZ and KSPLAT. Optional LOD index; otherwise uses the loader recommended LOD. Import is undoable.',
        { url: string('Absolute HTTP(S) model URL.', 4096), filename: string('Filename with format extension; defaults to URL path.', 256), lod: integer('LOD index, if the source has multiple LODs.', 0, 255) }, ['url'],
        (i, o) => editor.files.importUrl(i.url, i.filename, { ...o, lod: i.lod }), { untrustedContentHint: true });
    const rgb = (description: string) => array(number('Channel', 0, 1), 3, description);
    const layerName = string('Layer name.', 128);
    const reuse = 'To place an object several times, create it once and use instance_layer.';
    const part = object({ shape: enumeration(['sphere', 'box', 'plane', 'cylinder', 'cone'], 'Primitive shape.'),
        center: vector('World-space centre.'),
        size: array(number('Positive extent.', 1e-6, 1e6), 3, 'Full extents.'),
        rotate: vector('Euler rotation in degrees; default zero.'),
        fill: enumeration(['surface', 'volume'], 'Sample the surface or the interior; default surface. Planes are surface only.'),
        count: integer('Number of gaussians; default 20000.', 1, 1000000),
        color: rgb('RGB colour; default [1,1,1].'),
        opacity: number('Opacity; default 1.', 0, 1),
        splatSize: number('Gaussian standard deviation in world units; derived from sample spacing when omitted.', 1e-9, 1e9) }, ['shape', 'center', 'size']);
    add('create_primitives', `Create one new layer from one or more primitive shapes sampled evenly in the editor, so a multi-part object (e.g. a tree: trunk cylinder plus cone canopy) is a single layer. size is the full extent along local X/Y/Z; cylinders and cones run along local Y with the cone apex at +Y; planes lie in local XZ (size Y is ignored). Surface fill uses flat splats facing outward; volume fill uses round splats. Colour is flat and unlit. ${reuse} Undoable; returns createdLayer.`,
        { parts: { type: 'array', items: part, minItems: 1, maxItems: 64, description: 'Shapes to combine; at most 2000000 gaussians in total.' }, name: layerName }, ['parts'], (i, o) => {
            const parts = (i.parts as Input[]).map((p, index) => {
                if (p.shape === 'plane' && p.fill === 'volume') throw new EditorError('invalid_input', `input.parts[${index}]: a plane has no volume; use fill surface.`);
                return {
                    shape: p.shape,
                    center: xyz(p.center),
                    size: xyz(p.size),
                    rotation: p.rotate ? new Quat().setFromEulerAngles(...p.rotate as [number, number, number]) : new Quat(),
                    fill: p.fill ?? 'surface',
                    count: p.count ?? 20000,
                    color: p.color ?? [1, 1, 1],
                    opacity: p.opacity ?? 1,
                    splatSize: p.splatSize
                };
            });
            if (parts.reduce((n, p) => n + p.count, 0) > GENERATOR_MAX_COUNT) throw new EditorError('invalid_input', `At most ${GENERATOR_MAX_COUNT} gaussians in total.`);
            return editor.create.primitives(parts, i.name, o);
        });
    add('create_from_generator', `Create one new layer by running a splat-transform generator module in the editor. Use this for procedural or computed content instead of sending gaussians as data. source is an ES module exporting class Generator with static create(params) (may be async) returning { count, columnNames, getRow(index, row) }; getRow fills row[name] for every column. params arrive as [{name, value}] with string values, as in the splat-transform CLI. Required columns, in world space: x, y, z; scale_0..2 = ln(standard deviation); rot_0..3 = quaternion w, x, y, z; f_dc_0..2 = (rgb - 0.5) / 0.28209479177387814; opacity = logit(alpha). Optional f_rest_* add SH. The module runs in an isolated sandbox with no DOM, storage or network, a ${GENERATOR_TIMEOUT_MS / 1000}s limit and at most ${GENERATOR_MAX_COUNT} gaussians and 64 columns. ${reuse} Undoable; returns createdLayer.`,
        { source: string('ES module source code.', 200000),
            params: { type: 'array', items: object({ name: string('Parameter name.', 64), value: { type: 'string', description: 'Parameter value.', maxLength: 4096 } }, ['name', 'value']), minItems: 0, maxItems: 64, description: 'Parameters passed to Generator.create.' },
            name: layerName }, ['source'],
        (i, o) => editor.create.generator(i.source, i.params ?? [], i.name, o));
    add('instance_layer', 'Place copies of a layer that share its gaussian data, so each copy costs only a small instance list instead of new data. Use for repeated objects (trees, rocks, props). Each copy applies its own world-space translation, Euler rotation (degrees) and uniform scale to the source layer, rotating and scaling about the source bounds centre unless center is given. Copies are separate layers today. All copies are one undoable edit; returns createdLayers.',
        { layer,
            copies: { type: 'array',
                items: object({ translate: vector('World-space offset from the source.'),
                    rotate: vector('World X/Y/Z Euler angles in degrees.'),
                    scale: number('Uniform scale multiplier.', 1e-6, 1e6),
                    center: vector('World-space rotation/scaling centre.') }),
                minItems: 1,
                maxItems: 128,
                description: 'One entry per copy.' },
            name: string('Name prefix for the copies; defaults to the source name.', 128) }, ['layer', 'copies'],
        (i, o) => editor.layers.instance(i.layer, (i.copies as Input[]).map(c => ({
            translate: c.translate && xyz(c.translate),
            rotate: c.rotate && new Quat().setFromEulerAngles(...c.rotate as [number, number, number]),
            scale: c.scale,
            center: c.center && xyz(c.center)
        })), i.name, o));
    add('export_scene', 'Export selected splats, one layer, or all visible layers through the editor exporters. Hidden splats are included; deleted splats are excluded. Requests a browser download, not a guaranteed filesystem save. Source SH bands are preserved unless shBands is specified.',
        { format: enumeration(['ply', 'compressed-ply', 'splat', 'sog', 'spz', 'viewer-html', 'viewer-zip'], 'Output format.'),
            filename: string('Download filename with matching extension.', 256),
            scope: enumeration(['selection', 'layer', 'visible_layers'], 'Export scope.'),
            layer,
            shBands: integer('Output SH bands.', 0, 3),
            sogIterations: integer('SOG compression iterations; default 10.', 1, 100),
            spzVersion: integer('SPZ version, 3 or 4; default 4.', 3, 4) },
        ['format', 'filename', 'scope'], (i, o) => {
            if (/[\\/:*?"<>|]/.test(i.filename) || i.filename === '.' || i.filename === '..') throw new EditorError('invalid_input', 'filename must be a filename without path separators.');
            if (i.scope !== 'visible_layers' && i.layer === undefined) throw new EditorError('invalid_input', 'layer is required for this scope.');
            if (i.scope === 'visible_layers' && i.layer !== undefined) throw new EditorError('invalid_input', 'Omit layer when exporting visible_layers.');
            const ext = i.format === 'compressed-ply' ? 'ply' : i.format === 'viewer-html' ? 'html' : i.format === 'viewer-zip' ? 'zip' : i.format;
            if (!i.filename.toLowerCase().endsWith(`.${ext}`)) throw new EditorError('invalid_input', `filename must end in .${ext}`);
            return editor.files.export(i as Parameters<EditorAPI['files']['export']>[0], o);
        }, { consequentialHint: true }, false);
    return tools;
};

// Keep the evolving browser surface isolated. Feature detection leaves the
// editor usable in browsers without WebMCP. The navigator location supports
// existing preview browsers; document is the current specification location.
const registerWebMCP = (editor: EditorAPI, context?: ModelContext) => {
    const provider = context ?? (document as Document & { modelContext?: ModelContext }).modelContext ??
        (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
    if (!provider?.registerTool) return () => {};
    const tools = createWebMCPTools(editor);
    let controller: AbortController;
    let disposed = false;
    let registration = Promise.resolve();
    const unbind = i18n.onChange(() => {
        registration = registration.then(async () => {
            if (disposed) return;
            controller?.abort();
            controller = new AbortController();
            const results = await Promise.allSettled(tools.map(tool => Promise.resolve().then(() => provider.registerTool(
                { ...tool, title: i18n.t(`webmcp.${tool.name}`) }, { signal: controller.signal }))));
            const failed = results.find(r => r.status === 'rejected');
            if (failed) {
                controller.abort();
                console.warn('WebMCP registration failed', (failed as PromiseRejectedResult).reason);
            }
        }).catch(error => console.warn('WebMCP registration failed', error));
    });
    return () => {
        disposed = true; unbind(); controller?.abort();
    };
};

export { createWebMCPTools, registerWebMCP };
export type { Tool, ModelContext };
