import { Container, Element, Label } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';
import { SplatList } from './splat-list';
import { Transform } from './transform';
import { localize } from './localization';

import sceneImportSvg from '../svg/import.svg';
import sceneNewSvg from '../svg/new.svg';
import { ColorPanel } from './color-panel';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class ScenePanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'scene-panel',
            class: 'panel'
        };

        super(args);

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const sceneHeader = new Container({
            class: `panel-header`
        });

        const sceneIcon = new Label({
            text: '\uE344',
            class: `panel-header-icon`
        });

        const sceneLabel = new Label({
            text: localize('scene-manager'),
            class: `panel-header-label`
        });

        const sceneImport = new Container({
            class: `panel-header-button`
        });
        sceneImport.dom.appendChild(createSvg(sceneImportSvg));

        const sceneNew = new Container({
            class: `panel-header-button`
        });
        sceneNew.dom.appendChild(createSvg(sceneNewSvg));

        sceneHeader.append(sceneIcon);
        sceneHeader.append(sceneLabel);
        sceneHeader.append(sceneImport);
        sceneHeader.append(sceneNew);

        sceneImport.on('click', () => {
            events.fire('scene.open');
        });

        sceneNew.on('click', () => {
            events.invoke('scene.new');
        });

        tooltips.register(sceneImport, 'Import Scene', 'top');
        tooltips.register(sceneNew, 'New Scene', 'top');

        const splatList = new SplatList(events);

        const splatListContainer = new Container({
            class: 'splat-list-container'
        });
        splatListContainer.append(splatList);

        const transformHeader = new Container({
            class: `panel-header`
        });

        const transformIcon = new Label({
            text: '\uE111',
            class: `panel-header-icon`
        });

        const transformLabel = new Label({
            text: localize('transform'),
            class: `panel-header-label`
        });

        transformHeader.append(transformIcon);
        transformHeader.append(transformLabel);

        const colorHeader = new Container({
            class: `panel-header`
        });

        const colorIcon = new Label({
            text: '\uE111',
            class: `panel-header-icon`
        });

        const colorLabel = new Label({
            text: localize('color'),
            class: `panel-header-label`
        });

        colorHeader.append(colorIcon);
        colorHeader.append(colorLabel);

        this.append(sceneHeader);
        this.append(splatListContainer);
        this.append(transformHeader);
        this.append(new Transform(events));
        this.append(colorHeader);
        this.append(new ColorPanel(events));
        this.append(new Element({
            class: `panel-header`,
            height: 20
        }));
    }
}

export { ScenePanel };
