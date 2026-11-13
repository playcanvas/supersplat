import { BooleanInput, Button, Container, Element, Label, SelectInput } from '@playcanvas/pcui';

import type { ImportGroup } from '../import-analysis';

import { i18n } from './localization';
import sceneImport from './svg/import.svg';

const createSvg = (svgString: string, args = {}) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement,
        ...args
    });
};

// how each kind of group other than a sequence imports, shown in the As column
const asKeys: Record<Exclude<ImportGroup['kind'], 'sequence'>, string> = {
    document: 'as-project',
    bundle: 'as-scene',
    model: 'as-scene',
    poses: 'as-poses',
    unsupported: 'unsupported'
};

// a group the user chose to import; a sequence may be split into separate models
type ImportChoice = {
    group: ImportGroup;
    separate: boolean;
};

// Lists what a mixed set of picked or dropped files was found to contain, as a
// table of files with an import box and, for sequences, how to import them.
class ImportReviewDialog extends Container {
    show: (groups: ImportGroup[]) => Promise<ImportChoice[] | null>;
    hide: () => void;

    constructor(args = {}) {
        args = {
            ...args,
            id: 'import-review-dialog',
            class: ['settings-dialog', 'blocks-shortcuts'],
            hidden: true,
            tabIndex: -1
        };

        super(args);

        const dialog = new Container({ id: 'dialog' });

        // header

        const headerIcon = createSvg(sceneImport, { id: 'icon' });
        const headerText = new Label({ id: 'text' });
        i18n.bindText(headerText, () => i18n.t('popup.import-review.header').toUpperCase());
        const header = new Container({ id: 'header' });
        header.append(headerIcon);
        header.append(headerText);

        // content: three column grids of files, the column heads apart from the
        // rows so the rows can scroll beneath them

        const tableHead = new Container({ class: ['file-table', 'file-table-head'] });
        ['files', 'import', 'as'].forEach((column) => {
            const head = new Label({ class: ['column-head', `column-${column}`] });
            i18n.bindText(head, `popup.import-review.column.${column}`);
            tableHead.append(head);
        });
        const table = new Container({ class: ['file-table', 'file-table-body'] });

        const content = new Container({ id: 'content' });
        content.append(tableHead);
        content.append(table);

        // Scroll the rows only when they don't fit: a scrolling box clips the
        // sequence dropdowns, which pcui positions against the window
        const fitRows = () => {
            table.class.remove('scrolling');
            table.class[table.dom.scrollHeight > table.dom.clientHeight ? 'add' : 'remove']('scrolling');
        };

        // footer

        const footer = new Container({ id: 'footer' });
        const cancelButton = new Button({ class: 'button' });
        i18n.bindText(cancelButton, 'popup.cancel');
        const importButton = new Button({ class: 'button' });
        i18n.bindText(importButton, 'popup.import-review.import');
        footer.append(cancelButton);
        footer.append(importButton);

        dialog.append(header);
        dialog.append(content);
        dialog.append(footer);
        this.append(dialog);

        let onCancel: () => void;
        let onImport: () => void;

        cancelButton.on('click', () => onCancel());
        importButton.on('click', () => onImport());

        const keydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
            } else if (e.key === 'Enter' && importButton.enabled) {
                e.preventDefault();
                e.stopPropagation();
                onImport();
            }
        };

        // the rows' cells, removed (and their bindings released) on close
        let cells: Element[] = [];

        this.show = (groups: ImportGroup[]) => {
            // The timeline plays one sequence at a time, so only one row may import
            // as a sequence: the first, by default
            let sequenceTicked = false;

            const rows = groups.map((group) => {
                const supported = group.kind !== 'unsupported';
                const ticked = supported && !(group.kind === 'sequence' && sequenceTicked);
                if (group.kind === 'sequence' && ticked) sequenceTicked = true;

                const name = new Label({ class: ['cell', 'file-name'], text: group.name });
                name.dom.title = group.name;
                name.class[supported ? 'remove' : 'add']('unsupported');

                // unsupported files can't be imported
                const include = new BooleanInput({ class: ['cell', 'include'], value: ticked, enabled: supported });

                let importAs: Element;
                let mode: SelectInput;
                if (group.kind === 'sequence') {
                    mode = new SelectInput({ class: ['cell', 'import-as'], defaultValue: 'sequence' });
                    i18n.bindOptions(mode, () => [
                        { v: 'sequence', t: i18n.t('popup.import-review.as-sequence') },
                        { v: 'separate', t: i18n.t('popup.import-review.as-scenes', { count: group.files.length }) }
                    ]);
                    importAs = mode;
                } else {
                    // the only way a single file imports, as plain text
                    const label = new Label({ class: ['cell', 'import-as', 'note'] });
                    i18n.bindText(label, `popup.import-review.${asKeys[group.kind]}`);
                    importAs = label;
                }

                name.class[ticked ? 'remove' : 'add']('skipped');
                if (mode) mode.enabled = ticked;

                [name, include, importAs].forEach((cell) => table.append(cell));
                cells.push(name, include, importAs);
                return { group, name, include, mode };
            });

            const asSequence = (r: (typeof rows)[number]) => r.include.value && r.mode?.value === 'sequence';

            rows.forEach((row) => {
                const changed = () => {
                    // ticking a second sequence unticks the one before it
                    if (asSequence(row)) {
                        rows.filter((r) => r !== row && asSequence(r)).forEach((r) => {
                            r.include.value = false;
                        });
                    }
                    update();
                };
                row.include.on('change', (value: boolean) => {
                    row.name.class[value ? 'remove' : 'add']('skipped');
                    if (row.mode) row.mode.enabled = value;
                    changed();
                });
                row.mode?.on('change', changed);
            });

            const update = () => {
                importButton.enabled = rows.some((r) => r.include.value);
            };
            update();

            this.hidden = false;
            fitRows();
            window.addEventListener('resize', fitRows);
            document.addEventListener('keydown', keydown);
            this.dom.focus();

            return new Promise<ImportChoice[] | null>((resolve) => {
                onCancel = () => resolve(null);
                onImport = () => {
                    resolve(
                        rows
                            .filter((r) => r.include.value)
                            .map((r) => ({ group: r.group, separate: r.mode?.value === 'separate' }))
                    );
                };
            }).finally(() => {
                document.removeEventListener('keydown', keydown);
                window.removeEventListener('resize', fitRows);
                this.hide();
                cells.forEach((cell) => cell.destroy());
                cells = [];
            });
        };

        this.hide = () => {
            this.hidden = true;
        };
    }
}

export { ImportReviewDialog };
export type { ImportChoice };
