import { Container, Label } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';
import { SplatList } from './splat-list';
import { Transform } from './transform';

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

        const sceneImport = new Label({
            text: '\uE245',
            class: `panel-header-button`
        });

        const sceneNew = new Label({
            text: '\uE208',
            class: `panel-header-button`
        });

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
    }
}

export { ScenePanel };
