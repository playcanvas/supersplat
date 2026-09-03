// Accepts numbers separated by commas, whitespace or newlines, e.g. "1,2,3",
// "1 2 3" or a multi-line block. Returns null unless exactly `count` finite
// numbers are found.
const parseNumbers = (text: string, count: number): number[] | null => {
    const parts = text.trim().split(/[\s,]+/).filter(p => p.length > 0);
    if (parts.length !== count) return null;
    const nums = parts.map(Number);
    if (nums.some(n => !Number.isFinite(n))) return null;
    return nums;
};

// Right-align the columns of a table of strings and join into lines.
const alignColumns = (rows: string[][], gap = '  ') => {
    const widths: number[] = [];
    rows.forEach((row) => {
        row.forEach((cell, i) => {
            widths[i] = Math.max(widths[i] ?? 0, cell.length);
        });
    });
    return rows.map(row => row.map((cell, i) => cell.padStart(widths[i])).join(gap)).join('\n');
};

const flash = (dom: HTMLElement, cls: string) => {
    dom.classList.add(cls);
    setTimeout(() => dom.classList.remove(cls), 250);
};

type EditableText = {
    // display is shown at rest. full (defaults to display) replaces it while
    // the element is focused, so a select-all + copy yields exact values.
    update: (display: string, full?: string) => void;
};

// Turns an element into an inline plain-text editor. Enter commits, Escape
// cancels, and blur commits if the text changed. commit returns false to flag
// the text as invalid.
const makeEditable = (dom: HTMLElement, commit: (text: string) => boolean): EditableText => {
    dom.setAttribute('contenteditable', 'plaintext-only');
    dom.setAttribute('spellcheck', 'false');
    dom.classList.add('editable-text');

    // latest values; DOM updates are suppressed while the user is editing so
    // their input isn't overwritten
    let display = '';
    let full = '';
    let editing = false;
    let canceled = false;
    let focusText = '';

    dom.addEventListener('focus', () => {
        editing = true;
        canceled = false;
        focusText = full;
        dom.textContent = full;
        // select all text so the user can start typing to replace
        const range = document.createRange();
        range.selectNodeContents(dom);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    });

    // stop key events reaching the editor's global shortcut handlers
    const stopKey = (e: KeyboardEvent) => e.stopPropagation();
    dom.addEventListener('keydown', (e: KeyboardEvent) => {
        stopKey(e);
        if (e.key === 'Enter') {
            e.preventDefault();
            dom.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            canceled = true;
            dom.blur();
        }
    });
    dom.addEventListener('keyup', stopKey);
    dom.addEventListener('keypress', stopKey);

    dom.addEventListener('blur', () => {
        const wasCanceled = canceled;
        editing = false;
        canceled = false;
        // clear any leftover selection
        window.getSelection()?.removeAllRanges();

        // innerText keeps line breaks the browser may have inserted as <br>
        const text = dom.innerText;
        if (!wasCanceled && text !== focusText) {
            flash(dom, commit(text) ? 'flash-ok' : 'flash-bad');
        }

        // restore the live display; the next update picks up any change
        // resulting from the edit
        dom.textContent = display;
    });

    return {
        update: (d: string, f: string = d) => {
            display = d;
            full = f;
            if (!editing && dom.textContent !== d) {
                dom.textContent = d;
            }
        }
    };
};

export { parseNumbers, alignColumns, makeEditable };
