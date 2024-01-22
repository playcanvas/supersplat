import { EventHandler } from 'playcanvas';
import { BooleanInput, Button, Container, Label, NumericInput, Panel, RadioButton, SelectInput, SliderInput, VectorInput } from 'pcui';
import { version as supersplatVersion } from '../../package.json';

class BoxSelection {
    root: HTMLElement;
    svg: SVGElement;
    rect: SVGRectElement;
    dragging = false;
    start = { x: 0, y: 0 };
    end = { x: 0, y: 0 };

    events = new EventHandler();

    constructor(parent: HTMLElement) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = 'select-svg';

        // create rect element
        const rect = document.createElementNS(svg.namespaceURI, 'rect') as SVGRectElement;
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#f60');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('stroke-dasharray', '5, 5');

        // create input dom
        const root = document.createElement('div');
        root.id = 'select-root';

        const updateRect = () => {
            if (this.dragging) {
                const x = Math.min(this.start.x, this.end.x);
                const y = Math.min(this.start.y, this.end.y);
                const width = Math.abs(this.start.x - this.end.x);
                const height = Math.abs(this.start.y - this.end.y);

                rect.setAttribute('x', x.toString());
                rect.setAttribute('y', y.toString());
                rect.setAttribute('width', width.toString());
                rect.setAttribute('height', height.toString());
            }

            this.svg.style.display = this.dragging ? 'inline' : 'none';
        };

        root.oncontextmenu = (e) => {
            e.preventDefault();
        };

        root.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.button === 0) {
                this.dragging = true;
                this.start.x = this.end.x = e.offsetX;
                this.start.y = this.end.y = e.offsetY;
                updateRect();
            }
        };

        root.onmousemove = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.button === 0 && this.dragging) {
                this.end.x = e.offsetX;
                this.end.y = e.offsetY;
                updateRect();
            }
        };

        root.onmouseup = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.button === 0) {
                const w = root.clientWidth;
                const h = root.clientHeight;

                this.dragging = false;
                updateRect();

                this.events.fire('selectRect', e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'), {
                    start: { x: Math.min(this.start.x, this.end.x) / w, y: Math.min(this.start.y, this.end.y) / h },
                    end: { x: Math.max(this.start.x, this.end.x) / w, y: Math.max(this.start.y, this.end.y) / h },
                });
            }
        };

        parent.appendChild(root);
        root.appendChild(svg);
        svg.appendChild(rect);

        this.root = root;
        this.svg = svg;
        this.rect = rect;
    }

    activate() {
        if (!this.active) {
            this.root.style.display = 'block';
            this.events.fire('activated');
        }
    }

    deactivate() {
        if (this.active) {
            this.events.fire('deactivated');
            this.root.style.display = 'none';
        }
    }

    get active() {
        return this.root.style.display === 'block';
    }
}

class BrushSelection {
    root: HTMLElement;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    svg: SVGElement;
    circle: SVGCircleElement;
    dragging = false;
    radius = 40;
    prev = { x: 0, y: 0 };

    events = new EventHandler();

    constructor(parent: HTMLElement) {
        // create input dom
        const root = document.createElement('div');
        root.id = 'select-root';

        // create svg
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = 'select-svg';
        svg.style.display = 'inline';

        // create circle element
        const circle = document.createElementNS(svg.namespaceURI, 'circle') as SVGCircleElement;
        circle.setAttribute('r', this.radius.toString());
        circle.setAttribute('fill', 'rgba(255, 102, 0, 0.2)');
        circle.setAttribute('stroke', '#f60');
        circle.setAttribute('stroke-width', '1');
        circle.setAttribute('stroke-dasharray', '5, 5');

        // create canvas
        const canvas = document.createElement('canvas');
        canvas.id = 'select-canvas';

        const context = canvas.getContext('2d');
        context.globalCompositeOperation = 'copy';

        const update = (e: MouseEvent) => {
            const x = e.offsetX;
            const y = e.offsetY;

            circle.setAttribute('cx', x.toString());
            circle.setAttribute('cy', y.toString());

            if (this.dragging) {
                context.beginPath();
                context.strokeStyle = '#f60';
                context.lineCap = 'round';
                context.lineWidth = this.radius * 2;
                context.moveTo(this.prev.x, this.prev.y);
                context.lineTo(x, y);
                context.stroke();

                this.prev.x = x;
                this.prev.y = y;
            }
        };

        root.oncontextmenu = (e) => {
            e.preventDefault();
        };

        root.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            this.prev.x = e.offsetX;
            this.prev.y = e.offsetY;

            update(e);

            if (e.button === 0) {
                this.dragging = true;

                if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
                    canvas.width = parent.clientWidth;
                    canvas.height = parent.clientHeight;
                }

                // clear canvas
                context.clearRect(0, 0, canvas.width, canvas.height);

                // display it
                canvas.style.display = 'inline';
            }
        };

        root.onmousemove = (e) => {
            e.preventDefault();
            e.stopPropagation();
            update(e);
        };

        root.onmouseup = (e) => {
            e.preventDefault();
            e.stopPropagation();
            update(e);

            if (e.button === 0) {
                this.dragging = false;
                canvas.style.display = 'none';

                this.events.fire(
                    'selectByMask',
                    e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                    context.getImageData(0, 0, canvas.width, canvas.height)
                );
            }
        };

        parent.appendChild(root);
        root.appendChild(svg);
        svg.appendChild(circle);
        root.appendChild(canvas);

        this.root = root;
        this.svg = svg;
        this.circle = circle;
        this.canvas = canvas;
        this.context = context;

        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
    }

    activate() {
        if (!this.active) {
            this.root.style.display = 'block';
            this.events.fire('activated');
        }
    }

    deactivate() {
        if (this.active) {
            this.events.fire('deactivated');
            this.root.style.display = 'none';
        }
    }

    get active() {
        return this.root.style.display === 'block';
    }

    smaller() {
        this.radius = Math.max(1, this.radius / 1.05);
        this.circle.setAttribute('r', this.radius.toString());
    }

    bigger() {
        this.radius = Math.min(500, this.radius * 1.05);
        this.circle.setAttribute('r', this.radius.toString());
    }
}

class ControlPanel extends Panel {
    events = new EventHandler;

    constructor(canvasContainer: HTMLElement, remoteStorageMode: boolean, args = { }) {
        Object.assign(args, {
            headerText: `SUPER SPLAT v${supersplatVersion}`,
            id: 'control-panel',
            resizable: 'right',
            resizeMax: 1000,
            collapsible: true,
            collapseHorizontally: true,
            scrollable: true
        });

        super(args);

        // camera panel
        const cameraPanel = new Panel({
            id: 'camera-panel',
            class: 'control-panel',
            headerText: 'CAMERA'
        });

        const focusButton = new Button({
            class: 'control-element',
            text: 'Reset Focus'
        });

        // splat size
        const splatSize = new Container({
            class: 'control-parent'
        });

        const splatSizeLabel = new Label({
            class: 'control-label',
            text: 'Splat Size'
        });

        const splatSizeSlider = new SliderInput({
            class: 'control-element-expand',
            precision: 1,
            min: 0,
            max: 10,
            value: 2
        });

        splatSize.append(splatSizeLabel);
        splatSize.append(splatSizeSlider);

        cameraPanel.append(focusButton);
        cameraPanel.append(splatSize);

        // selection panel
        const selectionPanel = new Panel({
            id: 'selection-panel',
            class: 'control-panel',
            headerText: 'SELECTION'
        });

        // select by size
        const selectBySize = new Container({
            class: 'control-parent'
        });

        const selectBySizeRadio = new RadioButton({
            class: 'control-element'
        });

        const selectBySizeLabel = new Label({
            class: 'control-label',
            text: 'Splat Size'
        });

        const selectBySizeSlider = new SliderInput({
            class: 'control-element-expand',
            precision: 4,
            enabled: false
        });

        selectBySize.append(selectBySizeRadio);
        selectBySize.append(selectBySizeLabel);
        selectBySize.append(selectBySizeSlider);

        // select by opacity
        const selectByOpacity = new Container({
            class: 'control-parent'
        });

        const selectByOpacityRadio = new RadioButton({
            class: 'control-element'
        });

        const selectByOpacityLabel = new Label({
            class: 'control-label',
            text: 'Splat Opacity'
        });

        const selectByOpacitySlider = new SliderInput({
            class: 'control-element-expand',
            precision: 4,
            enabled: false
        });

        selectByOpacity.append(selectByOpacityRadio);
        selectByOpacity.append(selectByOpacityLabel);
        selectByOpacity.append(selectByOpacitySlider);

        // select by sphere
        const selectBySphere = new Container({
            class: 'control-parent'
        });

        const selectBySphereRadio = new RadioButton({
            class: 'control-element'
        });

        const selectBySphereLabel = new Label({
            class: 'control-label',
            text: 'Sphere'
        });

        const selectBySphereCenter = new VectorInput({
            class: 'control-element-expand',
            precision: 4,
            dimensions: 4,
            value: [0, 0, 0, 0.5],
            // @ts-ignore
            placeholder: ['X', 'Y', 'Z', 'R'],
            enabled: false
        });

        selectBySphere.append(selectBySphereRadio);
        selectBySphere.append(selectBySphereLabel);
        selectBySphere.append(selectBySphereCenter);

        // select by plane
        const selectByPlane = new Container({
            class: 'control-parent'
        });

        const selectByPlaneRadio = new RadioButton({
            class: 'control-element'
        });

        const selectByPlaneLabel = new Label({
            class: 'control-label',
            text: 'Plane'
        });

        const selectByPlaneAxis = new SelectInput({
            class: 'control-element',
            defaultValue: 'y',
            options: [
                { v: 'x', t: 'x' },
                { v: 'y', t: 'y' },
                { v: 'z', t: 'z' }
            ],
            enabled: false
        });

        const selectByPlaneOffset = new NumericInput({
            class: 'control-element-expand',
            precision: 2,
            enabled: false
        });

        selectByPlane.append(selectByPlaneRadio);
        selectByPlane.append(selectByPlaneLabel);
        selectByPlane.append(selectByPlaneAxis);
        selectByPlane.append(selectByPlaneOffset);

        // set/add/remove
        const setAddRemove = new Container({
            class: 'control-parent'
        });

        const setButton = new Button({
            class: 'control-element-expand',
            text: 'Set',
            enabled: false
        });

        const addButton = new Button({
            class: 'control-element-expand',
            text: 'Add',
            enabled: false
        });

        const removeButton = new Button({
            class: 'control-element-expand',
            text: 'Remove',
            enabled: false
        });

        setAddRemove.append(setButton);
        setAddRemove.append(addButton);
        setAddRemove.append(removeButton);

        // selection parent
        const selectTools = new Container({
            class: 'control-parent'
        });

        const boxSelectButton = new Button({
            class: 'control-element-expand',
            text: 'Rect',
            enabled: true
        });

        const brushSelectButton = new Button({
            class: 'control-element-expand',
            text: 'Brush',
            enabled: true
        });

        selectTools.append(boxSelectButton);
        selectTools.append(brushSelectButton);

        // selection button parent
        const selectGlobal = new Container({
            class: 'control-parent'
        });

        // all
        const selectAllButton = new Button({
            class: 'control-element-expand',
            text: 'All'
        });

        // none
        const selectNoneButton = new Button({
            class: 'control-element-expand',
            text: 'None'
        });

        // invert
        const invertSelectionButton = new Button({
            class: 'control-element-expand',
            text: 'Invert'
        });

        selectGlobal.append(selectAllButton);
        selectGlobal.append(selectNoneButton);
        selectGlobal.append(invertSelectionButton);

        selectionPanel.append(selectBySize);
        selectionPanel.append(selectByOpacity);
        selectionPanel.append(selectBySphere);
        selectionPanel.append(selectByPlane);
        selectionPanel.append(setAddRemove);
        selectionPanel.append(selectTools);
        selectionPanel.append(selectGlobal);

        // modify
        const modifyPanel = new Panel({
            id: 'modify-panel',
            class: 'control-panel',
            headerText: 'MODIFY'
        });

        const deleteSelectionButton = new Button({
            class: 'control-element',
            text: 'Delete Selected Splats'
        });

        const resetButton = new Button({
            class: 'control-element',
            text: 'Reset Scene'
        });

        modifyPanel.append(deleteSelectionButton);
        modifyPanel.append(resetButton);

        // scene
        const scenePanel = new Panel({
            id: 'scene-panel',
            class: 'control-panel',
            headerText: 'SCENE'
        });

        const origin = new Container({
            class: 'control-parent'
        });

        const originLabel = new Label({
            class: 'control-label',
            text: 'Show Origin'
        });

        const originToggle = new BooleanInput({
            class: 'control-element',
            value: false
        });

        origin.append(originLabel);
        origin.append(originToggle);

        // position
        const position = new Container({
            class: 'control-parent'
        });

        const positionLabel = new Label({
            class: 'control-label',
            text: 'Position'
        });

        const positionVector = new VectorInput({
            class: 'control-element-expand',
            precision: 2,
            dimensions: 3,
            value: [0, 0, 0],
            // @ts-ignore
            placeholder: ['X', 'Y', 'Z']
        });

        position.append(positionLabel);
        position.append(positionVector);

        // rotation
        const rotation = new Container({
            class: 'control-parent'
        });

        const rotationLabel = new Label({
            class: 'control-label',
            text: 'Rotation'
        });

        const rotationVector = new VectorInput({
            class: 'control-element-expand',
            precision: 2,
            dimensions: 3,
            value: [0, 0, 0],
            // @ts-ignore
            placeholder: ['X', 'Y', 'Z']
        });

        rotation.append(rotationLabel);
        rotation.append(rotationVector);

        // scale
        const scale = new Container({
            class: 'control-parent'
        });

        const scaleLabel = new Label({
            class: 'control-label',
            text: 'Scale'
        });

        const scaleInput = new NumericInput({
            class: 'control-element-expand',
            precision: 2,
            value: 1,
            min: 0.01,
            max: 10000
        });

        scale.append(scaleLabel);
        scale.append(scaleInput);

        scenePanel.append(origin);
        scenePanel.append(position);
        scenePanel.append(rotation);
        scenePanel.append(scale);

        // export
        const exportPanel = new Panel({
            id: 'export-panel',
            class: 'control-panel',
            headerText: 'EXPORT TO'
        });

        const storageIcon = remoteStorageMode ? 'E222' : 'E245';

        const exportPlyButton = new Button({
            class: 'control-element',
            text: 'Ply file',
            icon: storageIcon
        });

        const exportCompressedPlyButton = new Button({
            class: 'control-element',
            text: 'Compressed Ply file',
            icon: storageIcon
        });

        const exportSplatButton = new Button({
            class: 'control-element',
            text: 'Splat file',
            icon: storageIcon
        });

        exportPanel.append(exportPlyButton);
        exportPanel.append(exportCompressedPlyButton);
        exportPanel.append(exportSplatButton);

        // options
        const optionsPanel = new Panel({
            id: 'options-panel',
            class: 'control-panel',
            headerText: 'OPTIONS'
        });

        const allData = new Container({
            class: 'control-parent'
        });

        const allDataLabel = new Label({
            class: 'control-label',
            text: 'Load all PLY data'
        });

        const allDataToggle = new BooleanInput({
            class: 'control-element',
            value: true
        });

        allData.append(allDataLabel);
        allData.append(allDataToggle);

        optionsPanel.append(allData);

        // append
        this.content.append(cameraPanel);
        this.content.append(selectionPanel);
        this.content.append(modifyPanel);
        this.content.append(scenePanel);
        this.content.append(exportPanel);
        this.content.append(optionsPanel);

        const boxSelection = new BoxSelection(canvasContainer);
        boxSelection.events.on('activated', () => boxSelectButton.class.add('active'));
        boxSelection.events.on('deactivated', () => boxSelectButton.class.remove('active'));
        boxSelection.events.on('selectRect', (op: string, rect: any) => {
            this.events.fire('selectRect', op, rect);
        });

        const brushSelection = new BrushSelection(canvasContainer);
        brushSelection.events.on('activated', () => brushSelectButton.class.add('active'));
        brushSelection.events.on('deactivated', () => brushSelectButton.class.remove('active'));
        brushSelection.events.on('selectByMask', (op: string, mask: ImageData) => {
            this.events.fire('selectByMask', op, mask);
        });

        const tools = [
            boxSelection,
            brushSelection
        ];

        const deactivate = () => {
            tools.forEach(tool => tool.deactivate());
        };

        const toggle = (tool: any) => {
            if (tool.active) {
                tool.deactivate();
            } else {
                deactivate();
                tool.activate();
            }
        };

        boxSelectButton.on('click', () => toggle(boxSelection));
        brushSelectButton.on('click', () => toggle(brushSelection));

        // radio logic
        const radioGroup = [selectBySizeRadio, selectByOpacityRadio, selectBySphereRadio, selectByPlaneRadio];
        radioGroup.forEach((radio, index) => {
            radio.on('change', () => {
                if (radio.value) {
                    radioGroup.forEach((other) => {
                        if (other !== radio) {
                            other.value = false;
                        }
                    });

                    // update select by
                    this.events.fire('selectBy', index);
                } else {
                    // update select by
                    this.events.fire('selectBy', null);
                }
            });
        });

        const axes: any = {
            x: [1, 0, 0],
            y: [0, 1, 0],
            z: [0, 0, 1]
        };

        let radioSelection: number | null = null;
        this.events.on('selectBy', (index: number | null) => {
            radioSelection = index;

            setButton.enabled = index !== null;
            addButton.enabled = index !== null;
            removeButton.enabled = index !== null;

            const controlSet = [
                [selectBySizeSlider],
                [selectByOpacitySlider],
                [selectBySphereCenter],
                [selectByPlaneAxis, selectByPlaneOffset]
            ];

            controlSet.forEach((controls, controlsIndex) => {
                controls.forEach((control) => {
                    control.enabled = index === controlsIndex;
                });
            });

            this.events.fire('selectBySpherePlacement', index === 2 ? selectBySphereCenter.value : [0, 0, 0, 0]);
            this.events.fire('selectByPlanePlacement', index === 3 ? axes[selectByPlaneAxis.value] : [0, 0, 0], selectByPlaneOffset.value);
        });

        const performSelect = (op: string) => {
            switch (radioSelection) {
                case 0: this.events.fire('selectBySize', op, selectBySizeSlider.value); break;
                case 1: this.events.fire('selectByOpacity', op, selectByOpacitySlider.value); break;
                case 2: this.events.fire('selectBySphere', op, selectBySphereCenter.value); break;
                case 3: this.events.fire('selectByPlane', op, axes[selectByPlaneAxis.value], selectByPlaneOffset.value); break;
            }
        }

        setButton.on('click', () => performSelect('set'));
        addButton.on('click', () => performSelect('add'));
        removeButton.on('click', () => performSelect('remove'));

        focusButton.on('click', () => {
            this.events.fire('focusCamera');
        });

        splatSizeSlider.on('change', (value: number) => {
            this.events.fire('splatSize', value);
        });

        selectAllButton.on('click', () => {
            this.events.fire('selectAll');
        });

        selectNoneButton.on('click', () => {
            this.events.fire('selectNone');
        });

        invertSelectionButton.on('click', () => {
            this.events.fire('invertSelection');
        });

        selectBySphereCenter.on('change', () => {
            this.events.fire('selectBySpherePlacement', selectBySphereCenter.value);
        });

        selectByPlaneAxis.on('change', () => {
            this.events.fire('selectByPlanePlacement', axes[selectByPlaneAxis.value], selectByPlaneOffset.value);
        });

        selectByPlaneOffset.on('change', () => {
            this.events.fire('selectByPlanePlacement', axes[selectByPlaneAxis.value], selectByPlaneOffset.value);
        });

        originToggle.on('change', (enabled: boolean) => {
            this.events.fire('showOrigin', enabled);
        });

        positionVector.on('change', () => {
            this.events.fire('scenePosition', positionVector.value);
        });

        rotationVector.on('change', () => {
            this.events.fire('sceneRotation', rotationVector.value);
        });

        scaleInput.on('change', () => {
            this.events.fire('sceneScale', scaleInput.value);
        });

        deleteSelectionButton.on('click', () => {
            this.events.fire('deleteSelection');
        });

        resetButton.on('click', () => {
            this.events.fire('reset');
        });

        allDataToggle.on('change', (enabled: boolean) => {
            this.events.fire('allData', enabled);
        });

        exportPlyButton.on('click', () => {
            this.events.fire('export', 'ply');
        });

        exportCompressedPlyButton.on('click', () => {
            this.events.fire('export', 'ply-compressed');
        });

        exportSplatButton.on('click', () => {
            this.events.fire('export', 'splat');
        });

        this.events.on('splat:count', (count: number) => {
            selectionPanel.headerText = `SELECTION${count === 0 ? '' : ' (' + count.toString() + ')'}`;
        });

        let splatSizeSave = 1;

        // keyboard handler
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                // handle meta/ctrl keys
                if (!e.shiftKey && e.key === 'z') {
                    this.events.fire('undo');
                } else if (e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                    this.events.fire('redo');
                }
            } else {
                // handle non-meta/ctrl keys
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    this.events.fire('deleteSelection');
                } else if (e.key === 'Escape') {
                    deactivate();
                } else if (e.key === 'R' || e.key === 'r') {
                    toggle(boxSelection);
                } else if (e.key === 'F' || e.key === 'f') {
                    this.events.fire('focusCamera');
                } else if (e.key === 'B' || e.key === 'b') {
                    toggle(brushSelection);
                } else if (e.key === 'I' || e.key === 'i') {
                    this.events.fire('invertSelection');
                } else if (e.key === '[') {
                    brushSelection.smaller();
                } else if (e.key === ']') {
                    brushSelection.bigger();
                } else if (e.code === 'Space') {
                    if (splatSizeSlider.value !== 0) {
                        splatSizeSave = splatSizeSlider.value;
                        splatSizeSlider.value = 0;
                    } else {
                        splatSizeSlider.value = splatSizeSave;
                    }
                }
            }
        });
    }
}

export { ControlPanel };
