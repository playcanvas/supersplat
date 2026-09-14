import type { Pose } from './camera-poses';
import { Events } from './events';
import type { WriteTarget } from './io';
import { AnimTrack, defaultPostEffectSettings, ExperienceSettings, SerializeSettings, ViewerExportSettings } from './splat-serialize';

type ExportType = 'ply' | 'splat' | 'sog' | 'spz' | 'viewer';

// The export dialog's choices. Everything else in SceneExportOptions is read
// from the scene when the export runs, so repeating an export with the same
// choices picks up the current camera pose and animation.
interface ExportChoices {
    filename: string;
    maxSHBands?: number;

    // ply
    compressedPly?: boolean;

    // sog
    sogIterations?: number;

    // spz
    spzVersion?: 3 | 4;

    // viewer
    viewerType?: 'html' | 'zip';
    includeAnimation?: boolean;
    loopMode?: 'none' | 'repeat' | 'pingpong';
    backgroundColor?: [number, number, number];
    fov?: number;
}

// what the export dialog resolves: its choices plus, when a folder was chosen,
// the folder and the file to write
type ExportDialogResult = ExportChoices & {
    directory?: FileSystemDirectoryHandle;
    fileTarget?: WriteTarget;
};

interface SceneExportOptions {
    filename: string;
    splatIdx: 'all' | number;
    serializeSettings: SerializeSettings;

    // ply
    compressedPly?: boolean;

    // sog
    sogIterations?: number;

    // spz
    spzVersion?: 3 | 4;

    // viewer
    viewerExportSettings?: ViewerExportSettings;
}

const buildViewerSettings = (events: Events, choices: ExportChoices): ViewerExportSettings => {
    const fov = choices.fov;

    // use current viewport as start pose
    const pose = events.invoke('camera.getPose');
    const p = pose?.position;
    const t = pose?.target;
    const cameras = (p && t) ? [{
        initial: {
            position: [p.x, p.y, p.z] as [number, number, number],
            target: [t.x, t.y, t.z] as [number, number, number],
            fov
        }
    }] : [];

    const animTracks: AnimTrack[] = [];

    if (choices.includeAnimation) {
        const frames = events.invoke('timeline.frames');
        const frameRate = events.invoke('timeline.frameRate');
        const smoothness = events.invoke('timeline.smoothness');
        const orderedPoses = (events.invoke('camera.poses') as Pose[])
        .filter(entry => entry.frame >= 0 && entry.frame < frames)
        .sort((a, b) => a.frame - b.frame);

        if (orderedPoses.length > 0) {
            const times: number[] = [];
            const position: number[] = [];
            const target: number[] = [];
            const fovKeys: number[] = [];
            for (let i = 0; i < orderedPoses.length; ++i) {
                const op = orderedPoses[i];
                times.push(op.frame);
                position.push(op.position.x, op.position.y, op.position.z);
                target.push(op.target.x, op.target.y, op.target.z);
                fovKeys.push(op.fov ?? fov);
            }

            animTracks.push({
                name: 'cameraAnim',
                duration: frames / frameRate,
                frameRate,
                loopMode: choices.loopMode,
                interpolation: 'spline',
                smoothness,
                keyframes: {
                    times,
                    values: { position, target, fov: fovKeys }
                }
            });
        }
    }

    const experienceSettings: ExperienceSettings = {
        version: 2,
        tonemapping: 'none',
        highPrecisionRendering: false,
        background: { color: choices.backgroundColor },
        postEffectSettings: defaultPostEffectSettings(),
        animTracks,
        cameras,
        annotations: [],
        startMode: animTracks.length > 0 ? 'animTrack' : 'default'
    };

    return { type: choices.viewerType, experienceSettings };
};

// turn the dialog's choices into export options against the current scene
const buildExportOptions = (events: Events, exportType: ExportType, choices: ExportChoices): SceneExportOptions => {
    const options: SceneExportOptions = {
        filename: choices.filename,
        splatIdx: 'all',
        serializeSettings: { maxSHBands: choices.maxSHBands }
    };

    switch (exportType) {
        case 'ply':
            options.compressedPly = choices.compressedPly;
            break;
        case 'sog':
            options.sogIterations = choices.sogIterations;
            break;
        case 'spz':
            options.spzVersion = choices.spzVersion;
            break;
        case 'viewer':
            options.viewerExportSettings = buildViewerSettings(events, choices);
            break;
    }

    return options;
};

export { buildExportOptions, ExportChoices, ExportDialogResult, ExportType, SceneExportOptions };
