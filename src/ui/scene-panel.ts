import { Container, Element, Label } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';
import { SplatList } from './splat-list';
import { Transform } from './transform';

import sceneImportSvg from '../svg/import.svg';
import sceneNewSvg from '../svg/new.svg';

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

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const sceneHeader = new Container({
            class: `panel-header`
        });

        const sceneIcon = new Label({
            text: '\uE344',
            class: `panel-header-icon`
        });

        const sceneLabel = new Label({
            text: 'SCENE MANAGER',
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

        const transformHeader = new Container({
            class: `panel-header`
        });

        const transformIcon = new Label({
            text: '\uE111',
            class: `panel-header-icon`
        });

        const transformLabel = new Label({
            text: 'TRANSFORM',
            class: `panel-header-label`
        });

        transformHeader.append(transformIcon);
        transformHeader.append(transformLabel);

        this.append(sceneHeader);
        this.append(splatList);
        this.append(transformHeader);
        this.append(new Transform(events));
        this.append(new Element({
            class: `panel-header`,
            height: 20
        }));
    }
}

export { ScenePanel };
