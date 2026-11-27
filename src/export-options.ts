import type { Events } from './events';
import type { WriteTarget } from './io';
import type { SerializeSettings, ViewerExportSettings } from './splat-serialize';
import { buildExperienceSettings } from './viewer-experience';

type ExportType = 'ply' | 'splat' | 'sog' | 'spz' | 'viewer';

// The export dialog's choices. Everything else in SceneExportOptions is read
// from the scene when the export runs, so repeating an export with the same
// choices picks up the current camera pose and animation.
interface ExportChoices {
    filename: string;
    shBands?: number;

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
    return {
        type: choices.viewerType,
        experienceSettings: buildExperienceSettings(events, {
            includeAnimation: choices.includeAnimation,
            loopMode: choices.loopMode,
            backgroundColor: choices.backgroundColor,
            fov: choices.fov
        })
    };
};

// turn the dialog's choices into export options against the current scene
const buildExportOptions = (events: Events, exportType: ExportType, choices: ExportChoices): SceneExportOptions => {
    const options: SceneExportOptions = {
        filename: choices.filename,
        splatIdx: 'all',
        serializeSettings: { shBands: choices.shBands }
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
