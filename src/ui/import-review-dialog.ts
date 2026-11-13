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

// a group the user chose to import; a sequence may be split into separate models
type ImportChoice = {
    group: ImportGroup;
    separate: boolean;
};

const details = (group: ImportGroup) => {
    switch (group.kind) {
        case 'sequence': {
            const frames = i18n.t('popup.import-review.frames', { count: group.files.length });
            return group.missing
                ? `${frames}, ${i18n.t('popup.import-review.missing', { count: group.missing })}`
                : frames;
        }
        case 'bundle':
            return i18n.t('popup.import-review.files', { count: group.files.length });
        case 'unsupported':
            return i18n.t('popup.import-review.skipped');
        default:
            return '';
    }
};

// Lists what a mixed set of picked or dropped files was found to contain, and
// lets the user choose which groups to import and how to load each sequence.
class ImportReviewDialog extends Container {
    show: (groups: ImportGroup[], fileCount: number) => Promise<ImportChoice[] | null>;
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

        // content

        let fileTotal = 0;
        const summary = new Label({ class: 'summary' });
        i18n.bindText(summary, () => i18n.t('popup.import-review.summary', { count: i18n.formatInteger(fileTotal) }));
        const list = new Container({ class: 'group-list' });
        const content = new Container({ id: 'content' });
        content.append(summary);
        content.append(list);

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

        this.show = (groups: ImportGroup[], fileCount: number) => {
            fileTotal = fileCount;
            summary.text = i18n.t('popup.import-review.summary', { count: i18n.formatInteger(fileCount) });

            const rows = groups.map((group) => {
                const supported = group.kind !== 'unsupported';
                const row = new Container({ class: ['row', 'group-row', `group-${group.kind}`] });

                const include = new BooleanInput({ class: 'include', value: supported, enabled: supported });
                const kind = new Label({ class: 'kind' });
                i18n.bindText(kind, `popup.import-review.kind.${group.kind}`);
                const name = new Label({ class: 'name', text: group.name });
                name.dom.title = group.name;
                const info = new Label({ class: 'details' });
                i18n.bindText(info, () => details(group));

                row.append(include);
                row.append(kind);
                row.append(name);
                row.append(info);

                let mode: SelectInput;
                if (group.kind === 'sequence') {
                    mode = new SelectInput({ class: 'mode', defaultValue: 'sequence' });
                    i18n.bindOptions(mode, () => [
                        { v: 'sequence', t: i18n.t('popup.import-review.as-sequence') },
                        { v: 'separate', t: i18n.t('popup.import-review.as-models') }
                    ]);
                    row.append(mode);
                }

                list.append(row);
                return { group, include, mode };
            });

            const update = () => {
                importButton.enabled = rows.some((r) => r.include.value);
            };
            rows.forEach((r) => r.include.on('change', update));
            update();

            this.hidden = false;
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
                this.hide();
                // the rows' localization bindings are released with them
                list.clear();
            });
        };

        this.hide = () => {
            this.hidden = true;
        };
    }
}

export { ImportReviewDialog };
export type { ImportChoice };
