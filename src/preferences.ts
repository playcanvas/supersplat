import { Color } from 'playcanvas';

import type { Events } from './events';
import type { SceneConfig } from './scene-config';
import { i18n } from './ui/localization';
import { isModeSettings, modeDefaults } from './view-mode';
import type { ModeSettings, ViewMode } from './view-mode';

const storageKey = 'supersplat:preferences';
const storageVersion = 1;

type PrefValue = boolean | number | string | number[] | string[] | Record<string, boolean | number>;
type EventValue = PrefValue | Color;
type PreferenceGroup = 'appearance' | 'overlays' | 'preferences';

type Descriptor = {
    // storage key, which doubles as the notify event fired when the setting changes
    key: string;
    // command event used to apply a value
    setCommand: string;
    // the sceneConfig path a url query parameter would override. when the url
    // specifies this setting, the stored preference is ignored for the session.
    urlPath?: string;
    // default event payload. reads the resolved sceneConfig, which already has
    // url overrides folded in, so url parameters naturally take precedence.
    getDefault: () => EventValue;
    // validate a stored (json) value
    validate: (value: PrefValue) => boolean;
    // owning panel for scoped reset; omitted for toolbar-only settings
    group?: PreferenceGroup;
    // stored (json) value -> event payload
    toEvent?: (value: PrefValue) => EventValue;
    // notify payload -> stored (json) value
    fromEvent?(value: EventValue): PrefValue;
};

// mirror the kebab-case matching used by scene-config's Params so url
// detection agrees with how getSceneConfig consumed the query parameters
const kebabize = (s: string) => s.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? '-' : '') + $.toLowerCase());

const registerPreferences = (events: Events, config: SceneConfig, urlArgs: object) => {
    // returns true if the url query args specify the given config path
    const urlHas = (path?: string) => {
        if (!path) {
            return false;
        }
        const lookup = (segments: string[]) => {
            let obj: unknown = urlArgs;
            for (const segment of segments) {
                if (typeof obj !== 'object' || obj === null || !Object.prototype.hasOwnProperty.call(obj, segment)) {
                    return undefined;
                }
                obj = (obj as Record<string, unknown>)[segment];
            }
            return obj;
        };
        const parts = path.split('.');
        return lookup(parts.map(kebabize)) !== undefined || lookup(parts) !== undefined;
    };

    const isBool = (v: PrefValue) => typeof v === 'boolean';
    const isNumber = (min: number, max: number) => (v: PrefValue) =>
        typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    const isEnum = (options: string[]) => (v: PrefValue) => typeof v === 'string' && options.includes(v);
    const isPlanes = (v: PrefValue) => {
        if (!Array.isArray(v)) {
            return false;
        }
        const planes = v as string[];
        return (
            planes.length <= 3 &&
            new Set(planes).size === planes.length &&
            planes.every((p) => ['xz', 'xy', 'yz'].includes(p))
        );
    };
    const isColor = (v: PrefValue) =>
        Array.isArray(v) && v.length === 4 && v.every((c) => typeof c === 'number' && c >= 0 && c <= 1);

    const color = (
        key: string,
        setCommand: string,
        getDefault: () => { r: number; g: number; b: number; a: number }
    ): Descriptor => ({
        key,
        setCommand,
        group: 'appearance',
        urlPath: key,
        getDefault: () => {
            const c = getDefault();
            return new Color(c.r, c.g, c.b, c.a);
        },
        validate: isColor,
        toEvent: (v: PrefValue) => {
            const a = v as number[];
            return new Color(a[0], a[1], a[2], a[3]);
        },
        fromEvent: (c: Color) => [c.r, c.g, c.b, c.a]
    });

    const descriptors: Descriptor[] = [
        color('bgClr', 'setBgClr', () => config.bgClr),
        color('selectedClr', 'setSelectedClr', () => config.selectedClr),
        color('unselectedClr', 'setUnselectedClr', () => config.unselectedClr),
        color('lockedClr', 'setLockedClr', () => config.lockedClr),
        {
            key: 'camera.tonemapping',
            setCommand: 'camera.setTonemapping',
            urlPath: 'camera.toneMapping',
            getDefault: () => config.camera.toneMapping,
            validate: isEnum(['linear', 'neutral', 'aces', 'aces2', 'filmic', 'hejl']),
            group: 'preferences'
        },
        {
            key: 'camera.fovDolly',
            setCommand: 'camera.setFovDolly',
            getDefault: () => false,
            validate: isBool,
            group: 'preferences'
        },
        {
            key: 'camera.fov',
            setCommand: 'camera.setFov',
            urlPath: 'camera.fov',
            getDefault: () => config.camera.fov,
            validate: isNumber(10, 120),
            group: 'preferences'
        },
        {
            key: 'view.bands',
            setCommand: 'view.setBands',
            urlPath: 'show.shBands',
            getDefault: () => config.show.shBands,
            validate: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3,
            group: 'preferences'
        },
        {
            key: 'view.minPixelSize',
            setCommand: 'view.setMinPixelSize',
            getDefault: () => 2,
            validate: isNumber(0, 5),
            group: 'preferences'
        },
        {
            key: 'camera.flySpeed',
            setCommand: 'camera.setFlySpeed',
            getDefault: () => 1,
            validate: isNumber(0.1, 30),
            group: 'preferences'
        },
        {
            key: 'view.centerSize',
            setCommand: 'view.setCenterSize',
            getDefault: () => 2,
            validate: isNumber(0, 10),
            group: 'appearance'
        },
        { key: 'selection.useDepth', setCommand: 'selection.setUseDepth', getDefault: () => false, validate: isBool },
        // the mode and each mode's settings. The settings objects apply before
        // view.mode so the switch finds both arranged; a stored object may
        // predate a key, which then takes its default
        {
            key: 'view.centersSettings',
            setCommand: 'view.setCentersSettings',
            getDefault: () => modeDefaults('centers'),
            validate: isModeSettings,
            group: 'appearance',
            toEvent: (v) => ({ ...modeDefaults('centers'), ...(v as Partial<ModeSettings>) })
        },
        {
            key: 'view.ringsSettings',
            setCommand: 'view.setRingsSettings',
            getDefault: () => modeDefaults('rings'),
            validate: isModeSettings,
            group: 'appearance',
            toEvent: (v) => ({ ...modeDefaults('rings'), ...(v as Partial<ModeSettings>) })
        },
        {
            key: 'view.mode',
            setCommand: 'view.setMode',
            getDefault: () => 'centers',
            validate: isEnum(['centers', 'rings']),
            group: 'appearance'
        },
        {
            key: 'view.ringSize',
            setCommand: 'view.setRingSize',
            getDefault: () => 4,
            validate: isNumber(1, 50),
            group: 'appearance'
        },
        // after the mode and its settings above: applying those must not
        // switch the markers on over the stored value (the editor skips that
        // while preference application is suspended, and this applies last)
        {
            key: 'view.editView',
            setCommand: 'view.setEditView',
            getDefault: () => false,
            validate: isBool,
            group: 'appearance'
        },
        {
            key: 'view.stochastic',
            setCommand: 'view.setStochastic',
            getDefault: () => 'auto',
            validate: isEnum(['disabled', 'enabled', 'movement', 'auto']),
            group: 'preferences'
        },
        {
            key: 'view.sortMode',
            setCommand: 'view.setSortMode',
            getDefault: () => 'radial',
            validate: isEnum(['radial', 'depth']),
            group: 'preferences'
        },
        {
            key: 'view.perfOverlay',
            setCommand: 'view.setPerfOverlay',
            getDefault: () => false,
            validate: isBool,
            group: 'overlays'
        },
        {
            key: 'grid.visible',
            setCommand: 'grid.setVisible',
            urlPath: 'show.grid',
            getDefault: () => config.show.grid,
            validate: isBool,
            group: 'overlays'
        },
        {
            key: 'grid.planes',
            setCommand: 'grid.setPlanes',
            getDefault: () => ['xz'],
            validate: isPlanes,
            group: 'overlays'
        },
        {
            key: 'camera.bound',
            setCommand: 'camera.setBound',
            urlPath: 'show.bound',
            getDefault: () => config.show.bound,
            validate: isBool,
            group: 'overlays'
        },
        {
            key: 'camera.boundDimensions',
            setCommand: 'camera.setBoundDimensions',
            urlPath: 'show.boundDimensions',
            getDefault: () => config.show.boundDimensions,
            validate: isBool,
            group: 'overlays'
        },
        {
            key: 'camera.showPoses',
            setCommand: 'camera.setShowPoses',
            urlPath: 'show.cameraPoses',
            getDefault: () => config.show.cameraPoses,
            validate: isBool,
            group: 'overlays'
        },
        {
            key: 'camera.showInfo',
            setCommand: 'camera.setShowInfo',
            urlPath: 'show.cameraInfo',
            getDefault: () => config.show.cameraInfo,
            validate: isBool,
            group: 'overlays'
        },
        {
            key: 'camera.controlMode',
            setCommand: 'camera.setControlMode',
            getDefault: () => 'orbit',
            validate: isEnum(['orbit', 'fly'])
        }
    ];

    // 3.0-3.7 stored the appearance as flat per-flag keys for the active
    // footprint mode plus the other mode's five visibility flags. Fold them
    // into the two per-mode settings objects, once, so nothing a user set is
    // lost. The flat keys are no longer descriptors, so they drop out of the
    // blob on the next write. selection.useDepth stays a live key and is
    // left alone
    const migrate = (stored: Record<string, unknown>) => {
        if (stored['view.centersSettings'] !== undefined || stored['view.ringsSettings'] !== undefined) {
            return;
        }
        const legacyKeys = [
            'selection.footprint',
            'view.gaussians',
            'view.centers',
            'view.rings',
            'view.selectionColor',
            'view.selectionCenters',
            'view.selectionRings',
            'view.outlineSelection',
            'view.inactiveProfile',
            'view.splatsColorBlend',
            'view.splatsSelectionBlend',
            'view.centersColorBlend',
            'view.centersSelectionBlend',
            'view.ringsColorBlend',
            'view.ringsSelectionBlend'
        ];
        if (!legacyKeys.some((key) => stored[key] !== undefined)) {
            return;
        }
        const footprint = typeof stored['selection.footprint'] === 'number' ? stored['selection.footprint'] : 0;
        const activeMode: ViewMode = footprint > 0 ? 'rings' : 'centers';
        const otherMode: ViewMode = footprint > 0 ? 'centers' : 'rings';
        const active = modeDefaults(activeMode);
        const other = modeDefaults(otherMode);
        const take = (target: ModeSettings, key: keyof ModeSettings, legacy: string) => {
            const value = stored[legacy];
            if (typeof value === typeof target[key]) {
                (target as Record<string, boolean | number>)[key] = value as boolean | number;
            }
        };
        // the live flags were the active mode's
        (['gaussians', 'centers', 'rings', 'selectionCenters', 'selectionRings'] as const).forEach((key) =>
            take(active, key, `view.${key}`)
        );
        // these were global: both modes keep them
        [active, other].forEach((target) => {
            (
                [
                    'selectionColor',
                    'outlineSelection',
                    'splatsColorBlend',
                    'splatsSelectionBlend',
                    'centersColorBlend',
                    'centersSelectionBlend',
                    'ringsColorBlend',
                    'ringsSelectionBlend'
                ] as const
            ).forEach((key) => take(target, key, `view.${key}`));
        });
        // the other mode's profile: [gaussians, centers, rings, selectionCenters, selectionRings] as 0/1
        const profile = stored['view.inactiveProfile'];
        if (Array.isArray(profile) && profile.length === 5) {
            other.gaussians = !!profile[0];
            other.centers = !!profile[1];
            other.rings = !!profile[2];
            other.selectionCenters = !!profile[3];
            other.selectionRings = !!profile[4];
        }
        // the selected gaussians were filled when either the gaussians or the
        // selection tint was on; they now have their own flag
        [active, other].forEach((target) => {
            target.selectionGaussians = target.gaussians || target.selectionColor;
        });
        stored['view.mode'] = activeMode;
        stored[`view.${activeMode}Settings`] = active;
        stored[`view.${otherMode}Settings`] = other;
    };

    // load and validate the stored blob. unknown keys and invalid values are
    // discarded so preferences survive settings being added, removed or
    // reshaped between releases.
    const load = (): Record<string, PrefValue> => {
        const result: Record<string, PrefValue> = {};
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const blob = JSON.parse(raw);
                if (blob?.version === storageVersion && typeof blob.values === 'object' && blob.values) {
                    migrate(blob.values);
                    for (const descriptor of descriptors) {
                        const value = blob.values[descriptor.key];
                        if (value !== undefined && descriptor.validate(value)) {
                            result[descriptor.key] = value;
                        }
                    }
                }
            }
        } catch {
            // corrupt or inaccessible storage - fall back to defaults
        }
        return result;
    };

    const values = load();

    // coalesce bursts of changes (slider drags, color picking) into a single
    // write per task
    let storageWarned = false;
    let writeScheduled = false;
    const scheduleWrite = () => {
        if (writeScheduled) {
            return;
        }
        writeScheduled = true;
        queueMicrotask(() => {
            writeScheduled = false;
            try {
                localStorage.setItem(storageKey, JSON.stringify({ version: storageVersion, values }));
            } catch {
                if (!storageWarned) {
                    storageWarned = true;
                    console.warn('preferences will not persist: localStorage is unavailable');
                }
            }
        });
    };

    // while suspended, changes are not captured. document loading and camera
    // pose playback suspend capture so programmatic changes don't overwrite
    // stored preferences.
    let suspendDepth = 0;
    events.on('preferences.suspend', () => {
        suspendDepth++;
    });
    events.on('preferences.resume', () => {
        suspendDepth = Math.max(0, suspendDepth - 1);
    });

    // apply stored preferences (or defaults) to the live state. every setting
    // is applied so side effects between settings self-heal, and the resolved
    // sceneConfig already contains url overrides, which win over stored values.
    const apply = (targets = descriptors) => {
        events.fire('preferences.suspend');
        try {
            for (const descriptor of targets) {
                const stored = urlHas(descriptor.urlPath) ? undefined : values[descriptor.key];
                const payload =
                    stored !== undefined
                        ? descriptor.toEvent
                            ? descriptor.toEvent(stored)
                            : stored
                        : descriptor.getDefault();
                events.fire(descriptor.setCommand, payload);
            }
        } finally {
            events.fire('preferences.resume');
        }
    };

    apply();

    // capture user changes. registered after the initial apply so it never
    // observes its own writes or the boot-time initialization events.
    descriptors.forEach((descriptor) => {
        events.on(descriptor.key, (value: EventValue) => {
            if (suspendDepth > 0) {
                return;
            }
            // values without fromEvent are already json-safe
            const stored = (descriptor.fromEvent ? descriptor.fromEvent(value) : value) as PrefValue;
            if (!descriptor.validate(stored)) {
                return;
            }
            if (JSON.stringify(values[descriptor.key]) === JSON.stringify(stored)) {
                return;
            }
            values[descriptor.key] = stored;
            scheduleWrite();
        });
    });

    // re-apply stored preferences (used by File > New)
    events.on('preferences.apply', () => {
        apply();
    });

    // clear stored preferences and restore defaults. language lives in its
    // own store (i18nextLng) but its default is 'automatic', so reset it too.
    events.on('preferences.reset', (group?: PreferenceGroup) => {
        const targets = group ? descriptors.filter((descriptor) => descriptor.group === group) : descriptors;
        for (const descriptor of targets) {
            delete values[descriptor.key];
        }
        scheduleWrite();
        apply(targets);
        if (!group || group === 'preferences') {
            i18n.setLanguage(null);
        }
    });
};

export { registerPreferences };
