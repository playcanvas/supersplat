import { Container, Label } from 'pcui';
import { Events } from '../events';
import { Transform } from './transform';

class ScenePanel extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'scene-panel',
            headerText: 'SCENE MANAGER'
        };

        super(args);

        const sceneHeader = new Container({
            class: 'scene-panel-header'
        });

        const sceneLabel = new Label({
            text: 'SCENE MANAGER'
        });

        sceneHeader.append(sceneLabel);

        const transformHeader = new Container({
            class: 'scene-panel-header'
        });

        const transformLabel = new Label({
            text: 'TRANSFORM'
        });

        transformHeader.append(transformLabel);

        this.append(sceneHeader);
        this.append(transformHeader);
        this.append(new Transform(events));
    }
};

export { ScenePanel };
