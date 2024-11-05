import { Vec3 } from 'playcanvas';
import { Container, Label } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';
import { localize } from './localization';

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
            class: 'camera-panel-list-container'
        });

        const poseList = new Container({
            class: 'camera-panel-list'
        });

        poseListContainer.append(poseList);

        this.append(poseHeader);
        this.append(poseListContainer);

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

        // tooltips
        tooltips.register(poseAdd, localize('options.add-pose'));
        tooltips.register(posePrev, localize('options.prev-pose'));
        tooltips.register(poseNext, localize('options.next-pose'));
        tooltips.register(posePlay, localize('options.play-poses'));
        tooltips.register(poseClear, localize('options.clear-poses'));

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
    }
}

export { CameraPanel };
