import { Container, Label } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';
import { SplatList } from './splat-list';
import { Transform } from './transform';

const CLASS = 'scene-panel';

class ScenePanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: CLASS,
            headerText: 'SCENE MANAGER'
        };

        super(args);

        const handleDown = (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
        };

        this.dom.addEventListener('pointerdown', (event) => {
            handleDown(event);
        });

        const sceneHeader = new Container({
            class: `${CLASS}-header`
        });

        const sceneIcon = new Label({
            text: '\uE344',
            class: `${CLASS}-header-icon`
        });

        const sceneLabel = new Label({
            text: 'SCENE MANAGER',
            class: `${CLASS}-header-label`
        });

        const sceneImport = new Label({
            text: '\uE245',
            class: `${CLASS}-header-button`
        });

        const sceneNew = new Label({
            text: '\uE208',
            class: `${CLASS}-header-button`
        });

        sceneHeader.append(sceneIcon);
        sceneHeader.append(sceneLabel);
        sceneHeader.append(sceneImport);
        sceneHeader.append(sceneNew);

        sceneImport.on('click', () => {
            events.fire('scene.open');
        });

        sceneNew.on('click', () => {
            events.fire('scene.new');
        });

        tooltips.register(sceneImport, 'Import Scene', 'top');
        tooltips.register(sceneNew, 'New Scene', 'top');

        const splatList = new SplatList(events);

        const transformHeader = new Container({
            class: `${CLASS}-header`
        });

        const transformIcon = new Label({
            text: '\uE111',
            class: `${CLASS}-header-icon`
        });

        const transformLabel = new Label({
            text: 'TRANSFORM',
            class: `${CLASS}-header-label`
        });

        transformHeader.append(transformIcon);
        transformHeader.append(transformLabel);

        this.append(sceneHeader);
        this.append(splatList);
        this.append(transformHeader);
        this.append(new Transform(events));
    }
};

export { ScenePanel };
