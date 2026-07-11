// Map the keyboard modifiers held during a selection gesture to a selection op.
// shift+ctrl = intersect, shift = add, ctrl = remove, none = set.
const opFromModifiers = (e: { shiftKey: boolean; ctrlKey: boolean }) => {
    if (e.shiftKey && e.ctrlKey) return 'intersect';
    if (e.shiftKey) return 'add';
    if (e.ctrlKey) return 'remove';
    return 'set';
};

export { opFromModifiers };
