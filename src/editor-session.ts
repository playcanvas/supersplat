import { Color, Vec3 } from 'playcanvas';

import type { CommandQueue } from './command-queue';
import { AddSplatOp } from './edit-ops';
import type { LayerInfo } from './editor-api';
import { checkCancelled, CommandOptions, EditorError } from './editor-command';
import { Events } from './events';
import { buildExportOptions, ExportChoices, ExportType } from './export-options';
import type { FileType } from './file-handler';
import { Scene } from './scene';
import { Splat } from './splat';

type CameraSettings = {
    position?: Vec3; target?: Vec3;
    view?: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
    azimuth?: number; elevation?: number; distance?: number;
    fov?: number; orthographic?: boolean;
};
type ViewSettings = {
    background?: Color; showGrid?: boolean; shBands?: number; tonemapping?: string;
    showGaussians?: boolean; showCenters?: boolean; showRings?: boolean;
    selectionColor?: boolean; selectionCenters?: boolean; selectionRings?: boolean;
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
    historyInfo(): { canUndo: boolean, canRedo: boolean };
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
        const signature = JSON.stringify([Array.from(frame.view.data), Array.from(frame.projection.data),
            rect.x, rect.y, rect.width, rect.height, frame.target.width, frame.target.height]);
        let hash = 2166136261;
        for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
        return {
            viewToken: (hash >>> 0).toString(16),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            renderSize: frame.target
        };
    };
    const checkView = (token: string) => {
        if (viewportInfo().viewToken !== token) throw new EditorError('stale_view', 'The camera or viewport changed. Inspect the scene and use its new viewToken.');
    };
    const assertIdle = () => {
        if (busy || scene.lockedRenderMode) throw new EditorError('busy', 'The editor is loading or rendering. Wait for it to finish.');
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
                handle.off(); clearTimeout(timer); resolve(rendered);
            };
            handle = events.on('postrender', () => finish(true));
            timer = setTimeout(() => finish(false), 3000);
            scene.forceRender = true;
        });
    };
    return {
        read,
        checkView,
        viewport: {
            assertIdle,
            ready,
            info: viewportInfo,
            setCamera: async (settings: CameraSettings, options?: CommandOptions) => {
                const s = { ...settings, position: settings.position?.clone(), target: settings.target?.clone() };
                if (!!s.position !== !!s.target) throw new EditorError('invalid_input', 'position and target must be supplied together.');
                if (s.position && (s.view || s.azimuth !== undefined || s.elevation !== undefined || s.distance !== undefined)) {
                    throw new EditorError('invalid_input', 'Use position/target or orbit parameters in one command.');
                }
                if (s.position?.equals(s.target)) throw new EditorError('invalid_input', 'Camera position and target must differ.');
                return await queue.enqueue(() => {
                    checkCancelled(options);
                    assertIdle();
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
                    scene.forceRender = true;
                    return { camera: cameraInfo(), viewport: viewportInfo() };
                });
            },
            focus: async (scope: 'selection' | 'layer' | 'scene', layer?: number, options?: CommandOptions) => {
                const splat = scope === 'scene' ? null : layerById(layer);
                return await queue.enqueue(() => {
                    checkCancelled(options);
                    assertIdle();
                    if (splat && splat.scene !== scene) throw new EditorError('layer_removed', 'The target layer was removed.');
                    if (!allSplats().length) throw new EditorError('empty_scene', 'There are no layers to frame.');
                    if (scope === 'selection' && !splat.instances.numSelected) throw new EditorError('empty_selection', 'No splats are selected.');
                    const bound = !splat ? scene.bound : scope === 'layer' ? splat.worldBound :
                        layerInfo(splat).selectionBounds;
                    events.fire('camera.setControlMode', 'orbit');
                    scene.camera.focus({ focalPoint: bound.center.clone(), radius: Math.max(0.01, bound.halfExtents.length()), speed: 0 });
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
                if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new EditorError('invalid_input', 'Use an HTTP(S) URL without embedded credentials.');
                const name = filename ?? decodeURIComponent(parsed.pathname.split('/').pop());
                if (!/\.(?:ply|splat|sog|spz|ksplat)$/i.test(name)) throw new EditorError('unsupported_format', 'URL import supports PLY, SPLAT, SOG, SPZ and KSPLAT.');
                const loaded = await events.invoke('import', [{ url: parsed.href, filename: name }], false,
                    { ...options, throwOnError: true, attach: false }) as Splat[];
                const splat = loaded?.[0];
                if (!splat) throw new EditorError('cancelled', 'Import was cancelled.');
                try {
                    return await queue.enqueue(async (ctx) => {
                        checkCancelled(options);
                        await ctx.apply(new AddSplatOp(scene, splat));
                        splat.name = name;
                        return { affected: splat.instances.count, layers: [layerInfo(splat)], createdLayer: splat.uid, history: historyInfo() };
                    });
                } catch (error) {
                    if (!splat.scene) splat.destroy();
                    throw error;
                }
            },
            export: async (request: ExportRequest, options?: CommandOptions) => {
                const r = { ...request };
                const targets = r.scope === 'visible_layers' ? allSplats().filter(s => s.visible) : [layerById(r.layer)];
                return await queue.enqueue(async () => {
                    checkCancelled(options);
                    assertIdle();
                    if (!targets.length) throw new EditorError('empty_scene', 'There are no layers to export.');
                    for (const splat of targets) {
                        if (splat.scene !== scene) throw new EditorError('layer_removed', 'An export layer was removed.');
                        if (!splat.visible) throw new EditorError('layer_hidden', 'Show the export layer first.');
                    }
                    const count = targets.reduce((n, s) => n + (r.scope === 'selection' ? s.instances.numSelected : s.instances.count), 0);
                    if (!count) throw new EditorError(r.scope === 'selection' ? 'empty_selection' : 'empty_scene', 'There are no splats to export.');
                    const viewer = r.format.startsWith('viewer-');
                    const exportType = (viewer ? 'viewer' : r.format === 'compressed-ply' ? 'ply' : r.format) as ExportType;
                    const fileType = (viewer ? r.format === 'viewer-html' ? 'htmlViewer' : 'packageViewer' :
                        r.format === 'compressed-ply' ? 'compressedPly' : r.format) as FileType;
                    const background = events.invoke('bgClr') as Color;
                    const choices = {
                        ...r,
                        compressedPly: r.format === 'compressed-ply',
                        viewerType: r.format === 'viewer-html' ? 'html' as const : 'zip' as const,
                        fov: scene.camera.fov,
                        backgroundColor: [background.r, background.g, background.b] as [number, number, number]
                    };
                    const settings = buildExportOptions(events, exportType, choices);
                    settings.serializeSettings.selected = r.scope === 'selection';
                    await events.invoke('scene.write', fileType, settings, undefined, { ...options, throwOnError: true, splats: targets });
                    return { filename: r.filename, format: r.format, layers: targets.map(s => s.uid), splats: count, status: 'download_requested' };
                });
            }
        }
    };
};

export { createEditorSession };
export type { CameraSettings, ViewSettings, ExportRequest };
