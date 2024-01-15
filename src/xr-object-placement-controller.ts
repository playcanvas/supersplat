import {
    XRSPACE_LOCAL,
    XRSPACE_VIEWER,
    XRTRACKABLE_POINT,
    XRTRACKABLE_PLANE,
    XRTRACKABLE_MESH,
    XRTYPE_AR,
    BoundingBox,
    Entity,
    EventHandler,
    Vec3,
    XrHitTestSource,
    XrManager
} from 'playcanvas';

const vec = new Vec3();
const vec2 = new Vec3();
const translation = new Vec3();
const forward = new Vec3();

// modulo dealing with negative numbers
const mod = (n: number, m: number) => ((n % m) + m) % m;

// create an invisible dom element for capturing pointer input
// rotate the model with two finger tap and twist
const createRotateInput = (controller: XRObjectPlacementController) => {
    const touches: Map<
        number,
        {
            start: {x: number; y: number};
            previous: {x: number; y: number};
            current: {x: number; y: number};
        }
    > = new Map();
    let baseAngle = 0;
    let angle = 0;

    const eventDefault = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const onPointerDown = (e: PointerEvent) => {
        eventDefault(e);

        touches.set(e.pointerId, {
            start: {x: e.clientX, y: e.clientY},
            previous: {x: e.clientX, y: e.clientY},
            current: {x: e.clientX, y: e.clientY}
        });

        if (controller.rotating) {
            if (touches.size === 1) {
                controller.rotating = false;
            }
        } else {
            controller.rotating = touches.size > 1;
        }
    };

    const onPointerMove = (e: PointerEvent) => {
        eventDefault(e);

        const touch = touches.get(e.pointerId);
        if (touch) {
            touch.previous.x = touch.current.x;
            touch.previous.y = touch.current.y;
            touch.current.x = e.clientX;
            touch.current.y = e.clientY;
        }

        if (touches.size === 2) {
            const ids = Array.from(touches.keys());
            const a = touches.get(ids[0]);
            const b = touches.get(ids[1]);

            const initialAngle = Math.atan2(b.start.y - a.start.y, b.start.x - a.start.x);
            const currentAngle = Math.atan2(b.current.y - a.current.y, b.current.x - a.current.x);
            angle = currentAngle - initialAngle;

            controller.events.fire('xr:rotate', ((baseAngle + angle) * -180) / Math.PI);
        }
    };

    const onPointerUp = (e: PointerEvent) => {
        eventDefault(e);

        if (touches.size === 2) {
            baseAngle += angle;
        }

        touches.delete(e.pointerId);
    };

    const dom = document.createElement('div');
    dom.style.position = 'fixed';
    dom.style.top = '0';
    dom.style.left = '0';
    dom.style.width = '100%';
    dom.style.height = '100%';
    dom.style.touchAction = 'none';
    dom.style.display = 'none';
    document.body.appendChild(dom);

    controller.events.on('xr:started', () => {
        dom.style.display = 'block';
        dom.addEventListener('pointerdown', onPointerDown);
        dom.addEventListener('pointermove', onPointerMove);
        dom.addEventListener('pointerup', onPointerUp);
    });

    controller.events.on('xr:ended', () => {
        dom.style.display = 'none';
        dom.removeEventListener('pointerdown', onPointerDown);
        dom.removeEventListener('pointermove', onPointerMove);
        dom.removeEventListener('pointerup', onPointerUp);
    });

    return dom;
};

// create a dom element and controller for launching and exiting xr mode
const createUI = (controller: XRObjectPlacementController) => {
    const dom = document.createElement('img');
    dom.src = controller.options.startArImgSrc;
    dom.style.position = 'fixed';
    dom.style.right = '20px';
    dom.style.bottom = '20px';
    dom.style.width = '40px';
    dom.style.height = '40px';
    dom.style.opacity = '100%';
    dom.style.display = 'block';
    document.body.appendChild(dom);

    // disable button during xr mode transitions
    let enabled = true;

    controller.events.on('xr:started', () => {
        enabled = true;
        dom.src = controller.options.stopArImgSrc;
        controller.options.xr.domOverlay.root.appendChild(dom);
    });

    controller.events.on('xr:ended', () => {
        enabled = true;
        dom.src = controller.options.startArImgSrc;
        document.body.appendChild(dom);
    });

    dom.addEventListener('click', () => {
        if (enabled) {
            enabled = false;
            if (controller.active) {
                controller.end();
            } else {
                controller.start();
            }
        }
    });
};

type TweenValue = {[key: string]: number};

// helper tween class
class Tween {
    value: TweenValue;
    source: TweenValue;
    target: TweenValue;
    timer = 0;
    transitionTime = 0;

    constructor(value: any) {
        this.value = value;
        this.source = {...value};
        this.target = {...value};
    }

    goto(target: any, transitionTime = 0.25) {
        if (transitionTime === 0) {
            Tween.copy(this.value, target);
        }
        Tween.copy(this.source, this.value);
        Tween.copy(this.target, target);
        this.timer = 0;
        this.transitionTime = transitionTime;
    }

    update(deltaTime: number) {
        if (this.timer < this.transitionTime) {
            this.timer = Math.min(this.timer + deltaTime, this.transitionTime);
            Tween.lerp(this.value, this.source, this.target, Tween.quintic(this.timer / this.transitionTime));
        } else {
            Tween.copy(this.value, this.target);
        }
    }

    static quintic(n: number) {
        return Math.pow(n - 1, 5) + 1;
    }

    static copy(target: any, source: any) {
        Object.keys(target).forEach((key: string) => {
            target[key] = source[key];
        });
    }

    static lerp(target: any, a: any, b: any, t: number) {
        Object.keys(target).forEach((key: string) => {
            target[key] = a[key] + t * (b[key] - a[key]);
        });
    }
}

// register for callback events from the xr manager to smoothly transition and move the model
const createModelHandler = (controller: XRObjectPlacementController) => {
    const xr = controller.options.xr;
    const events = controller.events;

    const pos = new Tween({x: 0, y: 0, z: 0});
    const rot = new Tween({x: 0, y: 0, z: 0});
    const scale = new Tween({scale: 1});
    const lerpSpeed = 0.25;

    let hovering = true;
    let hoverPos = new Vec3();

    events.on('xr:start', () => {
        hovering = true;

        const halfExtents = controller.options.contentBound.halfExtents;
        hoverPos.set(0, -halfExtents.y, -halfExtents.length() * 4);
    });

    events.on('xr:initial-place', (position: Vec3) => {
        // @ts-ignore
        const mat = xr.views.list[0]._viewInvMat;
        mat.transformPoint(hoverPos, vec);
        mat.getEulerAngles(vec2);
        pos.goto({x: vec.x, y: vec.y, z: vec.z}, 0);
        rot.goto({x: vec2.x, y: vec2.y, z: vec2.z}, 0);
        scale.goto({scale: 1}, 0);

        rot.goto({x: 0, y: 0, z: 0}, lerpSpeed);
        pos.goto({x: position.x, y: position.y, z: position.z}, lerpSpeed);
        hovering = false;
    });

    events.on('xr:place', (position: Vec3) => {
        pos.goto({x: position.x, y: position.y, z: position.z}, lerpSpeed);
    });

    events.on('xr:rotate', (angle: number) => {
        angle = mod(angle, 360);
        rot.goto({x: 0, y: angle, z: 0}, lerpSpeed);
        // wrap source rotation to be within -180...180 degrees of target
        rot.source.y = angle - 180 + mod(rot.source.y - angle + 180, 360);
    });

    events.on('xr:ended', () => {
        controller.options.content.setLocalPosition(0, 0, 0);
        controller.options.content.setLocalEulerAngles(0, 0, 0);
    });

    xr.app.on('frameupdate', (ms: number) => {
        const dt = ms / 1000;
        pos.update(dt);
        rot.update(dt);
        scale.update(dt);
    });

    xr.on('update', (frame: any) => {
        const xr = controller.options.xr;

        // @ts-ignore
        if (!xr.views.list.length) {
            return;
        }

        // @ts-ignore
        const mat = xr.views.list[0]._viewInvMat;
        const contentRoot = controller.options.content;

        if (hovering) {
            mat.transformPoint(hoverPos, vec);
            mat.getEulerAngles(vec2);

            contentRoot.setLocalPosition(vec.x, vec.y, vec.z);
            contentRoot.setLocalEulerAngles(vec2.x, vec2.y, vec2.z);
            contentRoot.setLocalScale(1, 1, 1);
        } else {
            contentRoot.setLocalPosition(pos.value.x, pos.value.y, pos.value.z);
            contentRoot.setLocalEulerAngles(rot.value.x, rot.value.y, rot.value.z);
            contentRoot.setLocalScale(scale.value.scale, scale.value.scale, scale.value.scale);
        }

        // update clipping planes
        const bound = controller.options.contentBound;
        const boundCenter = bound.center;
        const boundRadius = bound.halfExtents.length();

        mat.getZ(forward);
        mat.getTranslation(translation).sub(boundCenter);
        const dist = translation.dot(forward);

        const far = dist + boundRadius;
        const near = Math.max(0.001, dist < boundRadius ? far / 1024 : dist - boundRadius);

        // @ts-ignore
        xr._setClipPlanes(near / 2, far * 2);

        controller.events.fire('xr:update');
    });
};

interface XRObjectPlacementOptions {
    xr: XrManager;
    camera: Entity;
    content: Entity;
    contentBound: BoundingBox;
    showUI: boolean;
    startArImgSrc: any;
    stopArImgSrc: any;
}

class XRObjectPlacementController {
    options: XRObjectPlacementOptions;
    dom: HTMLDivElement;
    events = new EventHandler();
    active = false;
    rotating = false;

    constructor(options: XRObjectPlacementOptions) {
        this.options = options;

        const xr = options.xr;

        // create the rotation controller
        xr.domOverlay.root = createRotateInput(this);

        // create dom
        if (this.options.showUI) {
            createUI(this);
        }

        createModelHandler(this);

        // perform an asynchronous ray interesection test given a view-space ray
        // returns a handle used to cancel the hit test
        const hitTest = (resultCallback: (position: Vec3) => void) => {
            xr.hitTest.start({
                spaceType: XRSPACE_VIEWER,
                entityTypes: [XRTRACKABLE_POINT, XRTRACKABLE_PLANE, XRTRACKABLE_MESH],
                callback: (err: Error | null, hitTestSource: XrHitTestSource) => {
                    if (err) {
                        console.log(err);
                    } else {
                        hitTestSource.on('result', (position: Vec3) => {
                            resultCallback(position);
                            hitTestSource.remove();
                        });
                    }
                }
            });
        };

        // handle xr mode availability change
        xr.on('available:' + XRTYPE_AR, (available: boolean) => {
            this.events.fire('xr:available', available);
        });

        // handle xr mode starting
        xr.on('start', () => {
            this.active = true;
            this.events.fire('xr:started');

            // initial placement hit test
            hitTest((position: Vec3) => {
                this.events.fire('xr:initial-place', position);

                // vibrate on initial placement
                navigator?.vibrate(10);

                // register for touchscreen hit test
                xr.hitTest.start({
                    profile: 'generic-touchscreen',
                    entityTypes: [XRTRACKABLE_POINT, XRTRACKABLE_PLANE, XRTRACKABLE_MESH],
                    callback: (err: Error | null, hitTestSource: XrHitTestSource) => {
                        if (err) {
                            console.log(err);
                        } else {
                            hitTestSource.on('result', (position: Vec3) => {
                                if (!this.rotating) {
                                    this.events.fire('xr:place', position);
                                }
                            });
                        }
                    }
                });
            });
        });

        // handle xr mode ending
        xr.on('end', () => {
            this.active = false;
            this.events.fire('xr:ended');
        });
    }

    get available() {
        return this.options.xr.isAvailable(XRTYPE_AR);
    }

    // request to start the xr session
    start() {
        if (!this.available || this.active) {
            return;
        }
        this.events.fire('xr:start');
        this.options.xr.start(this.options.camera.camera, XRTYPE_AR, XRSPACE_LOCAL, {
            callback: (err: Error | null) => {
                if (err) {
                    console.log(err);
                }
            }
        });
    }

    // end the ar session
    end() {
        this.options.xr.end();
    }
}

export {XRObjectPlacementController};
