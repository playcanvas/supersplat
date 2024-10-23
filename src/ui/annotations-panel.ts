import { Container, Element, Label } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';
import { AnnotationList } from './annotation-list';
import { Transform } from './transform';
import { localize } from './localization';

import sceneImportSvg from '../svg/import.svg';
import sceneNewSvg from '../svg/new.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class AnnotationsPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'annotations-panel',
            class: 'panel'
        };

        super(args);

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });

        const annotationsHeader = new Container({
            class: `panel-header`
        });

        const annotationsIcon = new Label({
            text: '\uE344',
            class: `panel-header-icon`
        });

        const annotationsLabel = new Label({
            text: localize('annotations-manager'),
            class: `panel-header-label`
        });

        const annotationsImport = new Container({
            class: `panel-header-button`
        });
        annotationsImport.dom.appendChild(createSvg(sceneImportSvg));

        const annotationsNew = new Container({
            class: `panel-header-button`
        });
        annotationsNew.dom.appendChild(createSvg(sceneNewSvg));

        annotationsHeader.append(annotationsIcon);
        annotationsHeader.append(annotationsLabel);
        annotationsHeader.append(annotationsImport);
        annotationsHeader.append(annotationsNew);

        annotationsImport.on('click', () => {
            events.fire('annotations.open');
        });

        annotationsNew.on('click', () => {
            events.invoke('annotations.new');
        });

        tooltips.register(annotationsImport, 'Import Annotations', 'top');
        tooltips.register(annotationsNew, 'New Annotations', 'top');

        const annotationList = new AnnotationList(events);

        const annotationListContainer = new Container({
            class: 'annotation-list-container'
        });
        annotationListContainer.append(annotationList);

       /* const transformHeader = new Container({
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
        */
        this.append(annotationsHeader);
        this.append(annotationListContainer);
        //this.append(transformHeader);
       // this.append(new Transform(events));
        this.append(new Element({
            class: `panel-header`,
            height: 20
        }));
    }
}

export { AnnotationsPanel };
