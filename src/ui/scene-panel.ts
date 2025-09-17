import { Container, Element, Label, NumericInput } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';
import { localize } from './localization';
import { SplatList } from './splat-list';
import sceneImportSvg from './svg/import.svg';
import sceneNewSvg from './svg/new.svg';
import { Tooltips } from './tooltips';
import { Transform } from './transform';

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
            class: 'panel-header'
        });

        const sceneIcon = new Label({
            text: '\uE344',
            class: 'panel-header-icon'
        });

        const sceneLabel = new Label({
            text: localize('scene-manager'),
            class: 'panel-header-label'
        });

        const sceneImport = new Container({
            class: 'panel-header-button'
        });
        sceneImport.dom.appendChild(createSvg(sceneImportSvg));

        const sceneNew = new Container({
            class: 'panel-header-button'
        });
        sceneNew.dom.appendChild(createSvg(sceneNewSvg));

        sceneHeader.append(sceneIcon);
        sceneHeader.append(sceneLabel);
        sceneHeader.append(sceneImport);
        sceneHeader.append(sceneNew);

        sceneImport.on('click', async () => {
            await events.invoke('scene.import');
        });

        sceneNew.on('click', () => {
            events.invoke('doc.new');
        });

        tooltips.register(sceneImport, 'Import Scene', 'top');
        tooltips.register(sceneNew, 'New Scene', 'top');

        const splatList = new SplatList(events);

        const splatListContainer = new Container({
            class: 'splat-list-container'
        });
        splatListContainer.append(splatList);

        const transformHeader = new Container({
            class: 'panel-header'
        });

        const transformIcon = new Label({
            text: '\uE111',
            class: 'panel-header-icon'
        });

        const transformLabel = new Label({
            text: localize('transform'),
            class: 'panel-header-label'
        });

        transformHeader.append(transformIcon);
        transformHeader.append(transformLabel);

        this.append(sceneHeader);
        this.append(splatListContainer);
        this.append(transformHeader);
        this.append(new Transform(events));

        const measureContainer = new Container({
            id: 'distance-measure-container',
            class: 'measure-panel',
            hidden: true
        });

        const measureLabel = new Label({
            text: localize('measure.distance'),
            class: 'measure-label'
        });

        const distanceInput = new NumericInput({
            class: 'distance-input',
            placeholder: '0.00',
            precision: 2,
            step: 0.01,
            min: 0.01
        });

        measureContainer.append(measureLabel);
        measureContainer.append(distanceInput);

        this.append(measureContainer);

        events.on('measure.activate', () => {
            measureContainer.hidden = false;
        });

        events.on('measure.deactivate', () => {
            measureContainer.hidden = true;
        });

        let originalDistance = 0;
        let isUpdatingFromScale = false;

        events.on('measure.distanceSet', (distance: number) => {
            originalDistance = distance;
            isUpdatingFromScale = true;
            distanceInput.value = distance;
            isUpdatingFromScale = false;
        });

        events.on('pivot.moved', (pivot: any) => {
            if (originalDistance > 0 && !measureContainer.hidden && !isUpdatingFromScale) {
                const currentScale = pivot.transform.scale.x;
                const newDistance = originalDistance * currentScale;
                isUpdatingFromScale = true;
                distanceInput.value = newDistance;
                isUpdatingFromScale = false;
                events.fire('measure.scaleChanged', currentScale);
            }
        });

        distanceInput.on('change', (newDistance: number) => {
            if (!isUpdatingFromScale && originalDistance > 0 && newDistance > 0 && !measureContainer.hidden) {

                const targetScale = newDistance / originalDistance;

                const pivot = events.invoke('pivot');
                if (pivot) {

                    pivot.start();

                    const currentTransform = pivot.transform;
                    const newPosition = currentTransform.position.clone();
                    const newRotation = currentTransform.rotation.clone();
                    const newScale = new Vec3(targetScale, targetScale, targetScale);

                    pivot.moveTRS(newPosition, newRotation, newScale);

                    pivot.end();

                    events.fire('measure.scaleChanged', targetScale);
                }
            }
        });

        this.append(new Element({
            class: 'panel-header',
            height: 20
        }));
    }
}

export { ScenePanel };
