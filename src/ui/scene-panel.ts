import { Button, Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { i18n } from './localization';
import { SplatList } from './splat-list';
import copyTransformSvg from './svg/copy-transform.svg';
import sceneImportSvg from './svg/import.svg';
import sceneNewSvg from './svg/new.svg';
import pasteTransformSvg from './svg/paste-transform.svg';
import soloSvg from './svg/solo.svg';
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
            class: 'panel-header-label'
        });
        i18n.bindText(sceneLabel, 'panel.scene');

        let soloActive = false;

        const soloToggle = new Container({
            class: 'panel-header-button'
        });
        soloToggle.dom.appendChild(createSvg(soloSvg));

        soloToggle.on('click', () => {
            soloActive = !soloActive;
            if (soloActive) {
                soloToggle.class.add('active');
            } else {
                soloToggle.class.remove('active');
            }
            events.fire('scene.solo', soloActive);
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
        sceneHeader.append(soloToggle);
        sceneHeader.append(sceneImport);
        sceneHeader.append(sceneNew);

        sceneImport.on('click', async () => {
            await events.invoke('scene.import');
        });

        sceneNew.on('click', () => {
            events.invoke('doc.new');
        });

        tooltips.register(soloToggle, () => i18n.t('tooltip.scene.solo'), 'top');
        tooltips.register(sceneImport, () => i18n.t('tooltip.scene.import'), 'top');
        tooltips.register(sceneNew, () => i18n.t('tooltip.scene.new'), 'top');

        const splatList = new SplatList(events);

        const splatListContainer = new Container({
            class: 'splat-list-container'
        });
        splatListContainer.append(splatList);

        const transform = new Transform(events);

        const transformHeader = new Container({
            class: 'panel-header'
        });

        const transformIcon = new Label({
            text: '\uE111',
            class: 'panel-header-icon'
        });

        const transformLabel = new Label({
            class: 'panel-header-label'
        });
        i18n.bindText(transformLabel, 'panel.scene.transform');

        const copyTransform = new Button({
            class: 'panel-header-button',
            enabled: false
        });
        copyTransform.dom.appendChild(createSvg(copyTransformSvg));

        const pasteTransform = new Button({
            class: 'panel-header-button',
            enabled: false
        });
        pasteTransform.dom.appendChild(createSvg(pasteTransformSvg));

        let hasSelection = false;
        const updateTransformActions = () => {
            copyTransform.enabled = hasSelection;
            pasteTransform.enabled = hasSelection && transform.hasCopiedTransform;
        };

        events.on('selection.changed', (selection) => {
            hasSelection = !!selection;
            updateTransformActions();
        });

        copyTransform.on('click', () => {
            if (transform.copyTransform()) {
                updateTransformActions();
            }
        });

        pasteTransform.on('click', () => {
            transform.pasteTransform();
        });

        i18n.onChange(() => copyTransform.dom.setAttribute(
            'aria-label',
            i18n.t('tooltip.scene.copy-transform')
        ), copyTransform);
        i18n.onChange(() => pasteTransform.dom.setAttribute(
            'aria-label',
            i18n.t('tooltip.scene.paste-transform')
        ), pasteTransform);
        tooltips.register(copyTransform, () => i18n.t('tooltip.scene.copy-transform'), 'top');
        tooltips.register(pasteTransform, () => i18n.t('tooltip.scene.paste-transform'), 'top');

        transformHeader.append(transformIcon);
        transformHeader.append(transformLabel);
        transformHeader.append(copyTransform);
        transformHeader.append(pasteTransform);

        this.append(sceneHeader);
        this.append(splatListContainer);
        this.append(transformHeader);
        this.append(transform);
        this.append(new Element({
            class: 'panel-header',
            height: 20
        }));
    }
}

export { ScenePanel };
