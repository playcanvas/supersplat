import { Color } from 'playcanvas';

import { Events } from './events';
import { SceneConfig } from './scene-config';
import { i18n } from './ui/localization';

const storageKey = 'supersplat:preferences';
const storageVersion = 1;

type PrefValue = boolean | number | string | number[] | string[];
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
    getDefault: () => any;
    // validate a stored (json) value
    validate: (value: PrefValue) => boolean;
    // owning panel for scoped reset; omitted for toolbar-only settings
    group?: PreferenceGroup;
    // stored (json) value -> event payload
    toEvent?: (value: PrefValue) => any;
    // notify payload -> stored (json) value
    fromEvent?: (value: any) => PrefValue;
};

// mirror the kebab-case matching used by scene-config's Params so url
// detection agrees with how getSceneConfig consumed the query parameters
const kebabize = (s: string) => s.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? '-' : '') + $.toLowerCase());

const registerPreferences = (events: Events, config: SceneConfig, urlArgs: any) => {
    // returns true if the url query args specify the given config path
    const urlHas = (path?: string) => {
        if (!path) {
            return false;
        }
        const lookup = (segments: string[]) => {
            let obj = urlArgs;
            for (const segment of segments) {
                if (typeof obj !== 'object' || obj === null || !obj.hasOwnProperty(segment)) {
                    return undefined;
                }
                obj = obj[segment];
            }
            return obj;
        };
        const parts = path.split('.');
        return lookup(parts.map(kebabize)) !== undefined || lookup(parts) !== undefined;
    };

    const isBool = (v: PrefValue) => typeof v === 'boolean';
    const isNumber = (min: number, max: number) => (v: PrefValue) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    const isEnum = (options: string[]) => (v: PrefValue) => typeof v === 'string' && options.includes(v);
    const isColor = (v: PrefValue) => Array.isArray(v) && v.length === 4 && v.every(c => typeof c === 'number' && c >= 0 && c <= 1);

    const color = (key: string, setCommand: string, getDefault: () => { r: number, g: number, b: number, a: number }): Descriptor => ({
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
        { key: 'camera.tonemapping', setCommand: 'camera.setTonemapping', urlPath: 'camera.toneMapping', getDefault: () => config.camera.toneMapping, validate: isEnum(['linear', 'neutral', 'aces', 'aces2', 'filmic', 'hejl']), group: 'preferences' },
        { key: 'camera.fovDolly', setCommand: 'camera.setFovDolly', getDefault: () => false, validate: isBool, group: 'preferences' },
        { key: 'camera.fov', setCommand: 'camera.setFov', urlPath: 'camera.fov', getDefault: () => config.camera.fov, validate: isNumber(10, 120), group: 'preferences' },
        { key: 'view.bands', setCommand: 'view.setBands', urlPath: 'show.shBands', getDefault: () => config.show.shBands, validate: v => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3, group: 'preferences' },
        { key: 'camera.flySpeed', setCommand: 'camera.setFlySpeed', getDefault: () => 1, validate: isNumber(0.1, 30), group: 'preferences' },
        { key: 'view.centerSize', setCommand: 'view.setCenterSize', getDefault: () => 2, validate: isNumber(0, 10), group: 'appearance' },
        // the editor skips its footprint-crossing profile swap while preference
        // application is in flight (see preferences.suspend), so the footprint,
        // the live flags and the inactive profile all apply verbatim here. The
        // live visibility flags are the ACTIVE footprint mode's profile, so
        // their defaults depend on the live footprint - which sits earlier in
        // this table and has already been applied when they are evaluated
        { key: 'selection.useDepth', setCommand: 'selection.setUseDepth', getDefault: () => false, validate: isBool },
        { key: 'selection.footprint', setCommand: 'selection.setFootprint', getDefault: () => 0, validate: isNumber(0, 1) },
        { key: 'view.gaussians', setCommand: 'view.setGaussians', getDefault: () => true, validate: isBool, group: 'appearance' },
        { key: 'view.centers', setCommand: 'view.setCenters', getDefault: () => (events.invoke('selection.footprint') as number) === 0, validate: isBool, group: 'appearance' },
        { key: 'view.rings', setCommand: 'view.setRings', getDefault: () => (events.invoke('selection.footprint') as number) > 0, validate: isBool, group: 'appearance' },
        { key: 'view.ringSize', setCommand: 'view.setRingSize', getDefault: () => 4, validate: isNumber(1, 50), group: 'appearance' },
        { key: 'view.splatsColorBlend', setCommand: 'view.setSplatsColorBlend', getDefault: () => 0, validate: isNumber(0, 1), group: 'appearance' },
        { key: 'view.splatsSelectionBlend', setCommand: 'view.setSplatsSelectionBlend', getDefault: () => 1, validate: isNumber(0, 1), group: 'appearance' },
        { key: 'view.centersColorBlend', setCommand: 'view.setCentersColorBlend', getDefault: () => 1, validate: isNumber(0, 1), group: 'appearance' },
        { key: 'view.centersSelectionBlend', setCommand: 'view.setCentersSelectionBlend', getDefault: () => 1, validate: isNumber(0, 1), group: 'appearance' },
        { key: 'view.ringsColorBlend', setCommand: 'view.setRingsColorBlend', getDefault: () => 0, validate: isNumber(0, 1), group: 'appearance' },
        { key: 'view.ringsSelectionBlend', setCommand: 'view.setRingsSelectionBlend', getDefault: () => 1, validate: isNumber(0, 1), group: 'appearance' },
        { key: 'view.selectionColor', setCommand: 'view.setSelectionColor', getDefault: () => false, validate: isBool, group: 'appearance' },
        { key: 'view.selectionCenters', setCommand: 'view.setSelectionCenters', getDefault: () => (events.invoke('selection.footprint') as number) === 0, validate: isBool, group: 'appearance' },
        { key: 'view.selectionRings', setCommand: 'view.setSelectionRings', getDefault: () => (events.invoke('selection.footprint') as number) > 0, validate: isBool, group: 'appearance' },
        // the inactive footprint mode's view profile: 0/1 flags in
        // [gaussians, centers, rings, selectionCenters, selectionRings] order.
        // The default is the opposite mode's arrangement, so it reads the live
        // footprint - selection.footprint sits earlier in this table and has
        // already been applied by the time this default is evaluated
        { key: 'view.inactiveProfile', setCommand: 'view.setInactiveProfile', getDefault: () => ((events.invoke('selection.footprint') as number) > 0 ? [1, 1, 0, 1, 0] : [1, 0, 1, 0, 1]), validate: v => Array.isArray(v) && v.length === 5 && v.every(x => x === 0 || x === 1), group: 'appearance' },
        { key: 'view.outlineSelection', setCommand: 'view.setOutlineSelection', getDefault: () => false, validate: isBool, group: 'appearance' },
        { key: 'view.stochastic', setCommand: 'view.setStochastic', getDefault: () => 'auto', validate: isEnum(['disabled', 'enabled', 'movement', 'auto']), group: 'preferences' },
        { key: 'view.perfOverlay', setCommand: 'view.setPerfOverlay', getDefault: () => false, validate: isBool, group: 'overlays' },
        { key: 'grid.visible', setCommand: 'grid.setVisible', urlPath: 'show.grid', getDefault: () => config.show.grid, validate: isBool, group: 'overlays' },
        { key: 'grid.planes', setCommand: 'grid.setPlanes', getDefault: () => ['xz'], validate: v => Array.isArray(v) && v.length <= 3 && new Set(v).size === v.length && v.every(p => ['xz', 'xy', 'yz'].includes(p as string)), group: 'overlays' },
        { key: 'camera.bound', setCommand: 'camera.setBound', urlPath: 'show.bound', getDefault: () => config.show.bound, validate: isBool, group: 'overlays' },
        { key: 'camera.boundDimensions', setCommand: 'camera.setBoundDimensions', urlPath: 'show.boundDimensions', getDefault: () => config.show.boundDimensions, validate: isBool, group: 'overlays' },
        { key: 'camera.showPoses', setCommand: 'camera.setShowPoses', urlPath: 'show.cameraPoses', getDefault: () => config.show.cameraPoses, validate: isBool, group: 'overlays' },
        { key: 'camera.showInfo', setCommand: 'camera.setShowInfo', urlPath: 'show.cameraInfo', getDefault: () => config.show.cameraInfo, validate: isBool, group: 'overlays' },
        { key: 'camera.controlMode', setCommand: 'camera.setControlMode', getDefault: () => 'orbit', validate: isEnum(['orbit', 'fly']) }
    ];

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
                    for (const descriptor of descriptors) {
                        const value = blob.values[descriptor.key];
                        if (value !== undefined && descriptor.validate(value)) {
                            result[descriptor.key] = value;
                        }
                    }
                }
            }
        } catch (e) {
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
            } catch (e) {
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
                const payload = stored !== undefined ? (descriptor.toEvent ? descriptor.toEvent(stored) : stored) : descriptor.getDefault();
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
        events.on(descriptor.key, (value: any) => {
            if (suspendDepth > 0) {
                return;
            }
            const stored = descriptor.fromEvent ? descriptor.fromEvent(value) : value;
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
        const targets = group ? descriptors.filter(descriptor => descriptor.group === group) : descriptors;
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
