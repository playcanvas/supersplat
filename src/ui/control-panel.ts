import { BooleanInput, Button, Container, Label, NumericInput, Panel, RadioButton, SelectInput, SliderInput, VectorInput } from 'pcui';
import { Events } from '../events';
import { SplatItem, SplatList } from './splat-list';
import { TransformPanel } from './transform-panel';
import { Element, ElementType } from '../element';
import { Splat } from '../splat';
import { version as appVersion } from '../../package.json';

class ControlPanel extends Panel {
    constructor(events: Events, remoteStorageMode: boolean, args = { }) {
        args = {
            ...args,
            headerText: `SUPERSPLAT v${appVersion}`,
            id: 'control-panel',
            resizable: 'right',
            resizeMax: 1000,
            collapsible: true,
            collapseHorizontally: true,
            scrollable: true
        };

        super(args);

        // scene panel
        const scenePanel = new Panel({
            id: 'scene-panel',
            class: 'control-panel',
            headerText: 'SCENE'
        });

        const splatListContainer = new Container({
            id: 'scene-panel-splat-list-container',
            resizable: 'bottom',
            resizeMin: 50
        });

        const splatList = new SplatList({
            id: 'scene-panel-splat-list'
        });

        splatListContainer.append(splatList);
        scenePanel.content.append(splatListContainer);

        // handle selection and scene updates

        const items = new Map<Splat, SplatItem>();

        events.on('scene.elementAdded', (element: Element) => {
            if (element.type === ElementType.splat) {
                const splat = element as Splat;
                const item = new SplatItem(splat.filename);
                splatList.append(item);
                items.set(splat, item);

                item.on('visible', () => {
                    splat.visible = true;

                    // also select it if there is no other selection
                    if (!events.invoke('selection')) {
                        events.fire('selection', splat);
                    }
                });
                item.on('invisible', () => splat.visible = false);
            }
        });

        events.on('scene.elementRemoved', (element: Element) => {
            if (element.type === ElementType.splat) {
                const splat = element as Splat;
                const item = items.get(splat);
                if (item) {
                    splatList.remove(item);
                    items.delete(splat);
                }
            }
        });

        events.on('selection.changed', (selection: Splat) => {
            items.forEach((value, key) => {
                value.selected = key === selection;
            });
        });

        events.on('splat.vis', (splat: Splat) => {
            const item = items.get(splat);
            if (item) {
                item.visible = splat.visible;
            }
        });

        splatList.on('click', (item: SplatItem) => {
            for (const [key, value] of items) {
                if (item === value) {
                    events.fire('selection', key);
                    break;
                }
            }            
        });

        splatList.on('removeClicked', async (item: SplatItem) => {
            let splat;
            for (const [key, value] of items) {
                if (item === value) {
                    splat = key;
                    break;
                }
            }  

            if (!splat) {
                return;
            }

            const result = await events.invoke('showPopup', {
                type: 'yesno',
                message: `Would you like to remove '${splat.filename}' from the scene?`
            });

            if (result?.action === 'yes') {
                splat.destroy();
            }
        });

        const transformPanel = new TransformPanel(events);

        // camera panel
        const cameraPanel = new Panel({
            id: 'camera-panel',
            class: 'control-panel',
            headerText: 'CAMERA'
        });

        // mode
        const mode = new Container({
            class: 'control-parent'
        });

        const modeLabel = new Label({
            class: 'control-label',
            text: 'Mode'
        });

        const modeSelect = new SelectInput({
            class: 'control-element-expand',
            defaultValue: 'centers',
            options: [
                { v: 'centers', t: 'Centers' },
                { v: 'rings', t: 'Rings' }
            ]
        });

        mode.append(modeLabel);
        mode.append(modeSelect);

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

        // show grid
        const showGrid = new Container({
            class: 'control-parent'
        });

        const showGridLabel = new Label({
            class: 'control-label',
            text: 'Show Grid'
        });

        const showGridToggle = new BooleanInput({
            class: 'control-element',
            value: true
        });

        showGrid.append(showGridLabel);
        showGrid.append(showGridToggle);

        const focusButton = new Button({
            class: 'control-element',
            text: 'Frame Selection'
        });

        cameraPanel.append(mode);
        cameraPanel.append(splatSize);
        cameraPanel.append(showGrid);
        cameraPanel.append(focusButton);

        // selection panel
        const selectionPanel = new Panel({
            id: 'selection-panel',
            class: 'control-panel',
            headerText: 'SELECTION'
        });

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

        const rectSelectButton = new Button({
            class: 'control-element-expand',
            text: 'Rect',
            enabled: true
        });

        const brushSelectButton = new Button({
            class: 'control-element-expand',
            text: 'Brush',
            enabled: true
        });

        const pickerSelectButton = new Button({
            class: 'control-element-expand',
            text: 'Picker',
            enabled: true
        });

        selectTools.append(rectSelectButton);
        selectTools.append(brushSelectButton);
        selectTools.append(pickerSelectButton);

        selectionPanel.append(selectGlobal);
        selectionPanel.append(selectBySphere);
        selectionPanel.append(selectByPlane);
        selectionPanel.append(setAddRemove);
        selectionPanel.append(selectTools);

        // show panel
        const showPanel = new Panel({
            id: 'show-panel',
            class: 'control-panel',
            headerText: 'SHOW'
        });

        const showButtons = new Container({
            class: 'control-parent'
        });

        const hideSelection = new Button({
            class: 'control-element-expand',
            text: 'Hide Selection'
        });

        const unhideAll = new Button({
            class: 'control-element-expand',
            text: 'Unhide All'
        });

        showButtons.append(hideSelection);
        showButtons.append(unhideAll);

        showPanel.append(showButtons);

        // modify
        const modifyPanel = new Panel({
            id: 'modify-panel',
            class: 'control-panel',
            headerText: 'MODIFY'
        });

        const deleteSelectionButton = new Button({
            class: 'control-element-expand',
            text: 'Delete Selected Splats',
            icon: 'E124'
        });

        const resetButton = new Button({
            class: 'control-element-expand',
            text: 'Reset Splats'
        });

        const undoRedo = new Container({
            class: 'control-parent'
        });

        const undoButton = new Button({
            class: 'control-element-expand',
            text: 'Undo',
            icon: 'E339',
            enabled: false
        });

        const redoButton = new Button({
            class: 'control-element-expand',
            text: 'Redo',
            icon: 'E338',
            enabled: false
        });

        undoRedo.append(undoButton);
        undoRedo.append(redoButton);

        modifyPanel.append(deleteSelectionButton);
        modifyPanel.append(resetButton);
        modifyPanel.append(undoRedo);

        undoButton.on('click', () => { events.fire('edit.undo'); });
        redoButton.on('click', () => { events.fire('edit.redo'); });

        events.on('edit.canUndo', (value: boolean) => { undoButton.enabled = value; });
        events.on('edit.canRedo', (value: boolean) => { redoButton.enabled = value; });

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

        const controlsContainer = new Container({
            id: 'control-panel-controls'
        });

        controlsContainer.append(transformPanel);
        controlsContainer.append(cameraPanel)
        controlsContainer.append(selectionPanel);
        controlsContainer.append(showPanel);
        controlsContainer.append(modifyPanel);
        controlsContainer.append(optionsPanel);

        // append
        this.content.append(scenePanel);
        this.content.append(controlsContainer);

        rectSelectButton.on('click', () => {
            events.fire('tool.rectSelection');
        });

        brushSelectButton.on('click', () => {
            events.fire('tool.brushSelection');
        });

        pickerSelectButton.on('click', () => {
            events.fire('tool.pickerSelection');
        });

        events.on('tool.activated', (toolName: string) => {
            rectSelectButton.class[toolName === 'rectSelection' ? 'add' : 'remove']('active');
            brushSelectButton.class[toolName === 'brushSelection' ? 'add' : 'remove']('active');
            pickerSelectButton.class[toolName === 'pickerSelection' ? 'add' : 'remove']('active');
        });

        // radio logic
        const radioGroup = [selectBySphereRadio, selectByPlaneRadio];
        radioGroup.forEach((radio, index) => {
            radio.on('change', () => {
                if (radio.value) {
                    radioGroup.forEach((other) => {
                        if (other !== radio) {
                            other.value = false;
                        }
                    });

                    // update select by
                    events.fire('selectBy', index);
                } else {
                    // update select by
                    events.fire('selectBy', null);
                }
            });
        });

        const axes: any = {
            x: [1, 0, 0],
            y: [0, 1, 0],
            z: [0, 0, 1]
        };

        let radioSelection: number | null = null;
        events.on('selectBy', (index: number | null) => {
            radioSelection = index;

            setButton.enabled = index !== null;
            addButton.enabled = index !== null;
            removeButton.enabled = index !== null;

            const controlSet = [
                [selectBySphereCenter],
                [selectByPlaneAxis, selectByPlaneOffset]
            ];

            controlSet.forEach((controls, controlsIndex) => {
                controls.forEach((control) => {
                    control.enabled = index === controlsIndex;
                });
            });

            events.fire('select.bySpherePlacement', index === 0 ? selectBySphereCenter.value : [0, 0, 0, 0]);
            events.fire('select.byPlanePlacement', index === 1 ? axes[selectByPlaneAxis.value] : [0, 0, 0], selectByPlaneOffset.value);
        });

        const performSelect = (op: string) => {
            switch (radioSelection) {
                case 0: events.fire('select.bySphere', op, selectBySphereCenter.value); break;
                case 1: events.fire('select.byPlane', op, axes[selectByPlaneAxis.value], selectByPlaneOffset.value); break;
            }
        };

        setButton.on('click', () => performSelect('set'));
        addButton.on('click', () => performSelect('add'));
        removeButton.on('click', () => performSelect('remove'));

        events.function('camera.mode', () => {
            return modeSelect.value;
        });

        events.on('camera.mode', (mode: string) => {
            modeSelect.value = mode;
        });

        events.on('camera.toggleMode', () => {
            modeSelect.value = modeSelect.value === 'centers' ? 'rings' : 'centers';
        });

        modeSelect.on('change', (value: string) => {
            events.fire('camera.mode', value);
        });

        events.on('splatSize', (value: number) => {
            splatSizeSlider.value = value;
        });

        events.function('splatSize', () => {
            return splatSizeSlider.value;
        });

        splatSizeSlider.on('change', (value: number) => {
            events.fire('splatSize', value);
        });

        focusButton.on('click', () => {
            events.fire('camera.focus');
        });

        showGridToggle.on('change', (enabled: boolean) => {
            events.fire(enabled ? 'show.gridOn' : 'show.gridOff');
        });

        selectAllButton.on('click', () => {
            events.fire('select.all');
        });

        selectNoneButton.on('click', () => {
            events.fire('select.none');
        });

        invertSelectionButton.on('click', () => {
            events.fire('select.invert');
        });

        selectBySphereCenter.on('change', () => {
            events.fire('select.bySpherePlacement', selectBySphereCenter.value);
        });

        selectByPlaneAxis.on('change', () => {
            events.fire('select.byPlanePlacement', axes[selectByPlaneAxis.value], selectByPlaneOffset.value);
        });

        selectByPlaneOffset.on('change', () => {
            events.fire('select.byPlanePlacement', axes[selectByPlaneAxis.value], selectByPlaneOffset.value);
        });

        hideSelection.on('click', () => {
            events.fire('select.hide');
        });

        unhideAll.on('click', () => {
            events.fire('select.unhide');
        });

        deleteSelectionButton.on('click', () => {
            events.fire('select.delete');
        });

        resetButton.on('click', () => {
            events.fire('scene.reset');
        });

        allDataToggle.on('change', (enabled: boolean) => {
            events.fire('allData', enabled);
        });

        events.on('splat.count', (count: number) => {
            selectionPanel.headerText = `SELECTION${count === 0 ? '' : ' (' + count.toString() + ')'}`;
        });
    }
}

export { ControlPanel };
