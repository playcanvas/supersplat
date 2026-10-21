import { Container, Element } from '@playcanvas/pcui';

import { i18n } from './localization';
import { MenuPanel } from './menu-panel';

// a value that can be copied and pasted. parse validates (and clamps) a
// pasted value, returning undefined to reject it
type ClipboardField = {
    get: () => unknown;
    parse: (value: unknown) => unknown;
};

// a set of fields copied and pasted together, e.g. a panel section. apply
// receives the parsed values of just the fields being pasted
type ClipboardSource = {
    fields: Record<string, ClipboardField>;
    apply: (values: Record<string, unknown>) => void;
    enabled?: () => boolean;
};

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const numberField = (get: () => number, min = -Infinity, max = Infinity): ClipboardField => ({
    get,
    parse: value => (isNumber(value) ? clamp(value, min, max) : undefined)
});

const vectorField = (get: () => number[], dimensions: number): ClipboardField => ({
    get,
    parse: value => (Array.isArray(value) && value.length === dimensions && value.every(isNumber) ? value : undefined)
});

// copies [r, g, b] in 0..1, and also accepts a '#rrggbb' hex string
const colorField = (get: () => number[]): ClipboardField => ({
    get,
    parse: (value) => {
        if (typeof value === 'string') {
            const match = /^#?([0-9a-f]{6})$/i.exec(value);
            if (!match) {
                return undefined;
            }
            const n = parseInt(match[1], 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => c / 255);
        }
        return Array.isArray(value) && value.length === 3 && value.every(isNumber) ? value.map(c => clamp(c, 0, 1)) : undefined;
    }
});

// round away float noise (0.30000000000000004, -0) while keeping far more
// precision than the panels display
const tidy = (value: unknown): unknown => {
    if (isNumber(value)) {
        return Math.round(value * 1e6) / 1e6 + 0;
    }
    return Array.isArray(value) ? value.map(tidy) : value;
};

// clipboard text is JSON, but text from elsewhere (e.g. a bare #rrggbb) is
// taken as a string
const parseText = (text: string) => {
    try {
        return JSON.parse(text);
    } catch {
        return text.trim();
    }
};

// the fields a paste sets. a row (key given) takes its bare value or its own
// key out of a copied section; a section takes any subset of its keys
const resolve = (source: ClipboardSource, key: string | undefined, value: unknown) => {
    const pairs = key ?
        [[key, isObject(value) && key in value ? value[key] : value]] :
        (isObject(value) ? Object.keys(source.fields).filter(k => k in value).map(k => [k, value[k]]) : []);

    if (pairs.length === 0) {
        return null;
    }

    const result: Record<string, unknown> = {};
    for (const [k, v] of pairs) {
        const parsed = source.fields[k as string].parse(v);
        if (parsed === undefined) {
            return null;
        }
        result[k as string] = parsed;
    }
    return result;
};

type Active = {
    target: Element;
    source: ClipboardSource;
    key?: string;
};

// the shared right-click copy/paste menu. Panels register a header (the whole
// source) or a row (one field) as targets; the target is outlined while the
// menu is open so the scope of the copy is clear
class ClipboardMenu extends Container {
    private menu: MenuPanel;
    private active: Active = null;

    constructor() {
        super({
            class: 'clipboard-menu'
        });

        const enabled = () => this.active?.source.enabled?.() ?? true;

        this.menu = new MenuPanel([{
            text: () => i18n.t('panel.clipboard.copy'),
            isEnabled: enabled,
            onSelect: () => this.copy()
        }, {
            text: () => i18n.t('panel.clipboard.paste'),
            isEnabled: enabled,
            onSelect: () => this.paste()
        }]);
        this.append(this.menu);

        this.menu.on('hide', () => {
            this.active?.target.class.remove('clipboard-target');
        });

        const dismiss = (event: Event) => {
            if (!this.menu.hidden && !this.menu.dom.contains(event.target as Node)) {
                this.menu.hidden = true;
            }
        };
        window.addEventListener('pointerdown', dismiss, true);
        window.addEventListener('wheel', dismiss, true);
        window.addEventListener('blur', () => {
            this.menu.hidden = true;
        });
        window.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !this.menu.hidden) {
                event.stopPropagation();
                this.menu.hidden = true;
            }
        }, true);
    }

    // right-clicking target copies/pastes the whole source, or just its `key` field
    register(target: Element, source: ClipboardSource, key?: string) {
        target.dom.addEventListener('contextmenu', (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            this.show(event, { target, source, key });
        });
    }

    private show(event: MouseEvent, active: Active) {
        this.menu.hidden = true;
        this.active = active;
        active.target.class.add('clipboard-target');
        this.menu.hidden = false;

        // at the cursor, or under the target when opened from the keyboard.
        // offset so the releasing right button doesn't land on the first row
        let x = event.clientX + 2;
        let y = event.clientY + 2;
        if (event.clientX === 0 && event.clientY === 0) {
            const rect = active.target.dom.getBoundingClientRect();
            x = rect.left;
            y = rect.bottom;
        }

        const style = this.menu.dom.style;
        style.left = `${Math.max(0, Math.min(x, window.innerWidth - this.menu.dom.offsetWidth - 4))}px`;
        style.top = `${Math.max(0, Math.min(y, window.innerHeight - this.menu.dom.offsetHeight - 4))}px`;
    }

    // briefly mark the target red when a copy or paste fails
    private reject(target: Element) {
        target.class.add('clipboard-invalid');
        setTimeout(() => target.class.remove('clipboard-invalid'), 400);
    }

    private async copy() {
        const { target, source, key } = this.active;
        const value = key ?
            tidy(source.fields[key].get()) :
            Object.fromEntries(Object.entries(source.fields).map(([k, field]) => [k, tidy(field.get())]));

        try {
            await navigator.clipboard.writeText(JSON.stringify(value));
        } catch {
            this.reject(target);
        }
    }

    private async paste() {
        const { target, source, key } = this.active;
        const text = await navigator.clipboard.readText().catch((): string => null);
        const values = text === null ? null : resolve(source, key, parseText(text));

        // the source may have been disabled while the browser asked for permission
        if (values && (source.enabled?.() ?? true)) {
            source.apply(values);
        } else {
            this.reject(target);
        }
    }
}

export { ClipboardMenu, ClipboardSource, colorField, numberField, vectorField };
