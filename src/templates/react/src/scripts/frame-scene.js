import { Script, BoundingBox, Vec3 } from 'playcanvas'

class FrameScene extends Script {

    resetPosition = null;
    resetTarget = null;

    frameScene(bbox) {
        const sceneSize = bbox.halfExtents.length();
        const distance = sceneSize / Math.sin(this.entity.camera.fov / 180 * Math.PI * 0.5);
        this.entity.script.cameraControls.sceneSize = sceneSize;
        this.entity.script.cameraControls.focus(bbox.center, new Vec3(2, 1, 2).normalize().mulScalar(distance).add(bbox.center));
    }

    resetCamera(bbox) {
        const sceneSize = bbox.halfExtents.length();
        this.entity.script.cameraControls.sceneSize = sceneSize * 0.2;
        this.entity.script.cameraControls.focus(this.resetTarget ?? Vec3.ZERO, this.resetPosition ?? new Vec3(2, 1, 2));
    }

    calcBound() {
        const gsplatComponents = this.app.root.findComponents('gsplat');
        return gsplatComponents?.[0]?.instance?.meshInstance?.aabb ?? new BoundingBox();
    }

    initCamara() {

        const bbox = this.calcBound();

        // configure camera
        this.entity.camera.horizontalFov = true;
        this.entity.camera.farClip = bbox.halfExtents.length() * 20;
        this.entity.camera.nearClip = this.entity.camera.farClip * 0.001;
        // set NONE tonemapping until https://github.com/playcanvas/engine/pull/7179 is deployed
        this.entity.camera.toneMapping = 6;

        if (bbox.halfExtents.length() > 100 || this.resetPosition || this.resetTarget) {
            this.resetCamera(bbox);
        } else {
            this.frameScene(bbox);
        }

        window.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'f':
                    this.frameScene(bbox);
                    break;
                case 'r':
                    this.resetCamera(bbox);
                    break;
            }
        });
    }

    postInitialize() {
        const assets = this.app.assets.filter(asset => asset.type === 'gsplat');
        if (assets.length > 0) {
            const asset = assets[0];
            if (asset.loaded) {
                this.initCamara();
            } else {
                asset.on('load', () => {
                    this.initCamara();
                });
            }
        }
    }
}

export default FrameScene;