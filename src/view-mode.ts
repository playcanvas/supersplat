// The editor's two modes and the settings each one owns. Centers mode marks
// every gaussian with a dot at its centre and selects by centre point; Rings
// mode outlines every gaussian's footprint and selects by footprint. The
// appearance of unselected and selected gaussians and the pick depth are
// remembered per mode, so switching mode swaps the whole arrangement.
type ViewMode = 'centers' | 'rings';

type ModeSettings = {
    // unselected gaussians: draw them, their markers, and how far their colour
    // blends toward the flat unselected colour (gaussians, centres, rings)
    gaussians: boolean;
    centers: boolean;
    rings: boolean;
    splatsColorBlend: number;
    centersColorBlend: number;
    ringsColorBlend: number;
    // selected gaussians: draw them, tint them, their markers, the outline, and
    // how far each surface blends toward the selection colour
    selectionGaussians: boolean;
    selectionColor: boolean;
    selectionCenters: boolean;
    selectionRings: boolean;
    outlineSelection: boolean;
    splatsSelectionBlend: number;
    centersSelectionBlend: number;
    ringsSelectionBlend: number;
    // screen-space picks take the visible surface (true) or everything through
    // all depths (false)
    useDepth: boolean;
};

type ModeSettingKey = keyof ModeSettings;

const MODE_SETTING_KEYS: ModeSettingKey[] = [
    'gaussians',
    'centers',
    'rings',
    'splatsColorBlend',
    'centersColorBlend',
    'ringsColorBlend',
    'selectionGaussians',
    'selectionColor',
    'selectionCenters',
    'selectionRings',
    'outlineSelection',
    'splatsSelectionBlend',
    'centersSelectionBlend',
    'ringsSelectionBlend',
    'useDepth'
];

const VIEW_MODES: ViewMode[] = ['centers', 'rings'];

const modeDefaults = (mode: ViewMode): ModeSettings => ({
    gaussians: true,
    centers: mode === 'centers',
    rings: mode === 'rings',
    splatsColorBlend: 0,
    centersColorBlend: 1,
    ringsColorBlend: 0,
    selectionGaussians: true,
    selectionColor: false,
    selectionCenters: mode === 'centers',
    selectionRings: mode === 'rings',
    outlineSelection: false,
    splatsSelectionBlend: 1,
    centersSelectionBlend: 1,
    ringsSelectionBlend: 1,
    useDepth: mode === 'rings'
});

const isBlend = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

// a stored settings object: every present key must be valid; missing keys
// take their defaults when applied
const isModeSettings = (v: unknown): v is Partial<ModeSettings> => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
        return false;
    }
    const defaults = modeDefaults('centers');
    return Object.entries(v).every(([key, value]) => {
        if (!MODE_SETTING_KEYS.includes(key as ModeSettingKey)) {
            return false;
        }
        return typeof defaults[key as ModeSettingKey] === 'boolean' ? typeof value === 'boolean' : isBlend(value);
    });
};

export { MODE_SETTING_KEYS, VIEW_MODES, modeDefaults, isModeSettings };
export type { ViewMode, ModeSettings, ModeSettingKey };
