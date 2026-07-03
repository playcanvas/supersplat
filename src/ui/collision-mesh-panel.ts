import { BooleanInput, Button, Container, Label, NumericInput, SelectInput, SliderInput, VectorInput } from '@playcanvas/pcui';

import { CollisionMeshOptions } from '../collision-mesh-events';
import { Events } from '../events';
import { i18n } from './localization';
import { Tooltips } from './tooltips';

type PresetName = 'surface' | 'object' | 'indoor' | 'outdoor';

type PresetValues = {
    clusterFilter: boolean;
    fillMode: 'none' | 'exterior' | 'floor';
    carve: boolean;
    carveHeight: number;
    carveRadius: number;
};

// scene type presets matching SuperSplat Studio's server-side voxel
// generation (see the gsplat-generate-collision GPU job): indoor seals the
// exterior, outdoor fills from the floor, object uses a tighter carve capsule
const PRESETS: Record<PresetName, PresetValues> = {
    surface: { clusterFilter: false, fillMode: 'none', carve: false, carveHeight: 1.6, carveRadius: 0.2 },
    object: { clusterFilter: true, fillMode: 'none', carve: true, carveHeight: 0.4, carveRadius: 0.2 },
    indoor: { clusterFilter: true, fillMode: 'exterior', carve: true, carveHeight: 1.6, carveRadius: 0.2 },
    outdoor: { clusterFilter: true, fillMode: 'floor', carve: true, carveHeight: 1.6, carveRadius: 0.2 }
};

class CollisionMeshPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'collision-mesh-panel',
            class: 'panel',
            hidden: true
        };

        super(args);

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        // header

        const header = new Container({
            class: 'panel-header'
        });

        const icon = new Label({
            class: 'panel-header-icon',
            text: '\uE187'
        });

        const label = new Label({
            class: 'panel-header-label'
        });
        i18n.bindText(label, 'panel.collision-mesh');

        header.append(icon);
        header.append(label);

        // row helper

        const createRow = (localeKey: string) => {
            const row = new Container({
                class: 'collision-mesh-panel-row'
            });
            const rowLabel = new Label({
                class: 'collision-mesh-panel-row-label'
            });
            i18n.bindText(rowLabel, localeKey);
            row.append(rowLabel);
            return row;
        };

        // scene type preset

        const sceneTypeRow = createRow('panel.collision-mesh.scene-type');
        const sceneTypeSelect = new SelectInput({
            class: 'collision-mesh-panel-row-select',
            defaultValue: 'outdoor'
        });
        i18n.bindOptions(sceneTypeSelect, () => [
            { v: 'surface', t: i18n.t('panel.collision-mesh.scene-type.surface') },
            { v: 'object', t: i18n.t('panel.collision-mesh.scene-type.object') },
            { v: 'indoor', t: i18n.t('panel.collision-mesh.scene-type.indoor') },
            { v: 'outdoor', t: i18n.t('panel.collision-mesh.scene-type.outdoor') },
            { v: 'custom', t: i18n.t('panel.collision-mesh.scene-type.custom') }
        ]);
        sceneTypeRow.append(sceneTypeSelect);

        // seed position

        const seedRow = createRow('panel.collision-mesh.seed');
        const seedFromCamera = new Label({
            class: 'panel-header-button',
            text: '\uE212'
        });
        const seedVector = new VectorInput({
            class: 'collision-mesh-panel-row-vector',
            dimensions: 3,
            precision: 2,
            placeholder: ['X', 'Y', 'Z'],
            value: [0, 0, 0]
        });
        seedRow.append(seedFromCamera);
        seedRow.append(seedVector);

        // generate button

        const generateRow = new Container({
            class: 'collision-mesh-panel-row'
        });
        const generateButton = new Button({
            class: 'collision-mesh-panel-button'
        });
        i18n.bindText(generateButton, 'panel.collision-mesh.generate');
        generateRow.append(generateButton);

        // advanced section

        const advancedRow = createRow('panel.collision-mesh.advanced');
        const advancedToggle = new BooleanInput({
            class: 'collision-mesh-panel-row-toggle',
            value: false
        });
        advancedRow.append(advancedToggle);

        const advancedContainer = new Container({
            class: 'collision-mesh-panel-advanced',
            hidden: true
        });

        const voxelSizeRow = createRow('panel.collision-mesh.voxel-size');
        const voxelSizeInput = new NumericInput({
            class: 'collision-mesh-panel-row-numeric',
            min: 0.001,
            precision: 3,
            step: 0.01,
            value: 0.05
        });
        voxelSizeRow.append(voxelSizeInput);

        const opacityCutoffRow = createRow('panel.collision-mesh.opacity-cutoff');
        const opacityCutoffSlider = new SliderInput({
            class: 'collision-mesh-panel-row-slider',
            min: 0,
            max: 0.95,
            step: 0.01,
            value: 0.1
        });
        opacityCutoffRow.append(opacityCutoffSlider);

        const styleRow = createRow('panel.collision-mesh.style');
        const styleSelect = new SelectInput({
            class: 'collision-mesh-panel-row-select',
            defaultValue: 'smooth'
        });
        i18n.bindOptions(styleSelect, () => [
            { v: 'smooth', t: i18n.t('panel.collision-mesh.style.smooth') },
            { v: 'faces', t: i18n.t('panel.collision-mesh.style.faces') }
        ]);
        styleRow.append(styleSelect);

        const clusterRow = createRow('panel.collision-mesh.cluster-filter');
        const clusterToggle = new BooleanInput({
            class: 'collision-mesh-panel-row-toggle',
            value: false
        });
        clusterRow.append(clusterToggle);

        const fillModeRow = createRow('panel.collision-mesh.fill-mode');
        const fillModeSelect = new SelectInput({
            class: 'collision-mesh-panel-row-select',
            defaultValue: 'none'
        });
        i18n.bindOptions(fillModeSelect, () => [
            { v: 'none', t: i18n.t('panel.collision-mesh.fill-mode.none') },
            { v: 'exterior', t: i18n.t('panel.collision-mesh.fill-mode.exterior') },
            { v: 'floor', t: i18n.t('panel.collision-mesh.fill-mode.floor') }
        ]);
        fillModeRow.append(fillModeSelect);

        const fillRadiusRow = createRow('panel.collision-mesh.fill-radius');
        const fillRadiusInput = new NumericInput({
            class: 'collision-mesh-panel-row-numeric',
            min: 0,
            precision: 2,
            step: 0.1,
            value: 1.6
        });
        fillRadiusRow.append(fillRadiusInput);

        const floorDilationRow = createRow('panel.collision-mesh.floor-dilation');
        const floorDilationInput = new NumericInput({
            class: 'collision-mesh-panel-row-numeric',
            min: 0,
            precision: 2,
            step: 0.1,
            value: 0
        });
        floorDilationRow.append(floorDilationInput);

        const carveRow = createRow('panel.collision-mesh.carve');
        const carveToggle = new BooleanInput({
            class: 'collision-mesh-panel-row-toggle',
            value: false
        });
        carveRow.append(carveToggle);

        const carveHeightRow = createRow('panel.collision-mesh.carve-height');
        const carveHeightInput = new NumericInput({
            class: 'collision-mesh-panel-row-numeric',
            min: 0,
            precision: 2,
            step: 0.1,
            value: 1.6
        });
        carveHeightRow.append(carveHeightInput);

        const carveRadiusRow = createRow('panel.collision-mesh.carve-radius');
        const carveRadiusInput = new NumericInput({
            class: 'collision-mesh-panel-row-numeric',
            min: 0,
            precision: 2,
            step: 0.1,
            value: 0.2
        });
        carveRadiusRow.append(carveRadiusInput);

        advancedContainer.append(voxelSizeRow);
        advancedContainer.append(opacityCutoffRow);
        advancedContainer.append(styleRow);
        advancedContainer.append(clusterRow);
        advancedContainer.append(fillModeRow);
        advancedContainer.append(fillRadiusRow);
        advancedContainer.append(floorDilationRow);
        advancedContainer.append(carveRow);
        advancedContainer.append(carveHeightRow);
        advancedContainer.append(carveRadiusRow);

        // preview controls

        const showRow = createRow('panel.collision-mesh.show-preview');
        const showToggle = new BooleanInput({
            class: 'collision-mesh-panel-row-toggle',
            value: true
        });
        showRow.append(showToggle);

        const displayRow = createRow('panel.collision-mesh.render-mode');
        const displaySelect = new SelectInput({
            class: 'collision-mesh-panel-row-select',
            defaultValue: 'both'
        });
        i18n.bindOptions(displaySelect, () => [
            { v: 'wireframe', t: i18n.t('panel.collision-mesh.render-mode.wireframe') },
            { v: 'solid', t: i18n.t('panel.collision-mesh.render-mode.solid') },
            { v: 'both', t: i18n.t('panel.collision-mesh.render-mode.both') }
        ]);
        displayRow.append(displaySelect);

        const opacityRow = createRow('panel.collision-mesh.opacity');
        const opacitySlider = new SliderInput({
            class: 'collision-mesh-panel-row-slider',
            min: 0.05,
            max: 1,
            step: 0.05,
            value: 0.5
        });
        opacityRow.append(opacitySlider);

        // stats & stale hint

        const statsRow = new Container({
            class: 'collision-mesh-panel-row'
        });
        const statsLabel = new Label({
            class: 'collision-mesh-panel-stats',
            text: ''
        });
        statsRow.append(statsLabel);

        const staleRow = new Container({
            class: 'collision-mesh-panel-row',
            hidden: true
        });
        const staleLabel = new Label({
            class: 'collision-mesh-panel-stale'
        });
        i18n.bindText(staleLabel, 'panel.collision-mesh.stale');
        staleRow.append(staleLabel);

        // control row

        const controlRow = new Container({
            class: 'collision-mesh-panel-control-row'
        });
        const exportButton = new Button({
            class: 'collision-mesh-panel-button',
            enabled: false
        });
        i18n.bindText(exportButton, 'panel.collision-mesh.export');
        const removeButton = new Button({
            class: 'collision-mesh-panel-button',
            enabled: false
        });
        i18n.bindText(removeButton, 'panel.collision-mesh.remove');
        controlRow.append(exportButton);
        controlRow.append(removeButton);

        this.append(header);
        this.append(sceneTypeRow);
        this.append(seedRow);
        this.append(advancedRow);
        this.append(advancedContainer);
        this.append(generateRow);
        this.append(new Label({ class: 'panel-header-spacer' }));
        this.append(showRow);
        this.append(displayRow);
        this.append(opacityRow);
        this.append(statsRow);
        this.append(staleRow);
        this.append(new Label({ class: 'panel-header-spacer' }));
        this.append(controlRow);

        tooltips.register(seedFromCamera, () => i18n.t('panel.collision-mesh.seed-from-camera'), 'top');

        // preset handling: the preset owns the cluster/fill/carve controls.
        // editing any of them switches the scene type to custom.

        let suppress = false;

        const updateConditionalControls = () => {
            fillRadiusRow.hidden = fillModeSelect.value !== 'exterior';
            floorDilationRow.hidden = fillModeSelect.value !== 'floor';
            carveHeightRow.enabled = carveToggle.value;
            carveRadiusRow.enabled = carveToggle.value;

            const needsSeed = clusterToggle.value || fillModeSelect.value !== 'none' || carveToggle.value;
            seedVector.enabled = needsSeed;
            seedFromCamera.enabled = needsSeed;
        };

        const applyPreset = (preset: PresetValues) => {
            suppress = true;
            clusterToggle.value = preset.clusterFilter;
            fillModeSelect.value = preset.fillMode;
            carveToggle.value = preset.carve;
            carveHeightInput.value = preset.carveHeight;
            carveRadiusInput.value = preset.carveRadius;
            suppress = false;
            updateConditionalControls();
        };

        sceneTypeSelect.on('change', (value: string) => {
            if (suppress) return;
            if (value !== 'custom') {
                applyPreset(PRESETS[value as PresetName]);
            }
        });

        // editing a preset-owned control flips the scene type to custom
        [clusterToggle, fillModeSelect, carveToggle, carveHeightInput, carveRadiusInput].forEach((control) => {
            control.on('change', () => {
                if (suppress) {
                    return;
                }
                if (sceneTypeSelect.value !== 'custom') {
                    suppress = true;
                    sceneTypeSelect.value = 'custom';
                    suppress = false;
                }
                updateConditionalControls();
            });
        });

        advancedToggle.on('change', (value: boolean) => {
            advancedContainer.hidden = !value;
        });

        // seed

        let seedInitialised = false;

        const seedFromCameraPose = () => {
            const pose = events.invoke('camera.getPose');
            if (pose) {
                seedVector.value = [pose.position.x, pose.position.y, pose.position.z];
                seedInitialised = true;
            }
        };

        seedFromCamera.on('click', () => {
            if (seedFromCamera.enabled) {
                seedFromCameraPose();
            }
        });

        // generate

        const collectOptions = (): CollisionMeshOptions => {
            const seed = seedVector.value as number[];
            return {
                seed: { x: seed[0], y: seed[1], z: seed[2] },
                voxelSize: voxelSizeInput.value,
                opacityCutoff: opacityCutoffSlider.value,
                style: styleSelect.value as 'smooth' | 'faces',
                clusterFilter: clusterToggle.value,
                fillMode: fillModeSelect.value as 'none' | 'exterior' | 'floor',
                fillRadius: fillRadiusInput.value,
                floorFillDilation: floorDilationInput.value,
                carve: carveToggle.value,
                carveHeight: carveHeightInput.value,
                carveRadius: carveRadiusInput.value
            };
        };

        const updateGenerateEnabled = () => {
            const empty = (events.invoke('scene.empty') as boolean) ?? true;
            const generating = (events.invoke('collisionMesh.generating') as boolean) ?? false;
            generateButton.enabled = !empty && !generating;
        };

        generateButton.on('click', async () => {
            if (generateButton.enabled) {
                await events.invoke('collisionMesh.generate', collectOptions());
            }
        });

        events.on('collisionMesh.generating', updateGenerateEnabled);
        events.on('scene.elementAdded', updateGenerateEnabled);
        events.on('scene.elementRemoved', updateGenerateEnabled);
        events.on('splat.visibility', updateGenerateEnabled);

        // preview controls

        showToggle.on('change', (value: boolean) => {
            events.fire('collisionMesh.setVisible', value);
        });
        events.on('collisionMesh.visible', (visible: boolean) => {
            showToggle.value = visible;
        });

        displaySelect.on('change', (value: string) => {
            events.fire('collisionMesh.setRenderMode', value);
        });
        events.on('collisionMesh.renderMode', (renderMode: string) => {
            displaySelect.value = renderMode;
        });

        opacitySlider.on('change', (value: number) => {
            events.fire('collisionMesh.setOpacity', value);
        });
        events.on('collisionMesh.opacity', (opacity: number) => {
            opacitySlider.value = opacity;
        });

        // stats & buttons

        const updateStats = () => {
            const count = (events.invoke('collisionMesh.triangleCount') as number) ?? 0;
            statsLabel.text = count > 0 ? `${i18n.formatInteger(count)} ${i18n.t('panel.collision-mesh.triangles')}` : '';
            exportButton.enabled = count > 0;
            removeButton.enabled = count > 0;
        };

        events.on('collisionMesh.changed', updateStats);

        events.on('collisionMesh.staleChanged', (stale: boolean) => {
            staleRow.hidden = !stale;
        });

        exportButton.on('click', () => {
            if (exportButton.enabled) {
                events.invoke('collisionMesh.export');
            }
        });

        removeButton.on('click', () => {
            if (removeButton.enabled) {
                events.fire('collisionMesh.remove');
            }
        });

        // handle panel visibility

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('collisionMeshPanel.visible', visible);

                if (visible) {
                    // initialise the seed from the camera the first time the
                    // panel is shown
                    if (!seedInitialised) {
                        seedFromCameraPose();
                    }
                    updateGenerateEnabled();
                    updateStats();
                }
            }
        };

        events.function('collisionMeshPanel.visible', () => {
            return !this.hidden;
        });

        events.on('collisionMeshPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('collisionMeshPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('colorPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        events.on('viewPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        // apply the default preset
        applyPreset(PRESETS.outdoor);
    }
}

export { CollisionMeshPanel };
