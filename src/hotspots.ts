import {Vec3, math} from 'playcanvas';
import {Element, ElementType} from './element';
// @ts-ignore
import hotspotImage from './svg/hotspot.svg';

interface HotSpot {
    name: string;
    position: Vec3;
    dom: HTMLElement;
    visible: boolean;
    opacity: number;
}

const vec1 = new Vec3();
const vec2 = new Vec3();
const vec3 = new Vec3();

class HotSpots extends Element {
    hotSpots: HotSpot[] = [];
    parentDom: HTMLElement;
    visible = true;
    hiddenAzim = 0;
    hiddenElev = 0;

    constructor() {
        super(ElementType.hotspots);
        this.parentDom = document.createElement('div');
        this.parentDom.style.position = 'absolute';
        this.parentDom.style.left = '0px';
        this.parentDom.style.top = '0px';
        this.parentDom.style.width = '100%';
        this.parentDom.style.height = '100%';
        this.parentDom.style.pointerEvents = 'none';
    }

    destroy() {
        super.destroy();
    }

    addHotSpot(name: string, x: number, y: number, z: number) {
        const idx = this.hotSpots.length;
        const dom = document.createElement('img');
        dom.src = hotspotImage.src;
        dom.style.position = 'absolute';
        dom.style.cursor = 'pointer';
        dom.style.width = '6.5vw';
        dom.style.height = '6.5vw';
        dom.style.transform = 'translate(-50%, -50%)';
        dom.style.userSelect = 'none';
        dom.style.pointerEvents = 'auto';

        // @ts-ignore
        dom.style['-webkit-user-select'] = 'none';
        // @ts-ignore
        dom.style['user-drag'] = 'none';
        // @ts-ignore
        dom.style['-webkit-user-drag'] = 'none';
        // @ts-ignore
        dom.style['user-select'] = 'none';
        // @ts-ignore
        dom.style['-moz-user-select'] = 'none';
        // @ts-ignore
        dom.style['-webkit-user-select'] = 'none';
        // @ts-ignore
        dom.style['-ms-user-select'] = 'none';

        this.parentDom.appendChild(dom);

        const hotSpot = {
            name: name,
            position: new Vec3(x, y, z),
            dom: dom,
            visible: false,
            opacity: 0
        };

        this.hotSpots.push(hotSpot);

        dom.onclick = (/* ev */) => {
            const camera = this.scene.camera;
            vec1.sub2(camera.focalPoint, hotSpot.position).mulScalar(2.0);
            camera.setOrientation(vec1, 6.0);
            this.visible = false;
            this.hiddenAzim = camera.azim;
            this.hiddenElev = camera.elevation;
        };

        return idx;
    }

    hideAll() {
        this.hotSpots.forEach(hotspot => {
            hotspot.visible = false;
        });
    }

    showAll() {
        this.hotSpots.forEach(hotspot => {
            hotspot.visible = true;
        });
    }

    removeHotSpot() {
        // TODO
    }

    add() {
        document.getElementById('app-container').appendChild(this.parentDom);
    }

    remove() {
        document.getElementById('app-container').removeChild(this.parentDom);
    }

    onPreRender() {
        const camera = this.scene.camera;
        // re-enable hotspots when camera orbits far enough from the hidden orientation
        if (!this.visible) {
            const azim = this.hiddenAzim - camera.azim;
            const elev = this.hiddenElev - camera.elevation;
            if (Math.sqrt(azim * azim + elev * elev) > 20) {
                this.visible = true;
            }
        }

        // update hotspot visibility based on angle to camera
        const displayAngle = Math.cos(110 * math.DEG_TO_RAD);
        const cameraPosition = camera.entity.getPosition();
        vec2.set(cameraPosition.x, 0, cameraPosition.z).normalize();
        this.hotSpots.forEach(hotSpot => {
            camera.worldToScreen(hotSpot.position, vec1);
            if (vec1.z > -1) {
                hotSpot.dom.style.left = `${vec1.x}px`;
                hotSpot.dom.style.top = `${vec1.y}px`;

                vec3.set(hotSpot.position.x, 0, hotSpot.position.z).normalize();
                hotSpot.visible = vec2.dot(vec3) > displayAngle;
            } else {
                hotSpot.visible = false;
            }
        });
    }

    onUpdate(deltaTime: number) {
        this.hotSpots.forEach(hotspot => {
            // update opacity based on visibility
            const target = this.visible && hotspot.visible ? 1 : 0;
            let opacity = hotspot.opacity;
            if (target > opacity) {
                opacity = Math.min(opacity + deltaTime * 2, target);
            } else if (target < hotspot.opacity) {
                opacity = Math.max(opacity - deltaTime * 2, target);
            }
            hotspot.dom.style.opacity = opacity.toFixed(2);
            hotspot.dom.style.pointerEvents = target ? 'auto' : 'none';
            hotspot.opacity = opacity;
        });
    }
}

export {HotSpots};
