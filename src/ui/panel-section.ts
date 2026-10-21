import { Container, Element, Label } from '@playcanvas/pcui';

import { i18n } from './localization';
import arrowSvg from './svg/arrow.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

type PanelSectionArgs = {
    id?: string;
    // a pc-icon font glyph or an svg data uri
    icon: string;
    localeKey: string;
    collapsed?: boolean;
};

// a collapsible section of a panel: a header bar (click to expand/collapse)
// over a body of label + control rows sharing one control column
class PanelSection extends Container {
    header: Container;
    content: Container;

    constructor(args: PanelSectionArgs) {
        super({
            id: args.id,
            class: 'panel-section'
        });

        const header = new Container({
            class: ['panel-header', 'panel-section-header']
        });

        const icon = new Label({
            class: 'panel-header-icon'
        });
        if (args.icon.startsWith('data:image/svg+xml,')) {
            icon.dom.appendChild(createSvg(args.icon));
        } else {
            icon.text = args.icon;
        }

        const label = new Label({
            class: 'panel-header-label'
        });
        i18n.bindText(label, args.localeKey);

        const collapseArrow = new Label({
            class: 'panel-section-collapse'
        });
        collapseArrow.dom.appendChild(createSvg(arrowSvg));

        header.append(icon);
        header.append(label);
        header.append(collapseArrow);

        const content = new Container({
            class: 'panel-section-content'
        });

        this.append(header);
        this.append(content);

        // the header acts as a button: focusable, toggleable from the
        // keyboard, and announcing its expanded state
        header.dom.setAttribute('role', 'button');
        header.dom.setAttribute('tabindex', '0');

        // the section carries the state as a class so siblings appended after
        // the content (e.g. a closing strip) can collapse with it in css
        const setCollapsed = (collapsed: boolean) => {
            content.hidden = collapsed;
            this.class[collapsed ? 'add' : 'remove']('collapsed');
            header.dom.setAttribute('aria-expanded', String(!collapsed));
        };
        setCollapsed(!!args.collapsed);

        header.on('click', () => setCollapsed(!content.hidden));
        header.dom.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setCollapsed(!content.hidden);
            }
        });

        this.header = header;
        this.content = content;
    }

    // append a labelled row, the control sitting in the shared control column
    addRow(localeKey: string, control: Element) {
        const row = new Container({
            class: 'panel-section-row'
        });

        const label = new Label({
            class: 'panel-section-label'
        });
        i18n.bindText(label, localeKey);

        control.class.add('panel-section-control');

        row.append(label);
        row.append(control);
        this.content.append(row);

        return row;
    }
}

export { PanelSection };
