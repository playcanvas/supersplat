import { BooleanInput, Button, Container, Label, NumericInput, Panel, RadioButton, SelectInput, SliderInput, VectorInput } from 'pcui';
import { Events } from '../events';
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

        // selection panel
        const selectionPanel = new Panel({
            id: 'selection-panel',
            class: 'control-panel',
            headerText: 'SELECTION'
        });

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

        selectionPanel.append(selectBySphere);
        selectionPanel.append(selectByPlane);
        selectionPanel.append(setAddRemove);

        const controlsContainer = new Container({
            id: 'control-panel-controls'
        });

        controlsContainer.append(selectionPanel);

        // append
        this.content.append(controlsContainer);

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

        // camera mode

        let activeMode = 'centers';

        const setCameraMode = (mode: string) => {
            if (mode !== activeMode) {
                activeMode = mode;
                events.fire('camera.mode', activeMode);
            }
        };

        events.function('camera.mode', () => {
            return activeMode;
        });

        events.on('camera.setMode', (mode: string) => {
            setCameraMode(mode);
        });

        events.on('camera.toggleMode', () => {
            setCameraMode(events.invoke('camera.mode') === 'centers' ? 'rings' : 'centers');
        });

        // camera debug

        let cameraDebug = true;

        const setCameraDebug = (enabled: boolean) => {
            if (enabled !== cameraDebug) {
                cameraDebug = enabled;
                events.fire('camera.debug', cameraDebug);
            }
        };

        events.function('camera.debug', () => {
            return cameraDebug;
        });

        events.on('camera.setDebug', (value: boolean) => {
            setCameraDebug(value);
        });

        events.on('camera.toggleDebug', () => {
            setCameraDebug(!events.invoke('camera.debug'));
        });

        // splat size

        let splatSize = 2;

        const setSplatSize = (value: number) => {
            if (value !== splatSize) {
                splatSize = value;
                events.fire('camera.splatSize', splatSize);
            }
        };

        events.function('camera.splatSize', () => {
            return splatSize;
        });
    
        events.on('camera.setSplatSize', (value: number) => {
            setSplatSize(value);
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
    }
}

export { ControlPanel };
