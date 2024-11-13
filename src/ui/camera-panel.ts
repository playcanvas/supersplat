import { Container, Label } from 'pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';
import { localize } from './localization';
import { Tooltips } from './tooltips';

class CameraPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'camera-panel',
            class: 'panel',
            hidden: true
        };

        super(args);

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        // camera poses

        const header = new Container({
            class: 'panel-header'
        });

        const icon = new Label({
            class: 'panel-header-icon',
            text: '\uE212'
        });

        const headerLabel = new Label({
            text: localize('camera'),
            class: 'panel-header-label'
        });

        header.append(icon);
        header.append(headerLabel);

        // pose list

        const poseListContainer = new Container({
            class: 'camera-panel-list-container'
        });

        const poseList = new Container({
            class: 'camera-panel-list'
        });

        poseListContainer.append(poseList);

        // control row

        const controlRow = new Container({
            class: 'camera-panel-control-row'
        });

        const poseAdd = new Label({
            class: 'panel-header-button',
            text: '\uE120'
        });

        const posePrev = new Label({
            class: 'panel-header-button',
            text: '\uE162'
        });

        const posePlay = new Label({
            class: 'panel-header-button',
            text: '\uE131'
        });

        const poseNext = new Label({
            class: 'panel-header-button',
            text: '\uE164'
        });

        const poseClear = new Label({
            class: 'panel-header-button',
            text: '\uE125'
        });

        controlRow.append(poseAdd);
        controlRow.append(new Label({ class: 'panel-header-spacer' }));
        controlRow.append(posePrev);
        controlRow.append(posePlay);
        controlRow.append(poseNext);
        controlRow.append(new Label({ class: 'panel-header-spacer' }));
        controlRow.append(poseClear);

        this.append(header);
        this.append(poseListContainer);
        this.append(controlRow);

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
                class: 'camera-panel-list-row'
            });

            const label = new Label({
                text: pose.name ?? 'camera',
                class: 'camera-panel-list-row-label'
            });

            row.append(label);

            row.on('click', () => {
                setPose(poses.findIndex(r => r.pose === pose));
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

        // tooltips
        tooltips.register(poseAdd, localize('camera.add-pose'));
        tooltips.register(posePrev, localize('camera.prev-pose'));
        tooltips.register(poseNext, localize('camera.next-pose'));
        tooltips.register(posePlay, localize('camera.play-poses'));
        tooltips.register(poseClear, localize('camera.clear-poses'));

        // handle panel visibility

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('cameraPanel.visible', visible);
            }
        };

        events.function('cameraPanel.visible', () => {
            return !this.hidden;
        });

        events.on('cameraPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('cameraPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('viewPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        events.on('colorPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });
    }
}

export { CameraPanel };
