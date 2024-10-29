import { Vec3 } from 'playcanvas';
import { BooleanInput, ColorPicker, Container, Label, SliderInput } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';
import { localize } from './localization';

class ViewPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'view-panel',
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
            class: `panel-header`
        });

        const icon = new Label({
            text: '\uE403',
            class: `panel-header-icon`
        });

        const label = new Label({
            text: localize('options'),
            class: `panel-header-label`
        });

        header.append(icon);
        header.append(label);

        // background color

        const bgClrRow = new Container({
            class: 'view-panel-row'
        });

        const bgClrLabel = new Label({
            text: localize('options.bg-clr'),
            class: 'view-panel-row-label'
        });

        const bgClrPicker = new ColorPicker({
            class: 'view-panel-row-picker',
            value: [0.4, 0.4, 0.4]
        });

        bgClrRow.append(bgClrLabel);
        bgClrRow.append(bgClrPicker);

        // camera fov

        const fovRow = new Container({
            class: 'view-panel-row'
        });
        
        const fovLabel = new Label({
            text: localize('options.fov'),
            class: 'view-panel-row-label'
        });
        
        const fovSlider = new SliderInput({
            class: 'view-panel-row-slider',
            min: 10,
            max: 120,
            precision: 1,
            value: 60
        });

        fovRow.append(fovLabel);
        fovRow.append(fovSlider);

        // sh bands
        const shBandsRow = new Container({
            class: 'view-panel-row'
        });

        const shBandsLabel = new Label({
            text: localize('options.sh-bands'),
            class: 'view-panel-row-label'
        });

        const shBandsSlider = new SliderInput({
            class: 'view-panel-row-slider',
            min: 0,
            max: 3,
            precision: 0,
            value: 3
        });

        shBandsRow.append(shBandsLabel);
        shBandsRow.append(shBandsSlider);

        // centers size

        const centersSizeRow = new Container({
            class: 'view-panel-row'
        });

        const centersSizeLabel = new Label({
            text: localize('options.centers-size'),
            class: 'view-panel-row-label'
        });

        const centersSizeSlider = new SliderInput({
            class: 'view-panel-row-slider',
            min: 0,
            max: 10,
            precision: 1,
            value: 2
        });

        centersSizeRow.append(centersSizeLabel);
        centersSizeRow.append(centersSizeSlider);

        // outline selection

        const outlineSelectionRow = new Container({
            class: 'view-panel-row'
        });

        const outlineSelectionLabel = new Label({
            text: localize('options.outline-selection'),
            class: 'view-panel-row-label'
        });

        const outlineSelectionToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: false
        });

        outlineSelectionRow.append(outlineSelectionLabel);
        outlineSelectionRow.append(outlineSelectionToggle);

        // show grid

        const showGridRow = new Container({
            class: 'view-panel-row'
        });

        const showGridLabel = new Label({
            text: localize('options.show-grid'),
            class: 'view-panel-row-label'
        });

        const showGridToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: true
        });

        showGridRow.append(showGridLabel);
        showGridRow.append(showGridToggle);

        // show bound

        const showBoundRow = new Container({
            class: 'view-panel-row'
        });

        const showBoundLabel = new Label({
            text: localize('options.show-bound'),
            class: 'view-panel-row-label'
        });

        const showBoundToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: true
        });

        showBoundRow.append(showBoundLabel);
        showBoundRow.append(showBoundToggle);

        // camera poses

        const poseHeader = new Container({
            class: 'panel-header'
        });

        const poseIcon = new Label({
            class: 'panel-header-icon',
            text: '\uE212'
        });

        const poseHeaderLabel = new Label({
            text: localize('options.pose-header'),
            class: 'panel-header-label'
        });

        const poseAdd = new Label({
            class: 'panel-header-button',
            text: '\uE120'
        });

        const posePrev = new Label({
            class: 'panel-header-button',
            text: '\uE162'
        });

        const poseNext = new Label({
            class: 'panel-header-button',
            text: '\uE164'
        });

        const posePlay = new Label({
            class: 'panel-header-button',
            text: '\uE131'
        });

        const poseClear = new Label({
            class: 'panel-header-button',
            text: '\uE125'
        });

        poseHeader.append(poseIcon);
        poseHeader.append(poseHeaderLabel);
        poseHeader.append(poseAdd);
        poseHeader.append(new Label({ class: 'panel-header-spacer' }));
        poseHeader.append(posePrev);
        poseHeader.append(poseNext);
        poseHeader.append(posePlay);
        poseHeader.append(new Label({ class: 'panel-header-spacer' }));
        poseHeader.append(poseClear);

        const poseListContainer = new Container({
            class: 'view-panel-list-container'
        });

        const poseList = new Container({
            class: 'view-panel-list'
        });

        poseListContainer.append(poseList);

        this.append(header);
        this.append(bgClrRow);
        this.append(fovRow);
        this.append(shBandsRow);
        this.append(centersSizeRow);
        this.append(outlineSelectionRow);
        this.append(showGridRow);
        this.append(showBoundRow);
        this.append(poseHeader);
        this.append(poseListContainer);

        // handle panel visibility

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('viewPanel.visible', visible);
            }
        };

        events.function('viewPanel.visible', () => {
            return !this.hidden;
        });

        events.on('viewPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('viewPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        // sh bands

        events.on('view.bands', (bands: number) => {
            shBandsSlider.value = bands;
        });

        shBandsSlider.on('change', (value: number) => {
            events.fire('view.setBands', value);
        });

        // splat size

        events.on('camera.splatSize', (value: number) => {
            centersSizeSlider.value = value;
        });

        centersSizeSlider.on('change', (value: number) => {
            events.fire('camera.setSplatSize', value);
            events.fire('camera.setOverlay', true);
            events.fire('camera.setMode', 'centers');
        });

        // outline selection

        events.on('view.outlineSelection', (value: boolean) => {
            outlineSelectionToggle.value = value;
        });

        outlineSelectionToggle.on('change', (value: boolean) => {
            events.fire('view.setOutlineSelection', value);
        });

        // show grid

        events.on('grid.visible', (visible: boolean) => {
            showGridToggle.value = visible;
        });

        showGridToggle.on('change', () => {
            events.fire('grid.setVisible', showGridToggle.value);
        });

        // show bound

        events.on('camera.bound', (visible: boolean) => {
            showBoundToggle.value = visible;
        });

        showBoundToggle.on('change', () => {
            events.fire('camera.setBound', showBoundToggle.value);
        });

        // poses

        type Pose = {
            name: string,
            position: Vec3,
            target: Vec3
        };
        const poses: { pose: Pose, row: Container }[] = [];
        let currentPose = -1;

        const setPose = (index: number, speed = 1) => {
            if (index === currentPose) {
                return;
            }

            if (index !== -1) {
                events.fire('camera.setPose', poses[index].pose, speed);
            }

            poses.forEach((p, i) => {
                if (i === index) {
                    p.row.class.add('selected');
                    p.row.dom.scrollIntoView({ block: 'nearest' });
                } else {
                    p.row.class.remove('selected');
                }
            });

            currentPose = index;
        };

        const addPose = (pose: Pose) => {
            const row = new Container({
                class: 'view-panel-list-row'
            });

            const label = new Label({
                text: pose.name ?? 'camera',
                class: 'view-panel-list-row-label'
            });

            row.append(label);

            row.on('click', () => {
                setPose(poses.findIndex((r) => r.pose === pose));
            });

            poseList.append(row);
            poses.push({ row, pose });
        };

        const removePose = (index: number) => {
            poseList.remove(poses[index].row);
            poses.splice(index, 1);
        };

        const nextPose = () => {
            if (poses.length > 0) {
                setPose((currentPose + 1) % poses.length, 2.5);
            }
        };

        const prevPose = () => {
            if (poses.length > 0) {
                setPose((currentPose - 1 + poses.length) % poses.length);
            }
        };

        poseAdd.on('click', () => {
            // get the current camera pose
            const pose = events.invoke('camera.getPose');

            addPose({
                name: `camera_${poses.length}`,
                position: pose.position,
                target: pose.target
            });
        });

        posePrev.on('click', () => {
            prevPose();
        });

        poseNext.on('click', () => {
            nextPose();
        });

        let timeout: number = null;

        const stop = () => {
            posePlay.text = '\uE131';
            clearTimeout(timeout);
            timeout = null;
        };

        posePlay.on('click', () => {
            if (timeout) {
                
                stop();
            } else if (poses.length > 0) {
                const next = () => {
                    nextPose();
                    timeout = window.setTimeout(next, 250);
                };

                posePlay.text = '\uE135';
                next();
            }
        });

        events.function('camera.poses', () => {
            return poses.map(p => p.pose);
        });

        events.on('camera.addPose', (pose: Pose) => {
            addPose(pose);
        });

        events.on('camera.removePose', (index: number) => {
            removePose(index);
        });

        events.on('camera.controller', (type: string) => {
            if (type !== 'pointermove') {
                if (timeout) {
                    stop();
                } else {
                    setPose(-1);
                }
            }
        });

        poseClear.on('click', () => {
            while (poses.length > 0) {
                removePose(0);
            }
        });

        // background color

        bgClrPicker.on('change', (value: number[]) => {
            events.fire('setBgClr', value[0], value[1], value[2]);
        });

        // camera fov

        events.on('camera.fov', (fov: number) => {
            fovSlider.value = fov;
        });

        fovSlider.on('change', (value: number) => {
            events.fire('camera.setFov', value);
        });

        // tooltips

        tooltips.register(poseAdd, localize('options.add-pose'));
        tooltips.register(posePrev, localize('options.prev-pose'));
        tooltips.register(poseNext, localize('options.next-pose'));
        tooltips.register(posePlay, localize('options.play-poses'));
        tooltips.register(poseClear, localize('options.clear-poses'));
    }
}

export { ViewPanel };
