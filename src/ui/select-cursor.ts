import { Events } from '../events';
import { opFromModifiers } from '../select-op';
import addCursor from './svg/cursor-add.svg';
import intersectCursor from './svg/cursor-intersect.svg';
import removeCursor from './svg/cursor-remove.svg';

// tools whose selection op is driven by shift/ctrl modifiers (see opFromModifiers)
const pointerTools = new Set([
    'rectSelection',
    'brushSelection',
    'floodSelection',
    'polygonSelection',
    'lassoSelection'
]);

// op → cursor image (data-URI). 'set' is intentionally absent: it clears the
// inline style so the underlying default/crosshair cursor applies.
const cursors: Record<string, string> = {
    add: addCursor,
    remove: removeCursor,
    intersect: intersectCursor
};

// Set (or clear, for 'set') the op cursor on an element. Hotspot at the crosshair
// centre (16 16); the trailing `crosshair` is the fallback when the browser can't
// render an SVG cursor (older Safari). Shared by the selection tools and the
// histogram so both surfaces show the same add/remove/intersect badge.
const applyOpCursor = (element: HTMLElement, op: string) => {
    element.style.cursor = cursors[op] ? `url("${cursors[op]}") 16 16, crosshair` : '';
};

// While a pointer selection tool is active, swap the cursor on the tools overlay
// to reflect the op the held modifiers will produce, so the user sees
// add/remove/intersect before acting.
const registerSelectCursor = (events: Events, toolsContainer: HTMLElement) => {
    let engaged = false;
    // track modifier state so the cursor is correct the instant a tool is activated
    // with Shift/Ctrl already held, not only after the next key event.
    const modifiers = { shiftKey: false, ctrlKey: false };

    const refresh = () => {
        if (engaged) {
            applyOpCursor(toolsContainer, opFromModifiers(modifiers));
        }
    };

    const onKey = (e: KeyboardEvent) => {
        modifiers.shiftKey = e.shiftKey;
        modifiers.ctrlKey = e.ctrlKey;
        refresh();
    };

    events.on('tool.activated', (name: string) => {
        engaged = pointerTools.has(name);
        refresh();
    });

    events.on('tool.deactivated', () => {
        engaged = false;
        applyOpCursor(toolsContainer, 'set');
    });

    // capture phase so we still see keydown/keyup when a focused dialog stops
    // propagation; blur clears the tracked modifiers because a key release while
    // unfocused never fires. (mirrors the modifier tracking in controllers.ts)
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('keyup', onKey, { capture: true });
    window.addEventListener('blur', () => {
        modifiers.shiftKey = false;
        modifiers.ctrlKey = false;
        refresh();
    });
};

export { registerSelectCursor, applyOpCursor };
