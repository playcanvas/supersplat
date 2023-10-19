import {Element, ElementType} from './element';
import {XRObjectPlacementController} from './xr-object-placement-controller';
import {Serializer} from './serializer';
// @ts-ignore
import arModeImage from './svg/ar-mode.svg';
// @ts-ignore
import arCloseImage from './svg/ar-close.svg';

class XRMode extends Element {
    frame = 0;

    constructor() {
        super(ElementType.other);
    }

    add() {
        const config = this.scene.config;
        const xr = this.scene.app.xr;

        // create the xr controller
        const controller = new XRObjectPlacementController({
            xr: xr,
            camera: this.scene.camera.entity,
            content: this.scene.contentRoot,
            contentBound: this.scene.bound,
            showUI: config.xr.showControls,
            startArImgSrc: arModeImage.src,
            stopArImgSrc: arCloseImage.src
        });

        const events = controller.events;

        events.on('xr:update', (frame: any) => {
            this.frame++;
        });

        events.on('xr:started', () => {
            if (this.scene.multiframe) {
                this.scene.multiframe.blend = 0.5;
            }
        });

        events.on('xr:initial-place', () => {
            if (this.scene.multiframe) {
                this.scene.multiframe.blend = 1.0;
            }
        });

        events.on('xr:ended', () => {
            if (this.scene.multiframe) {
                this.scene.multiframe.blend = 1.0;
            }
        });
    }

    remove() {
        // todo
    }

    serialize(serializer: Serializer): void {
        serializer.pack(this.frame);
    }
}

export {XRMode};
