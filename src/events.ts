import { EventHandler } from 'playcanvas';
import type { Color, Vec3 } from 'playcanvas';

import type { CameraAnimTrack, Pose } from './camera-poses';
import type { Pivot } from './pivot';
import type { UserStatus } from './publish';
import type { ShortcutManager } from './shortcut-manager';
import type { Splat } from './splat';

type FunctionCallback = (...args: unknown[]) => unknown;
type RegisteredCallback = (...args: never[]) => unknown;

type Results = {
    bgClr: Color;
    'camera.animTrack': CameraAnimTrack;
    'camera.bound': boolean;
    'camera.boundDimensions': boolean;
    'camera.flySpeed': number;
    'camera.fov': number;
    'camera.fovDolly': boolean;
    'camera.getPose': { position: Vec3; target: Vec3; fov: number };
    'camera.mode': 'centers' | 'rings';
    'camera.overlay': boolean;
    'camera.poses': readonly Pose[];
    'camera.showInfo': boolean;
    'camera.showPoses': boolean;
    'camera.splatSize': number;
    'doc.name': string | null;
    'grid.plane': 'xy' | 'xz' | 'yz';
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
    'scene.splats': Splat[];
    selectedClr: Color;
    selection: Splat | null;
    'selection.splats': boolean;
    shortcutManager: ShortcutManager;
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
    'view.centersUseGaussianColor': boolean;
    'view.outlineSelection': boolean;
};

class Events extends EventHandler {
    functions = new Map<string, FunctionCallback>();

    // declare an editor function
    function<T extends RegisteredCallback>(name: string, fn: T) {
        if (this.functions.has(name)) {
            throw new Error(`error: function ${name} already exists`);
        }
        this.functions.set(name, fn as unknown as FunctionCallback);
    }

    // invoke an editor function
    invoke<K extends keyof Results>(name: K, ...args: unknown[]): Results[K];
    invoke<T = unknown>(name: string, ...args: unknown[]): T;
    invoke<T = unknown>(name: string, ...args: unknown[]): T {
        const fn = this.functions.get(name);
        if (!fn) {
            console.log(`error: function not found '${name}'`);
            return;
        }
        return fn(...(args as never[])) as T;
    }
}

export { Events };
