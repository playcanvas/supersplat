import type { Entity, EventHandler, AppBase } from 'playcanvas';

import type { ExperienceSettings } from './settings';

type CameraMode = 'orbit' | 'anim' | 'fly' | 'walk';

type InputMode = 'desktop' | 'touch';

// configuration options are immutable at runtime
type Config = {
    poster?: HTMLImageElement;
    skyboxUrl?: string;
    contentUrl?: string;
    contents?: Promise<Response>;
    collisionUrl?: string;

    noui: boolean;
    noanim: boolean;
    nofx: boolean;                              // disable post effects
    hpr?: boolean;                              // override highPrecisionRendering (undefined = use settings)
    ministats: boolean;
    colorize: boolean;                          // render with LOD colorization
    fullload: boolean;                          // load all streaming LOD data before first frame
    aa: boolean;                                // render with antialiasing
    budget?: number;                            // override splat budget in millions (overrides platform + performanceMode table)
    renderer: 'webgl' | 'webgpu';
    heatmap: boolean;                           // render heatmap debug overlay (WebGPU only)
    debug: boolean;                             // auto-open the developer debug panel; can also be toggled with Ctrl+Shift+D
};

// observable state that can change at runtime
type State = {
    loaded: boolean;                            // true once first frame is rendered
    readyToRender: boolean;                     // don't render till this is set
    performanceMode: boolean;
    progress: number;                           // content loading progress 0-100
    inputMode: InputMode;
    cameraMode: CameraMode;
    hasAnimation: boolean;
    animationDuration: number;
    animationTime: number;
    animationPaused: boolean;
    hasAR: boolean;
    hasVR: boolean;
    hasCollision: boolean;
    hasCollisionOverlay: boolean;
    walkAllowed: boolean;
    collisionOverlayEnabled: boolean;
    isFullscreen: boolean;
    controlsHidden: boolean;
    gamingControls: boolean;
};

type Global = {
    app: AppBase;
    settings: ExperienceSettings;
    config: Config;
    state: State;
    events: EventHandler;
    camera: Entity;
};

export { CameraMode, InputMode, Config, State, Global };
