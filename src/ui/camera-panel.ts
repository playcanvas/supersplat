import { Container, Label } from 'pcui';
import { EventHandle, Vec3 } from 'playcanvas';

import { CubicSpline } from 'src/anim/spline';

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

        // animation support
        let animHandle: EventHandle = null;

        // stop the playing animation
        const stop = () => {
            posePlay.text = '\uE131';
            animHandle.off();
            animHandle = null;
        };

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

            // cancel animation playback if user selects a pose during animation
            if (animHandle) {
                stop();
            }
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

        // start playing the current camera poses animation
        const play = () => {
            posePlay.text = '\uE135';

            // construct the spline points to be interpolated
            const times = poses.map((p, i) => i);
            const points = [];
            for (let i = 0; i < poses.length; ++i) {
                const p = poses[i].pose;
                points.push(p.position.x, p.position.y, p.position.z);
                points.push(p.target.x, p.target.y, p.target.z);
            }

            // interpolate camera positions and camera target positions
            const spline = CubicSpline.fromPoints(times, points);
            const result: number[] = [];
            const pose = { position: new Vec3(), target: new Vec3() };
            let time = 0;

            // handle application update tick
            animHandle = events.on('update', (dt: number) => {
                time = (time + dt) % (poses.length - 1);

                // evaluate the spline at current time
                spline.evaluate(time, result);

                // set camera pose
                pose.position.set(result[0], result[1], result[2]);
                pose.target.set(result[3], result[4], result[5]);
                events.fire('camera.setPose', pose, 0);
            });
        };

        posePlay.on('click', () => {
            if (animHandle) {
                stop();
            } else if (poses.length > 0) {
                play();
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

        // cancel animation playback if user interacts with camera
        events.on('camera.controller', (type: string) => {
            if (type !== 'pointermove') {
                if (animHandle) {
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

        events.function('docSerialize.poseSets', (): any[] => {
            const pack3 = (v: Vec3) => [v.x, v.y, v.z];

            if (poses.length === 0) {
                return [];
            }

            return [{
                name: 'set0',
                poses: poses.map((p) => {
                    const { pose } = p;
                    return {
                        name: pose.name,
                        position: pack3(pose.position),
                        target: pack3(pose.target)
                    };
                })
            }];
        });

        events.function('docDeserialize.poseSets', (poseSets: any[]) => {
            if (poseSets.length === 0) {
                return;
            }

            // for now, load the first poseSet

            poseSets[0].poses.forEach((docPose: any) => {
                addPose({
                    name: docPose.name,
                    position: new Vec3(docPose.position),
                    target: new Vec3(docPose.target)
                });
            });
        });
    }
}

export { CameraPanel };
