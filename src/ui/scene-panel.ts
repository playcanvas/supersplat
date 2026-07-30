import { Button, Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { i18n } from './localization';
import { MenuPanel } from './menu-panel';
import { SplatList } from './splat-list';
import arrowSvg from './svg/arrow.svg';
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

        const copyTransformOptions = new Button({
            class: ['panel-header-button', 'transform-copy-options'],
            enabled: false
        });
        copyTransformOptions.dom.appendChild(createSvg(copyTransformSvg));
        copyTransformOptions.dom.appendChild(createSvg(arrowSvg));

        const pasteTransform = new Button({
            class: 'panel-header-button',
            enabled: false
        });
        pasteTransform.dom.appendChild(createSvg(pasteTransformSvg));

        let hasSelection = false;
        const updateTransformActions = () => {
            copyTransformOptions.enabled = hasSelection;
            pasteTransform.enabled = hasSelection && transform.hasCopiedTransform;
        };

        const copyTransformMenu = new MenuPanel([{
            text: () => i18n.t('menu.transform.copy-position'),
            onSelect: () => {
                transform.copyTransform({ position: true });
                updateTransformActions();
            }
        }, {
            text: () => i18n.t('menu.transform.copy-rotation'),
            onSelect: () => {
                transform.copyTransform({ rotation: true });
                updateTransformActions();
            }
        }, {
            text: () => i18n.t('menu.transform.copy-position-rotation'),
            onSelect: () => {
                transform.copyTransform({ position: true, rotation: true });
                updateTransformActions();
            }
        }, {
            text: () => i18n.t('menu.transform.copy-all'),
            onSelect: () => {
                transform.copyTransform({ position: true, rotation: true, scale: true });
                updateTransformActions();
            }
        }]);
        copyTransformMenu.class.add('transform-copy-menu');
        document.body.appendChild(copyTransformMenu.dom);

        events.on('selection.changed', (selection) => {
            hasSelection = !!selection;
            updateTransformActions();
        });

        copyTransformOptions.on('click', () => {
            copyTransformMenu.position(copyTransformOptions.dom, 'bottom', 2);
            copyTransformMenu.hidden = !copyTransformMenu.hidden;
        });

        pasteTransform.on('click', () => {
            transform.pasteTransform();
        });

        i18n.onChange(() => copyTransformOptions.dom.setAttribute(
            'aria-label',
            i18n.t('tooltip.scene.copy-transform-options')
        ), copyTransformOptions);
        i18n.onChange(() => pasteTransform.dom.setAttribute(
            'aria-label',
            i18n.t('tooltip.scene.paste-transform')
        ), pasteTransform);
        tooltips.register(copyTransformOptions, () => i18n.t('tooltip.scene.copy-transform-options'), 'top');
        tooltips.register(pasteTransform, () => i18n.t('tooltip.scene.paste-transform'), 'top');

        transformHeader.append(transformIcon);
        transformHeader.append(transformLabel);
        transformHeader.append(copyTransformOptions);
        transformHeader.append(pasteTransform);

        const closeCopyTransformMenu = (event: PointerEvent) => {
            if (!copyTransformMenu.dom.contains(event.target as Node) &&
                !copyTransformOptions.dom.contains(event.target as Node)) {
                copyTransformMenu.hidden = true;
            }
        };
        window.addEventListener('pointerdown', closeCopyTransformMenu, true);
        window.addEventListener('pointerup', closeCopyTransformMenu, true);

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
