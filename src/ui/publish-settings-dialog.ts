import { BooleanInput, Button, ColorPicker, Container, Element, Label, SelectInput, SliderInput, TextAreaInput, TextInput } from '@playcanvas/pcui';

import { Pose } from '../camera-poses';
import { Events } from '../events';
import { i18n } from './localization';
import { PublishSettings, UserStatus } from '../publish';
import { AnimTrack, ExperienceSettings, defaultPostEffectSettings } from '../splat-serialize';
import sceneExport from './svg/export.svg';

const createSvg = (svgString: string, args = {}) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement,
        ...args
    });
};

class PublishSettingsDialog extends Container {
    show: (userStatus: UserStatus) => Promise<PublishSettings | null>;
    hide: () => void;
    destroy: () => void;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'publish-settings-dialog',
            class: 'settings-dialog',
            hidden: true,
            tabIndex: -1
        };

        super(args);

        const dialog = new Container({
            id: 'dialog'
        });

        // header

        const headerIcon = createSvg(sceneExport, { id: 'icon' });
        const headerText = new Label({ id: 'text' });
        i18n.bindText(headerText, 'popup.publish.header');
        const header = new Container({ id: 'header' });
        header.append(headerIcon);
        header.append(headerText);

        // overwrite

        const overwriteLabel = new Label({ class: 'label' });
        i18n.bindText(overwriteLabel, 'popup.publish.to');
        const overwriteSelect = new SelectInput({
            class: 'select'
        });

        const overwriteRow = new Container({ class: 'row' });
        overwriteRow.append(overwriteLabel);
        overwriteRow.append(overwriteSelect);

        // title

        const titleLabel = new Label({ class: 'label' });
        i18n.bindText(titleLabel, 'popup.publish.title');
        const titleInput = new TextInput({ class: 'text-input' });
        const titleRow = new Container({ class: 'row' });
        titleRow.append(titleLabel);
        titleRow.append(titleInput);

        // description

        const descLabel = new Label({ class: 'label' });
        i18n.bindText(descLabel, 'popup.publish.description');
        const descInput = new TextAreaInput({ class: 'text-area' });
        const descRow = new Container({ class: 'row' });
        descRow.append(descLabel);
        descRow.append(descInput);

        // override model

        const overrideModelLabel = new Label({ class: 'label' });
        i18n.bindText(overrideModelLabel, 'popup.publish.override-model');
        const overrideModelToggle = new BooleanInput({ class: 'boolean', type: 'toggle', value: true });
        const overrideModelRow = new Container({ class: 'row', hidden: true });
        overrideModelRow.append(overrideModelLabel);
        overrideModelRow.append(overrideModelToggle);

        // override animation

        const overrideAnimationLabel = new Label({ class: 'label' });
        i18n.bindText(overrideAnimationLabel, 'popup.publish.override-animation');
        const overrideAnimationToggle = new BooleanInput({ class: 'boolean', type: 'toggle', value: true });
        const overrideAnimationRow = new Container({ class: 'row', hidden: true });
        overrideAnimationRow.append(overrideAnimationLabel);
        overrideAnimationRow.append(overrideAnimationToggle);

        // animation

        const animationLabel = new Label({ class: 'label' });
        i18n.bindText(animationLabel, 'popup.export.animation');
        const animationToggle = new BooleanInput({ class: 'boolean', type: 'toggle', value: false });
        const animationRow = new Container({ class: 'row' });
        animationRow.append(animationLabel);
        animationRow.append(animationToggle);

        // loop mode

        const loopLabel = new Label({ class: 'label' });
        i18n.bindText(loopLabel, 'popup.export.loop-mode');
        const loopSelect = new SelectInput({
            class: 'select',
            defaultValue: 'repeat'
        });
        i18n.bindOptions(loopSelect, () => [
            { v: 'none', t: i18n.t('popup.export.loop-mode.none') },
            { v: 'repeat', t: i18n.t('popup.export.loop-mode.repeat') },
            { v: 'pingpong', t: i18n.t('popup.export.loop-mode.pingpong') }
        ]);
        const loopRow = new Container({ class: 'row' });
        loopRow.append(loopLabel);
        loopRow.append(loopSelect);

        // background color

        const colorLabel = new Label({ class: 'label' });
        i18n.bindText(colorLabel, 'popup.export.background-color');
        const colorPicker = new ColorPicker({
            class: 'color-picker',
            value: [1, 1, 1, 1]
        });
        const colorRow = new Container({ class: 'row' });
        colorRow.append(colorLabel);
        colorRow.append(colorPicker);

        // generate LODs

        const generateLodsLabel = new Label({ class: 'label' });
        i18n.bindText(generateLodsLabel, 'popup.publish.generate-lods');
        const generateLodsToggle = new BooleanInput({ class: 'boolean', type: 'toggle', value: false });
        const generateLodsRow = new Container({ class: 'row' });
        generateLodsRow.append(generateLodsLabel);
        generateLodsRow.append(generateLodsToggle);

        // fov

        const fovLabel = new Label({ class: 'label' });
        i18n.bindText(fovLabel, 'popup.export.fov');
        const fovSlider = new SliderInput({
            class: 'slider',
            min: 10,
            max: 120,
            precision: 0,
            value: 60
        });
        const fovRow = new Container({ class: 'row' });
        fovRow.append(fovLabel);
        fovRow.append(fovSlider);

        // content

        const content = new Container({ id: 'content' });
        content.append(overwriteRow);
        content.append(titleRow);
        content.append(descRow);
        content.append(overrideModelRow);
        content.append(overrideAnimationRow);
        content.append(colorRow);
        content.append(fovRow);
        content.append(animationRow);
        content.append(loopRow);
        content.append(generateLodsRow);

        // footer

        const footer = new Container({ id: 'footer' });

        const cancelButton = new Button({
            class: 'button'
        });
        i18n.bindText(cancelButton, 'popup.publish.cancel');

        const okButton = new Button({
            class: 'button'
        });
        i18n.bindText(okButton, 'popup.publish.ok');

        footer.append(cancelButton);
        footer.append(okButton);

        dialog.append(header);
        dialog.append(content);
        dialog.append(footer);

        this.append(dialog);

        // handle key bindings for enter and escape

        let onCancel: () => void;
        let onOK: () => void;

        cancelButton.on('click', () => onCancel());
        okButton.on('click', () => onOK());

        const keydown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    onCancel();
                    break;
                case 'Enter':
                    if (!e.shiftKey && !okButton.disabled) onOK();
                    break;
                default:
                    e.stopPropagation();
                    break;
            }
        };

        let hasPosesState = false;

        const updateLayout = () => {
            const isNew = overwriteSelect.value === '0';
            const modelOn = overrideModelToggle.value;
            const animOn = overrideAnimationToggle.value;

            // new-scene vs existing-scene row visibility
            titleRow.hidden = !isNew;
            descRow.hidden = !isNew;
            colorRow.hidden = !isNew;
            fovRow.hidden = !isNew;
            animationRow.hidden = !isNew;
            overrideModelRow.hidden = isNew;
            overrideAnimationRow.hidden = isNew;
            // generateLods only matters when a model is uploaded — hide when republishing animation-only
            generateLodsRow.hidden = !isNew && !modelOn;

            if (isNew) {
                animationToggle.enabled = hasPosesState;
                loopRow.hidden = false;
                loopSelect.enabled = hasPosesState && animationToggle.value;
            } else {
                overrideAnimationToggle.enabled = hasPosesState;
                loopRow.hidden = false;
                loopSelect.enabled = animOn && hasPosesState;
            }

            // disable publish when existing scene with no overrides selected
            okButton.disabled = !isNew && !modelOn && !animOn;
        };

        overwriteSelect.on('change', updateLayout);
        overrideModelToggle.on('change', updateLayout);
        overrideAnimationToggle.on('change', updateLayout);
        animationToggle.on('change', updateLayout);

        // reset UI and configure for current state
        const reset = (hasPoses: boolean, overwriteList: string[]) => {
            hasPosesState = hasPoses;

            const splats = events.invoke('scene.splats');
            const filename = splats[0].filename;
            const dot = splats[0].filename.lastIndexOf('.');
            const bgClr = events.invoke('bgClr');
            const totalSplats = splats.reduce((sum: number, s: any) => sum + (s.numSplats ?? 0), 0);

            // union scene bounds to decide LOD default for large scenes
            const sceneMin = [Infinity, Infinity, Infinity];
            const sceneMax = [-Infinity, -Infinity, -Infinity];
            for (const s of splats) {
                const bound = s.worldBound;
                if (!bound) continue;
                const { center, halfExtents } = bound;
                const c = [center.x, center.y, center.z];
                const h = [halfExtents.x, halfExtents.y, halfExtents.z];
                for (let i = 0; i < 3; i++) {
                    sceneMin[i] = Math.min(sceneMin[i], c[i] - h[i]);
                    sceneMax[i] = Math.max(sceneMax[i], c[i] + h[i]);
                }
            }
            const largeAxes = [0, 1, 2].filter(i => sceneMax[i] - sceneMin[i] > 16).length;
            const isLargeScene = largeAxes >= 2;

            overwriteSelect.options = [{
                v: '0', t: i18n.t('popup.publish.new-scene')
            }].concat(overwriteList.map((s, i) => ({ v: (i + 1).toString(), t: s })));

            overwriteSelect.value = '0';
            titleInput.value = filename.slice(0, dot > 0 ? dot : undefined);
            descInput.value = '';
            overrideModelToggle.value = true;
            overrideAnimationToggle.value = hasPoses;
            animationToggle.value = hasPoses;
            loopSelect.value = 'repeat';
            colorPicker.value = [bgClr.r, bgClr.g, bgClr.b];
            fovSlider.value = events.invoke('camera.fov');
            generateLodsToggle.value = totalSplats >= 1_000_000 && isLargeScene;

            updateLayout();
        };

        // function implementations

        this.show = (userStatus: UserStatus) => {
            const frames = events.invoke('timeline.frames');
            const frameRate = events.invoke('timeline.frameRate');
            const smoothness = events.invoke('timeline.smoothness');

            // get poses
            const orderedPoses = (events.invoke('camera.poses') as Pose[])
            .slice()
            .filter(p => p.frame >= 0 && p.frame < frames)
            .sort((a, b) => a.frame - b.frame);

            // overwrite options
            const overwriteList = userStatus.scenes.map((s) => {
                return `${s.hash} - ${s.title}`;
            });

            // reset UI
            reset(orderedPoses.length > 0, overwriteList);

            this.hidden = false;
            this.dom.addEventListener('keydown', keydown);
            this.dom.focus();

            return new Promise<PublishSettings>((resolve) => {
                onCancel = () => {
                    resolve(null);
                };

                onOK = () => {
                    const isNew = overwriteSelect.value === '0';
                    const selectedScene = !isNew ? userStatus.scenes[parseInt(overwriteSelect.value, 10) - 1] : null;

                    // extract camera animation
                    const includeAnimation = isNew ? animationToggle.value : overrideAnimationToggle.value;
                    const animTracks: AnimTrack[] = [];

                    if (includeAnimation && orderedPoses.length > 0) {
                        const times: number[] = [];
                        const position: number[] = [];
                        const target: number[] = [];
                        const fovKeys: number[] = [];
                        for (let i = 0; i < orderedPoses.length; ++i) {
                            const op = orderedPoses[i];
                            times.push(op.frame);
                            position.push(op.position.x, op.position.y, op.position.z);
                            target.push(op.target.x, op.target.y, op.target.z);
                            fovKeys.push(op.fov);
                        }

                        animTracks.push({
                            name: 'cameraAnim',
                            duration: frames / frameRate,
                            frameRate,
                            loopMode: loopSelect.value as 'none' | 'repeat' | 'pingpong',
                            interpolation: 'spline',
                            smoothness,
                            keyframes: {
                                times,
                                values: { position, target, fov: fovKeys }
                            }
                        });
                    }

                    const fov = fovSlider.value;
                    const bgColor = colorPicker.value.slice(0, 3) as [number, number, number];

                    // use current viewport as start pose
                    const pose = events.invoke('camera.getPose');
                    const p = pose?.position;
                    const t = pose?.target;
                    const cameras = (p && t) ? [{
                        initial: {
                            position: [p.x, p.y, p.z] as [number, number, number],
                            target: [t.x, t.y, t.z] as [number, number, number],
                            fov
                        }
                    }] : [];

                    const experienceSettings: ExperienceSettings = {
                        version: 2,
                        tonemapping: 'none',
                        highPrecisionRendering: false,
                        background: { color: bgColor },
                        postEffectSettings: defaultPostEffectSettings,
                        animTracks,
                        cameras,
                        annotations: [],
                        startMode: includeAnimation ? 'animTrack' : 'default'
                    };

                    const serializeSettings = {
                        maxSHBands: 3,
                        minOpacity: 1 / 255,
                        removeInvalid: true
                    };

                    resolve({
                        user: userStatus.user,
                        title: titleInput.value,
                        description: descInput.value,
                        listed: false,
                        serializeSettings,
                        experienceSettings,
                        overwriteHash: selectedScene?.hash,
                        overrideModel: isNew || overrideModelToggle.value,
                        overrideAnimation: !isNew && overrideAnimationToggle.value,
                        generateLods: generateLodsToggle.value
                    });
                };
            }).finally(() => {
                this.dom.removeEventListener('keydown', keydown);
                this.hide();
            });
        };

        this.hide = () => {
            this.hidden = true;
        };

        this.destroy = () => {
            this.hide();
            super.destroy();
        };
    }
}

export { PublishSettingsDialog };
