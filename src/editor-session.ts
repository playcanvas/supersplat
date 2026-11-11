import { Column, DataTable, dataTableToChunkSource } from '@playcanvas/splat-transform';
import type { Color } from 'playcanvas';
import { Quat, Vec3 } from 'playcanvas';

import type { CommandQueue } from './command-queue';
import { AddSplatOp } from './edit-ops';
import type { LayerInfo } from './editor-api';
import type { CommandOptions } from './editor-command';
import { checkCancelled, EditorError } from './editor-command';
import { EditorSplatResource } from './editor-splat-resource';
import type { Events } from './events';
import type { ExportChoices, ExportType } from './export-options';
import { buildExportOptions } from './export-options';
import type { FileType } from './file-handler';
import type { GaussianColumn, GeneratorParam } from './generator-sandbox';
import { runGenerator } from './generator-sandbox';
import { validateSplatSource } from './io';
import type { Scene, ViewOverride } from './scene';
import { Splat } from './splat';

type CameraSettings = {
    position?: Vec3;
    target?: Vec3;
    view?: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
    azimuth?: number;
    elevation?: number;
    distance?: number;
    fov?: number;
    orthographic?: boolean;
};
type RenderView = 'current' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
type RenderSettings = {
    width?: number;
    height?: number;
    format?: 'jpeg' | 'png';
    quality?: number;
    // up to four views composited into one labelled grid; 'current' uses the
    // camera parameters (or the current view), named views orbit its target
    views?: RenderView[];
    // analysis view applied while rendering
    viewOverride?: ViewOverride;
    // measures [min, max] of the analysed property from the camera as posed for
    // a tile, or null when nothing is visible; the property range when the
    // override gives none is the union over every tile
    measureRange?: () => Promise<[number, number] | null>;
};
// longest render_view waits for one offscreen frame before giving up
const RENDER_TIMEOUT_MS = 5000;

type RenderTile = { pixels: Uint8Array; x: number; y: number; width: number; height: number; label?: string };

// Encode top-down RGBA render tiles over the background colour, as an
// MCP-style image block (base64 data, no data: prefix).
const encodeImage = async (
    tiles: RenderTile[],
    width: number,
    height: number,
    background: Color,
    format: 'jpeg' | 'png',
    quality: number
) => {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    const bg = [background.r * 255, background.g * 255, background.b * 255];
    for (const tile of tiles) {
        const { pixels } = tile;
        const out = new Uint8ClampedArray(pixels.length);
        for (let i = 0; i < pixels.length; i += 4) {
            // the render target holds premultiplied colour
            const t = 1 - pixels[i + 3] / 255;
            out[i] = pixels[i] + bg[0] * t;
            out[i + 1] = pixels[i + 1] + bg[1] * t;
            out[i + 2] = pixels[i + 2] + bg[2] * t;
            out[i + 3] = 255;
        }
        context.putImageData(new ImageData(out, tile.width, tile.height), tile.x, tile.y);
        if (tile.label) {
            const size = Math.max(10, Math.round(tile.height / 18));
            context.font = `${size}px sans-serif`;
            context.fillStyle = 'rgba(0, 0, 0, 0.6)';
            context.fillRect(tile.x, tile.y, context.measureText(tile.label).width + size, size * 1.6);
            context.fillStyle = '#fff';
            context.fillText(tile.label, tile.x + size / 2, tile.y + size * 1.15);
        }
    }
    if (tiles.length > 1) {
        // separate the tiles
        context.fillStyle = '#888';
        for (const tile of tiles) {
            if (tile.x) context.fillRect(tile.x, tile.y, 1, tile.height);
            if (tile.y) context.fillRect(tile.x, tile.y, tile.width, 1);
        }
    }
    const mimeType = `image/${format}`;
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: mimeType, quality })).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { type: 'image' as const, mimeType, data: btoa(binary), width, height };
};
type ViewSettings = {
    background?: Color;
    showGrid?: boolean;
    shBands?: number;
    tonemapping?: string;
    showGaussians?: boolean;
    showCenters?: boolean;
    showRings?: boolean;
    selectionColor?: boolean;
    selectionCenters?: boolean;
    selectionRings?: boolean;
};
type ExportRequest = ExportChoices & {
    format: 'ply' | 'compressed-ply' | 'splat' | 'sog' | 'spz' | 'viewer-html' | 'viewer-zip';
    scope: 'selection' | 'layer' | 'visible_layers';
    layer?: number;
};
type SessionQueries = {
    allSplats(): Splat[];
    layerById(id: number): Splat;
    layerInfo(splat: Splat): LayerInfo;
    historyInfo(): { canUndo: boolean; canRedo: boolean };
};

const VIEW_ANGLES = { front: [0, 0], back: [180, 0], left: [270, 0], right: [90, 0], top: [0, -90], bottom: [0, 90] };
const VIEW_EVENTS = {
    showGrid: 'grid.setVisible',
    shBands: 'view.setBands',
    tonemapping: 'camera.setTonemapping',
    showGaussians: 'view.setGaussians',
    showCenters: 'view.setCenters',
    showRings: 'view.setRings',
    selectionColor: 'view.setSelectionColor',
    selectionCenters: 'view.setSelectionCenters',
    selectionRings: 'view.setSelectionRings'
};
const VIEW_QUERIES = {
    showGrid: 'grid.visible',
    shBands: 'view.bands',
    tonemapping: 'camera.tonemapping',
    showGaussians: 'view.gaussians',
    showCenters: 'view.centers',
    showRings: 'view.rings',
    selectionColor: 'view.selectionColor',
    selectionCenters: 'view.selectionCenters',
    selectionRings: 'view.selectionRings'
};

// Session and file operations behind EditorAPI. The transport never needs a
// Scene, Splat or Events reference.
const createEditorSession = (events: Events, scene: Scene, queue: CommandQueue, queries: SessionQueries) => {
    const { allSplats, layerById, layerInfo, historyInfo } = queries;
    let busy = 0;
    events.on('startSpinner', () => busy++);
    events.on('stopSpinner', () => {
        busy = Math.max(0, busy - 1);
    });
    events.on('progressStart', () => busy++);
    events.on('progressEnd', () => {
        busy = Math.max(0, busy - 1);
    });

    const cameraInfo = () => {
        const frame = scene.camera.captureFrame();
        const pose = events.invoke('camera.getPose');
        return {
            position: frame.position,
            target: new Vec3(pose.target.x, pose.target.y, pose.target.z),
            fov: frame.fov,
            orthographic: frame.ortho,
            azimuth: scene.camera.azim,
            elevation: -scene.camera.elevation,
            distance: scene.camera.distance
        };
    };
    const viewInfo = () => ({
        background: (events.invoke('bgClr') as Color).clone(),
        ...Object.fromEntries(Object.entries(VIEW_QUERIES).map(([key, name]) => [key, events.invoke(name)]))
    });
    const viewportInfo = () => {
        const frame = scene.camera.captureFrame();
        const rect = scene.canvas.getBoundingClientRect();
        // Token describes the displayed camera and coordinate system, including
        // CSS offsets. Moving panels can invalidate screen coordinates too.
        const signature = JSON.stringify([
            Array.from(frame.view.data),
            Array.from(frame.projection.data),
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            frame.target.width,
            frame.target.height
        ]);
        let hash = 2166136261;
        for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
        return {
            viewToken: (hash >>> 0).toString(16),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            renderSize: frame.target
        };
    };
    const checkView = (token: string) => {
        if (viewportInfo().viewToken !== token)
            throw new EditorError(
                'stale_view',
                'The camera or viewport changed. Inspect the scene and use its new viewToken.'
            );
    };
    const assertIdle = () => {
        if (busy || scene.lockedRenderMode)
            throw new EditorError('busy', 'The editor is loading or rendering. Wait for it to finish.');
    };
    // Validate and snapshot camera settings before they are queued.
    const cameraSettings = (settings: CameraSettings) => {
        const s = { ...settings, position: settings.position?.clone(), target: settings.target?.clone() };
        if (!!s.position !== !!s.target)
            throw new EditorError('invalid_input', 'position and target must be supplied together.');
        if (
            s.position &&
            (s.view || s.azimuth !== undefined || s.elevation !== undefined || s.distance !== undefined)
        ) {
            throw new EditorError('invalid_input', 'Use position/target or orbit parameters in one command.');
        }
        if (s.position?.equals(s.target))
            throw new EditorError('invalid_input', 'Camera position and target must differ.');
        return s;
    };
    const applyCamera = (s: CameraSettings) => {
        const camera = scene.camera;
        if (s.fov !== undefined) events.fire('camera.setFov', s.fov);
        if (s.position) {
            events.fire('camera.setPose', { position: s.position, target: s.target }, 0);
        } else if (s.view || s.azimuth !== undefined || s.elevation !== undefined) {
            const [azimuth, elevation] = s.view ? VIEW_ANGLES[s.view] : [camera.azim, camera.elevation];
            camera.setAzimElev(s.azimuth ?? azimuth, s.elevation === undefined ? elevation : -s.elevation, 0);
        }
        if (s.distance !== undefined) camera.setDistance(s.distance, 0);
        if (s.orthographic !== undefined) camera.ortho = s.orthographic;
        camera.onUpdate(0);
    };
    const read = () => ({
        document: { name: events.invoke('doc.name') ?? null, unsavedChanges: !!events.invoke('scene.dirty') },
        camera: cameraInfo(),
        viewport: viewportInfo(),
        view: viewInfo(),
        busy: busy > 0 || !!scene.lockedRenderMode,
        bounds: allSplats().length ? scene.bound.clone() : null
    });
    const ready = () => {
        if (scene.lockedRenderMode) return Promise.resolve(false);
        return new Promise<boolean>((resolve) => {
            let handle: ReturnType<Events['on']> = null;
            let timer: ReturnType<typeof setTimeout> = null;
            const finish = (rendered: boolean) => {
                handle.off();
                clearTimeout(timer);
                resolve(rendered);
            };
            handle = events.on('postrender', () => finish(true));
            timer = setTimeout(() => finish(false), 3000);
            scene.forceRender = true;
        });
    };
    // Attach a loaded or created layer as one undoable edit.
    const attachLayer = async (splat: Splat, name: string, options?: CommandOptions) => {
        try {
            return await queue.enqueue(async (ctx) => {
                checkCancelled(options);
                await ctx.apply(new AddSplatOp(scene, splat));
                splat.name = name;
                return {
                    affected: splat.instances.count,
                    layers: [layerInfo(splat)],
                    createdLayer: splat.uid,
                    history: historyInfo()
                };
            });
        } catch (error) {
            if (!splat.scene) splat.destroy();
            throw error;
        }
    };
    // Build a new static resource from columns in memory. The data is world
    // space, so the layer keeps an identity transform.
    const createLayer = async (columns: GaussianColumn[], name: string, options?: CommandOptions) => {
        checkCancelled(options);
        assertIdle();
        for (const { name: column, data } of columns) {
            for (let i = 0; i < data.length; i++) {
                if (!Number.isFinite(data[i]))
                    throw new EditorError(
                        'invalid_input',
                        `Column '${column}' contains a non-finite value at row ${i}.`
                    );
            }
        }
        const source = dataTableToChunkSource(new DataTable(columns.map((c) => new Column(c.name, c.data))));
        try {
            validateSplatSource(source);
        } catch (error) {
            await source.close();
            throw new EditorError('invalid_input', error.message);
        }
        const resource = await EditorSplatResource.create(scene.app.graphicsDevice, source, true);
        const splat = new Splat(scene.assetLoader.createGSplatAsset(resource, name), new Quat());
        return await attachLayer(splat, name, options);
    };
    return {
        read,
        checkView,
        camera: cameraInfo,
        viewport: {
            assertIdle,
            ready,
            info: viewportInfo,
            setCamera: async (settings: CameraSettings, options?: CommandOptions) => {
                const s = cameraSettings(settings);
                return await queue.enqueue(() => {
                    checkCancelled(options);
                    assertIdle();
                    applyCamera(s);
                    scene.forceRender = true;
                    return { camera: cameraInfo(), viewport: viewportInfo() };
                });
            },
            // Render offscreen from an optional pose without moving the user's
            // view: the camera is restored afterwards. Overlays are not drawn.
            render: async (settings: CameraSettings & RenderSettings = {}, options?: CommandOptions) => {
                const s = cameraSettings(settings);
                const rect = scene.canvas.getBoundingClientRect();
                const aspect = rect.width && rect.height ? rect.width / rect.height : 1;
                const width =
                    settings.width ??
                    (settings.height
                        ? Math.round(settings.height * aspect)
                        : Math.round(aspect >= 1 ? 512 : 512 * aspect));
                const height = settings.height ?? Math.round(width / aspect);
                if (![width, height].every((v) => Number.isInteger(v) && v >= 16 && v <= 2048))
                    throw new EditorError('invalid_input', 'width and height must be 16 to 2048 pixels.');
                const views = settings.views?.length ? [...settings.views] : ['current' as const];
                if (views.length > 4) throw new EditorError('invalid_input', 'At most four views.');
                const cols = views.length > 1 ? 2 : 1;
                const rows = views.length > 2 ? 2 : 1;
                const tileWidth = Math.floor(width / cols);
                const tileHeight = Math.floor(height / rows);
                const viewOverride = settings.viewOverride;
                return await queue.enqueue(async () => {
                    checkCancelled(options);
                    assertIdle();
                    if (events.invoke('timeline.playing'))
                        throw new EditorError('timeline_playing', 'Pause timeline playback before rendering.');
                    const camera = scene.camera;
                    const pose = events.invoke('camera.getPose');
                    const saved = {
                        position: new Vec3(pose.position.x, pose.position.y, pose.position.z),
                        target: new Vec3(pose.target.x, pose.target.y, pose.target.z),
                        fov: camera.fov,
                        ortho: camera.ortho
                    };
                    try {
                        applyCamera(s);
                        const basePose = events.invoke('camera.getPose');
                        const base = {
                            position: new Vec3(basePose.position.x, basePose.position.y, basePose.position.z),
                            target: new Vec3(basePose.target.x, basePose.target.y, basePose.target.z)
                        };
                        // changing the pose leaves orthographic projection, so every tile restores it
                        const ortho = camera.ortho;
                        // named views orbit the requested view's target at its
                        // distance; the base pose is the requested one
                        let posed = -1; // the tile the camera is posed for; -1 is the base pose
                        const poseTile = (i: number) => {
                            if (posed === i) return;
                            if (posed !== -1) events.fire('camera.setPose', base, 0);
                            posed = i;
                            if (views[i] !== 'current') applyCamera({ view: views[i] as CameraSettings['view'] });
                            camera.ortho = ortho;
                            camera.onUpdate(0);
                        };
                        // timeline playback moves the camera every tick, which would
                        // change the pose between posing and rendering a tile
                        const checkStill = () => {
                            if (events.invoke('timeline.playing'))
                                throw new EditorError('timeline_playing', 'Pause timeline playback before rendering.');
                        };
                        let override = viewOverride ?? null;
                        if (override?.mode === 'property' && !override.range && settings.measureRange) {
                            let range: [number, number] = [Infinity, -Infinity];
                            for (let i = 0; i < views.length; i++) {
                                poseTile(i);
                                const r = await settings.measureRange();
                                checkCancelled(options);
                                if (r) range = [Math.min(range[0], r[0]), Math.max(range[1], r[1])];
                            }
                            if (!(range[0] <= range[1]))
                                throw new EditorError('empty_scene', 'There are no visible splats to measure.');
                            if (range[0] === range[1]) range[1] = range[0] + 1e-6;
                            override = { ...override, range };
                        }
                        scene.viewOverride = override;
                        const tiles: RenderTile[] = [];
                        const cameras = [];
                        for (let i = 0; i < views.length; i++) {
                            poseTile(i);
                            cameras.push({ view: views[i], camera: cameraInfo() });
                            let pixels: Uint8Array;
                            try {
                                pixels = (await events.invoke('render.offscreen', tileWidth, tileHeight, {
                                    signal: options?.signal,
                                    timeout: RENDER_TIMEOUT_MS
                                })) as Uint8Array;
                            } catch (error) {
                                checkCancelled(options);
                                if (error?.message === 'render_timeout')
                                    throw new EditorError(
                                        'operation_failed',
                                        'The viewport did not render a frame; the editor tab may be hidden or in the background.'
                                    );
                                throw error;
                            }
                            checkCancelled(options);
                            checkStill();
                            tiles.push({
                                pixels,
                                x: (i % cols) * tileWidth,
                                y: Math.floor(i / cols) * tileHeight,
                                width: tileWidth,
                                height: tileHeight,
                                label: views.length > 1 ? views[i] : undefined
                            });
                        }
                        const image = await encodeImage(
                            tiles,
                            tileWidth * cols,
                            tileHeight * rows,
                            events.invoke('bgClr') as Color,
                            settings.format ?? 'jpeg',
                            settings.quality ?? 0.85
                        );
                        const range = override?.mode === 'property' ? { range: override.range } : {};
                        return views.length > 1
                            ? { cameras, image, ...range }
                            : { camera: cameras[0].camera, image, ...range };
                    } finally {
                        scene.viewOverride = null;
                        events.fire('camera.setFov', saved.fov);
                        events.fire('camera.setPose', { position: saved.position, target: saved.target }, 0);
                        camera.ortho = saved.ortho;
                        camera.onUpdate(0);
                        scene.forceRender = true;
                    }
                });
            },
            focus: async (scope: 'selection' | 'layer' | 'scene', layer?: number, options?: CommandOptions) => {
                const splat = scope === 'scene' ? null : layerById(layer);
                return await queue.enqueue(() => {
                    checkCancelled(options);
                    assertIdle();
                    if (splat && splat.scene !== scene)
                        throw new EditorError('layer_removed', 'The target layer was removed.');
                    if (!allSplats().length) throw new EditorError('empty_scene', 'There are no layers to frame.');
                    if (scope === 'selection' && !splat.instances.numSelected)
                        throw new EditorError('empty_selection', 'No splats are selected.');
                    const bound = !splat
                        ? scene.bound
                        : scope === 'layer'
                          ? splat.worldBound
                          : layerInfo(splat).selectionBounds;
                    events.fire('camera.setControlMode', 'orbit');
                    scene.camera.focus({
                        focalPoint: bound.center.clone(),
                        radius: Math.max(0.01, bound.halfExtents.length()),
                        speed: 0
                    });
                    scene.camera.onUpdate(0);
                    scene.forceRender = true;
                    return { camera: cameraInfo(), viewport: viewportInfo() };
                });
            },
            setView: (settings: ViewSettings, options?: CommandOptions) => {
                const s = { ...settings, background: settings.background?.clone() };
                return queue.enqueue(() => {
                    checkCancelled(options);
                    assertIdle();
                    if (s.background) events.fire('setBgClr', s.background);
                    for (const [key, name] of Object.entries(VIEW_EVENTS)) {
                        const value = s[key as keyof ViewSettings];
                        if (value !== undefined) events.fire(name, value);
                    }
                    scene.forceRender = true;
                    return { view: viewInfo() };
                });
            }
        },
        create: {
            // Run a splat-transform Generator module in an isolated sandbox.
            generator: async (
                source: string,
                params: GeneratorParam[] = [],
                name = 'Generated',
                options?: CommandOptions
            ) => {
                checkCancelled(options);
                assertIdle();
                return await createLayer(await runGenerator(source, params, options), name, options);
            }
        },
        files: {
            importUrl: async (url: string, filename?: string, options?: CommandOptions & { lod?: number }) => {
                checkCancelled(options);
                assertIdle();
                let parsed: URL;
                try {
                    parsed = new URL(url);
                } catch {
                    throw new EditorError('invalid_input', 'An absolute HTTP(S) URL is required.');
                }
                if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
                    throw new EditorError('invalid_input', 'Use an HTTP(S) URL without embedded credentials.');
                const name = filename ?? decodeURIComponent(parsed.pathname.split('/').pop());
                if (!/\.(?:ply|splat|sog|spz|ksplat)$/i.test(name))
                    throw new EditorError('unsupported_format', 'URL import supports PLY, SPLAT, SOG, SPZ and KSPLAT.');
                const loaded = (await events.invoke('import', [{ url: parsed.href, filename: name }], false, {
                    ...options,
                    throwOnError: true,
                    attach: false
                })) as Splat[];
                if (!loaded?.[0]) throw new EditorError('cancelled', 'Import was cancelled.');
                return await attachLayer(loaded[0], name, options);
            },
            export: async (request: ExportRequest, options?: CommandOptions) => {
                const r = { ...request };
                const targets =
                    r.scope === 'visible_layers' ? allSplats().filter((s) => s.visible) : [layerById(r.layer)];
                return await queue.enqueue(async () => {
                    checkCancelled(options);
                    assertIdle();
                    if (!targets.length) throw new EditorError('empty_scene', 'There are no layers to export.');
                    for (const splat of targets) {
                        if (splat.scene !== scene)
                            throw new EditorError('layer_removed', 'An export layer was removed.');
                        if (!splat.visible) throw new EditorError('layer_hidden', 'Show the export layer first.');
                    }
                    const count = targets.reduce(
                        (n, s) => n + (r.scope === 'selection' ? s.instances.numSelected : s.instances.count),
                        0
                    );
                    if (!count)
                        throw new EditorError(
                            r.scope === 'selection' ? 'empty_selection' : 'empty_scene',
                            'There are no splats to export.'
                        );
                    const viewer = r.format.startsWith('viewer-');
                    const exportType = (
                        viewer ? 'viewer' : r.format === 'compressed-ply' ? 'ply' : r.format
                    ) as ExportType;
                    const fileType = (
                        viewer
                            ? r.format === 'viewer-html'
                                ? 'htmlViewer'
                                : 'packageViewer'
                            : r.format === 'compressed-ply'
                              ? 'compressedPly'
                              : r.format
                    ) as FileType;
                    const background = events.invoke('bgClr') as Color;
                    const choices = {
                        ...r,
                        compressedPly: r.format === 'compressed-ply',
                        viewerType: r.format === 'viewer-html' ? ('html' as const) : ('zip' as const),
                        fov: scene.camera.fov,
                        backgroundColor: [background.r, background.g, background.b] as [number, number, number]
                    };
                    const settings = buildExportOptions(events, exportType, choices);
                    settings.serializeSettings.selected = r.scope === 'selection';
                    await events.invoke('scene.write', fileType, settings, undefined, {
                        ...options,
                        throwOnError: true,
                        splats: targets
                    });
                    return {
                        filename: r.filename,
                        format: r.format,
                        layers: targets.map((s) => s.uid),
                        splats: count,
                        status: 'download_requested'
                    };
                });
            }
        }
    };
};

type EditorSession = ReturnType<typeof createEditorSession>;

export { createEditorSession };
export type { CameraSettings, ViewSettings, ExportRequest, EditorSession };
