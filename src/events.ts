import { EventHandler } from 'playcanvas';
import type { Color, Vec3 } from 'playcanvas';

import type { CameraAnimTrack, Pose } from './camera-poses';
import type { ExportDialogResult } from './export-options';
import type { WriteTarget } from './io';
import type { Pivot } from './pivot';
import type { UserStatus } from './publish';
import type { Scene } from './scene';
import type { ShortcutManager } from './shortcut-manager';
import type { Splat } from './splat';

type FunctionCallback = (...args: never[]) => unknown;

type Results = {
    bgClr: Color;
    'camera.animTrack': CameraAnimTrack;
    'camera.bound': boolean;
    'camera.boundDimensions': boolean;
    'camera.flySpeed': number;
    'camera.fov': number;
    'camera.fovDolly': boolean;
    'camera.getPose': {
        position: { x: number; y: number; z: number };
        target: { x: number; y: number; z: number };
        fov: number;
    };
    'camera.poses': readonly Pose[];
    'camera.showInfo': boolean;
    'camera.showPoses': boolean;
    'doc.name': string | null;
    'grid.visible': boolean;
    lockedClr: Color;
    pivot: Pivot;
    'polygonSelection.removeLastPoint': boolean;
    'publish.userStatus': Promise<UserStatus | null>;
    'render.baseFilename': string;
    'render.image': Promise<boolean>;
    'render.maxTextureSize': number;
    'render.offscreen': Promise<Uint8Array>;
    'render.video': Promise<boolean>;
    'scene.allSplats': Splat[];
    'scene.dirty': boolean;
    'scene.empty': boolean;
    'scene.frameTimings': Scene['frameTimings'];
    'scene.getExportDirectory': Promise<FileSystemDirectoryHandle | undefined>;
    'scene.pickExportDirectory': Promise<FileSystemDirectoryHandle | null | undefined>;
    'scene.pickWriteTarget': Promise<WriteTarget | null>;
    'scene.splats': Splat[];
    selectedClr: Color;
    selection: Splat | null;
    'selection.splats': boolean;
    shortcutManager: ShortcutManager;
    'show.savePopup': Promise<ExportDialogResult | null>;
    showPopup: Promise<{ action: string; value?: string }>;
    targetSize: { width: number; height: number };
    'timeline.frame': number;
    'timeline.frameRate': number;
    'timeline.frames': number;
    'timeline.loop': boolean;
    'timeline.playing': boolean;
    'timeline.smoothness': number;
    'tool.active': string;
    'tool.coordSpace': 'local' | 'world';
    'tool.focus': { position: Vec3; radius: number };
    'track.keys': readonly number[];
    unselectedClr: Color;
    'view.bands': number;
    'view.centerSize': number;
    'view.centers': boolean;
    'view.editView': boolean;
    'view.gaussians': boolean;
    'view.outlineSelection': boolean;
    'view.ringSize': number;
    'view.ringsSelectionBlend': number;
    'view.selectionCenters': boolean;
    'view.selectionColor': boolean;
    'view.selectionRings': boolean;
    'view.splatsSelectionBlend': number;
};

class Events extends EventHandler {
    functions = new Map<string, FunctionCallback>();

    // declare an editor function
    // functions listed in Results must return their declared type
    function<K extends keyof Results>(name: K, fn: (...args: never[]) => Results[K]): void;
    function<N extends string>(name: N extends keyof Results ? never : N, fn: FunctionCallback): void;
    function(name: string, fn: FunctionCallback) {
        if (this.functions.has(name)) {
            throw new Error(`error: function ${name} already exists`);
        }
        this.functions.set(name, fn);
    }

    // invoke an editor function
    invoke<K extends keyof Results>(name: K, ...args: unknown[]): Results[K];
    invoke<T = unknown>(name: string, ...args: unknown[]): T;
    invoke<T = unknown>(name: string, ...args: unknown[]): T {
        const fn = this.functions.get(name);
        if (!fn) {
            console.error(`error: function not found '${name}'`);
            return;
        }
        return fn(...(args as never[])) as T;
    }
}

export { Events };
