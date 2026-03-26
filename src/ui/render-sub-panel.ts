import { Button, Container, Element, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { AnnotationsPanel } from './annotations-panel';
import { localize } from './localization';
import { SplatList } from './splat-list';
import sceneImportSvg from './svg/import.svg';
import sceneNewSvg from './svg/new.svg';
import { Tooltips } from './tooltips';
import { Transform } from './transform';
import { ViewsPanel } from './views-panel';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class RenderSubPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'render-sub-panel',
            class: 'panel',
            hidden: false
        };

        super(args);

        // stop pointer events bubbling (but allow drag handle events through for SortableJS)
        let isDraggingSort = false;

        this.dom.addEventListener('pointerdown', (event: Event) => {
            const target = event.target as HTMLElement;
            if (target?.closest('.views-item-drag, .annotations-item-drag')) {
                isDraggingSort = true;
                return;
            }
            event.stopPropagation();
        });

        this.dom.addEventListener('pointerup', (event: Event) => {
            if (isDraggingSort) {
                isDraggingSort = false;
                return;
            }
            event.stopPropagation();
        });

        this.dom.addEventListener('pointermove', (event: Event) => {
            if (isDraggingSort) {
                return;
            }
            event.stopPropagation();
        });

        ['wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => {
                event.stopPropagation();
            });
        });

        // tab bar
        const tabBar = new Container({
            class: 'render-sub-tabs'
        });

        const editTab = new Button({
            text: 'Edit',
            class: 'render-sub-tab'
        });

        const viewsTab = new Button({
            text: 'Views',
            class: 'render-sub-tab'
        });

        const annotationTab = new Button({
            text: 'Annotation',
            class: 'render-sub-tab'
        });

        editTab.dom.classList.add('active');

        tabBar.append(editTab);
        tabBar.append(viewsTab);
        tabBar.append(annotationTab);

        // tab content - Scene Manager UI for Edit tab
        const editContent = new Container({
            id: 'render-sub-edit-content',
            class: 'render-sub-content',
            hidden: false
        });

        const sceneHeader = new Container({
            class: 'panel-header'
        });

        const sceneIcon = new Label({
            text: '\uE344',
            class: 'panel-header-icon'
        });

        const sceneLabel = new Label({
            text: localize('panel.scene-manager'),
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
            text: localize('panel.scene-manager.transform'),
            class: 'panel-header-label'
        });

        transformHeader.append(transformIcon);
        transformHeader.append(transformLabel);

        editContent.append(sceneHeader);
        editContent.append(splatListContainer);
        editContent.append(transformHeader);
        editContent.append(new Transform(events));
        editContent.append(new Element({
            class: 'panel-header',
            height: 20
        }));

        const viewsContent = new ViewsPanel(events, {
            class: 'render-sub-content',
            hidden: true
        });

        const annotationContent = new AnnotationsPanel(events, {
            class: 'render-sub-content',
            hidden: true
        });

        this.append(tabBar);
        this.append(editContent);
        this.append(viewsContent);
        this.append(annotationContent);

        const tabs = [editTab, viewsTab, annotationTab];
        const contents = [editContent, viewsContent, annotationContent];

        const activateTab = (index: number) => {
            tabs.forEach((tab, i) => {
                if (i === index) {
                    tab.dom.classList.add('active');
                } else {
                    tab.dom.classList.remove('active');
                }
            });
            contents.forEach((content, i) => {
                content.hidden = i !== index;
            });
        };

        editTab.on('click', () => activateTab(0));
        viewsTab.on('click', () => activateTab(1));
        annotationTab.on('click', () => activateTab(2));

        // Panel is always visible — register query functions for compatibility
        events.function('viewPanel.visible', () => true);
        events.function('renderSubPanel.visible', () => true);
    }
}

export { RenderSubPanel };
