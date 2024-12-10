import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_R8,
    PIXELFORMAT_R16U,
    Asset,
    BoundingBox,
    Color,
    Entity,
    GSplatData,
    GSplatResource,
    Mat4,
    Quat,
    Texture,
    Vec3,
    MeshInstance
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader, gsplatCenter } from './shaders/splat-shader';
import { State } from './splat-state';
import { TransformPalette } from './transform-palette';

const vec = new Vec3();
const veca = new Vec3();
const vecb = new Vec3();

const boundingPoints =
    [-1, 1].map((x) => {
        return [-1, 1].map((y) => {
            return [-1, 1].map((z) => {
                return [
                    new Vec3(x, y, z), new Vec3(x * 0.75, y, z),
                    new Vec3(x, y, z), new Vec3(x, y * 0.75, z),
                    new Vec3(x, y, z), new Vec3(x, y, z * 0.75)
                ];
            });
        });
    }).flat(3);

class Splat extends Element {
    asset: Asset;
    splatData: GSplatData;
    numSplats = 0;
    numDeleted = 0;
    numHidden = 0;
    numSelected = 0;
    entity: Entity;
    changedCounter = 0;
    stateTexture: Texture;
    transformTexture: Texture;
    selectionBoundStorage: BoundingBox;
    localBoundStorage: BoundingBox;
    worldBoundStorage: BoundingBox;
    selectionBoundDirty = true;
    localBoundDirty = true;
    worldBoundDirty = true;
    _visible = true;
    transformPalette: TransformPalette;

    selectionAlpha = 1;

    _tintClr = new Color(1, 1, 1);
    _brightness = 0;
    _blackPoint = 0;
    _whitePoint = 1;
    _transparency = 1;

    rebuildMaterial: (bands: number) => void;

    constructor(asset: Asset) {
        super(ElementType.splat);

        const splatResource = asset.resource as GSplatResource;
        const splatData = splatResource.splatData;

        // get material options object for a shader that renders with the given number of bands
        const materialOptions = {
            vertex: vertexShader,
            fragment: fragmentShader,
            chunks: { gsplatCenterVS: gsplatCenter }
        };

        this.asset = asset;
        this.splatData = splatData;
        this.numSplats = splatData.numSplats;
        this.entity = splatResource.instantiate(materialOptions);

        const instance = this.entity.gsplat.instance;

        // use custom render order distance calculation for splats
        instance.meshInstance.calculateSortDistance = (meshInstance: MeshInstance, pos: Vec3, dir: Vec3) => {
            const bound = this.localBound;
            const mat = this.entity.getWorldTransform();
            let maxDist;
            for (let i = 0; i < 8; ++i) {
                vec.x = bound.center.x + bound.halfExtents.x * (i & 1 ? 1 : -1);
                vec.y = bound.center.y + bound.halfExtents.y * (i & 2 ? 1 : -1);
                vec.z = bound.center.z + bound.halfExtents.z * (i & 4 ? 1 : -1);
                mat.transformPoint(vec, vec);
                const dist = vec.sub(pos).dot(dir);
                if (i === 0 || dist > maxDist) {
                    maxDist = dist;
                }
            }
            return maxDist;
        };

        // added per-splat state channel
        // bit 1: selected
        // bit 2: deleted
        // bit 3: hidden
        this.splatData.addProp('state', new Uint8Array(this.splatData.numSplats));

        // per-splat transform matrix
        this.splatData.addProp('transform', new Uint16Array(this.splatData.numSplats));

        const { width, height } = instance.splat.colorTexture;

        // pack spherical harmonic data
        const createTexture = (name: string, format: number) => {
            return new Texture(splatResource.device, {
                name: name,
                width: width,
                height: height,
                format: format,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        // create the state texture
        this.stateTexture = createTexture('splatState', PIXELFORMAT_R8);
        this.transformTexture = createTexture('splatTransform', PIXELFORMAT_R16U);

        // create the transform palette
        this.transformPalette = new TransformPalette(splatResource.device);

        this.rebuildMaterial = (bands: number) => {
            // @ts-ignore
            instance.createMaterial(materialOptions);

            const material = instance.material;

            const numBands = instance.splat.hasSH ? bands : 0;
            material.setDefine('SH_BANDS', `${numBands}`);
            material.setParameter('splatState', this.stateTexture);
            material.setParameter('splatTransform', this.transformTexture);
            material.setParameter('transformPalette', this.transformPalette.texture);
            material.update();
        };

        this.selectionBoundStorage = new BoundingBox();
        this.localBoundStorage = instance.splat.aabb;
        // @ts-ignore
        this.worldBoundStorage = instance.meshInstance._aabb;

        // @ts-ignore
        instance.meshInstance._updateAabb = false;

        // when sort changes, re-render the scene
        instance.sorter.on('updated', () => {
            this.changedCounter++;
        });
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
    }

    updateState(changedState = State.selected) {
        const state = this.splatData.getProp('state') as Uint8Array;

        // write state data to gpu texture
        const data = this.stateTexture.lock();
        data.set(state);
        this.stateTexture.unlock();

        let numSelected = 0;
        let numHidden = 0;
        let numDeleted = 0;

        for (let i = 0; i < state.length; ++i) {
            const s = state[i];
            if (s & State.deleted) {
                numDeleted++;
            } else if (s & State.hidden) {
                numHidden++;
            } else if (s & State.selected) {
                numSelected++;
            }
        }

        this.numSplats = state.length - numDeleted;
        this.numHidden = numHidden;
        this.numSelected = numSelected;
        this.numDeleted = numDeleted;

        this.makeSelectionBoundDirty();

        // handle splats being added or removed
        if (changedState & State.deleted) {
            this.updateSorting();
        }

        this.scene.forceRender = true;
        this.scene.events.fire('splat.stateChanged', this);
    }

    updatePositions() {
        const data = this.scene.dataProcessor.calcPositions(this);

        // update the splat centers which are used for render-time sorting
        const state = this.splatData.getProp('state') as Uint8Array;
        const { sorter } = this.entity.gsplat.instance;
        const { centers } = sorter;
        for (let i = 0; i < this.splatData.numSplats; ++i) {
            if (state[i] === State.selected) {
                centers[i * 3 + 0] = data[i * 4];
                centers[i * 3 + 1] = data[i * 4 + 1];
                centers[i * 3 + 2] = data[i * 4 + 2];
            }
        }

        this.updateSorting();

        this.scene.forceRender = true;
        this.scene.events.fire('splat.positionsChanged', this);
    }

    updateSorting() {
        const state = this.splatData.getProp('state') as Uint8Array;

        this.makeLocalBoundDirty();

        let mapping;

        // create a sorter mapping to remove deleted splats
        if (this.numSplats !== state.length) {
            mapping = new Uint32Array(this.numSplats);
            let idx = 0;
            for (let i = 0; i < state.length; ++i) {
                if ((state[i] & State.deleted) === 0) {
                    mapping[idx++] = i;
                }
            }
        }

        // update sorting instance
        this.entity.gsplat.instance.sorter.setMapping(mapping);
    }

    get worldTransform() {
        return this.entity.getWorldTransform();
    }

    get filename() {
        return this.asset.file.filename;
    }

    calcSplatWorldPosition(splatId: number, result: Vec3) {
        if (splatId >= this.splatData.numSplats) {
            return false;
        }

        // use centers data, which are updated when edits occur
        const { sorter } = this.entity.gsplat.instance;
        const { centers } = sorter;

        result.set(
            centers[splatId * 3 + 0],
            centers[splatId * 3 + 1],
            centers[splatId * 3 + 2]
        );

        this.worldTransform.transformPoint(result, result);

        return true;
    }

    add() {
        this.entity.gsplat.layers = this.entity.gsplat.layers.concat([this.scene.overlayLayer.id]);

        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        this.makeSelectionBoundDirty();

        this.scene.events.on('view.bands', this.rebuildMaterial, this);
        this.rebuildMaterial(this.scene.events.invoke('view.bands'));
    }

    remove() {
        this.scene.events.off('view.bands', this.rebuildMaterial, this);

        this.scene.contentRoot.removeChild(this.entity);
        this.scene.boundDirty = true;
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.changedCounter);
        serializer.pack(this.visible);
        serializer.pack(this.tintClr.r, this.tintClr.g, this.tintClr.b);
        serializer.pack(this.brightness, this.blackPoint, this.whitePoint, this.transparency);
    }

    onPreRender() {
        const events = this.scene.events;
        const selected = events.invoke('selection') === this;
        const cameraMode = events.invoke('camera.mode');
        const cameraOverlay = events.invoke('camera.overlay');

        // configure rings rendering
        const material = this.entity.gsplat.instance.material;
        material.setParameter('mode', cameraMode === 'rings' ? 1 : 0);
        material.setParameter('ringSize', (selected && cameraOverlay && cameraMode === 'rings') ? 0.04 : 0);

        const selectionAlpha = events.invoke('view.outlineSelection') ? 0 : this.selectionAlpha;

        // configure colors
        const selectedClr = events.invoke('selectedClr');
        const unselectedClr = events.invoke('unselectedClr');
        const lockedClr = events.invoke('lockedClr');
        material.setParameter('selectedClr', [selectedClr.r, selectedClr.g, selectedClr.b, selectedClr.a * selectionAlpha]);
        material.setParameter('unselectedClr', [unselectedClr.r, unselectedClr.g, unselectedClr.b, unselectedClr.a]);
        material.setParameter('lockedClr', [lockedClr.r, lockedClr.g, lockedClr.b, lockedClr.a]);

        // combine black pointer, white point and brightness
        const offset = -this.blackPoint + this.brightness;
        const scale = 1 / (this.whitePoint - this.blackPoint);

        material.setParameter('clrOffset', [offset, offset, offset]);
        material.setParameter('clrScale', [
            this.tintClr.r * scale,
            this.tintClr.g * scale,
            this.tintClr.b * scale,
            this.transparency
        ]);

        if (this.visible && selected) {
            // render bounding box
            if (events.invoke('camera.bound')) {
                const bound = this.localBound;
                const scale = new Mat4().setTRS(bound.center, Quat.IDENTITY, bound.halfExtents);
                scale.mul2(this.entity.getWorldTransform(), scale);

                for (let i = 0; i < boundingPoints.length / 2; i++) {
                    const a = boundingPoints[i * 2];
                    const b = boundingPoints[i * 2 + 1];
                    scale.transformPoint(a, veca);
                    scale.transformPoint(b, vecb);

                    this.scene.app.drawLine(veca, vecb, Color.WHITE, true, this.scene.debugLayer);
                }
            }
        }

        this.entity.enabled = this.visible;
    }

    focalPoint() {
        return this.asset.resource?.getFocalPoint?.();
    }

    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        const entity = this.entity;
        if (position) {
            entity.setLocalPosition(position);
        }
        if (rotation) {
            entity.setLocalRotation(rotation);
        }
        if (scale) {
            entity.setLocalScale(scale);
        }

        this.makeWorldBoundDirty();

        this.scene.events.fire('splat.moved', this);
    }

    makeSelectionBoundDirty() {
        this.selectionBoundDirty = true;
        this.makeLocalBoundDirty();
    }

    makeLocalBoundDirty() {
        this.localBoundDirty = true;
        this.makeWorldBoundDirty();
    }

    makeWorldBoundDirty() {
        this.worldBoundDirty = true;
        this.scene.boundDirty = true;
    }

    // get the selection bound
    get selectionBound() {
        const selectionBound = this.selectionBoundStorage;
        if (this.selectionBoundDirty) {
            this.scene.dataProcessor.calcBound(this, selectionBound, true);
            this.selectionBoundDirty = false;
        }
        return selectionBound;
    }

    // get local space bound
    get localBound() {
        const localBound = this.localBoundStorage;
        if (this.localBoundDirty) {
            this.scene.dataProcessor.calcBound(this, localBound, false);
            this.localBoundDirty = false;
            this.entity.getWorldTransform().transformPoint(localBound.center, vec);
        }
        return localBound;
    }

    // get world space bound
    get worldBound() {
        const worldBound = this.worldBoundStorage;
        if (this.worldBoundDirty) {
            // calculate meshinstance aabb (transformed local bound)
            worldBound.setFromTransformedAabb(this.localBound, this.entity.getWorldTransform());

            // flag scene bound as dirty
            this.worldBoundDirty = false;
        }
        return worldBound;
    }

    set visible(value: boolean) {
        if (value !== this.visible) {
            this._visible = value;
            this.scene.events.fire('splat.visibility', this);
        }
    }

    get visible() {
        return this._visible;
    }

    set tintClr(value: Color) {
        if (!this._tintClr.equals(value)) {
            this._tintClr.set(value.r, value.g, value.b);
            this.scene.events.fire('splat.tintClr', this);
        }
    }

    get tintClr() {
        return this._tintClr;
    }

    set brightness(value: number) {
        if (value !== this._brightness) {
            this._brightness = value;
            this.scene.events.fire('splat.brightness', this);
        }
    }

    get brightness() {
        return this._brightness;
    }

    set blackPoint(value: number) {
        if (value !== this._blackPoint) {
            this._blackPoint = value;
            this.scene.events.fire('splat.blackPoint', this);
        }
    }

    get blackPoint() {
        return this._blackPoint;
    }

    set whitePoint(value: number) {
        if (value !== this._whitePoint) {
            this._whitePoint = value;
            this.scene.events.fire('splat.whitePoint', this);
        }
    }

    get whitePoint() {
        return this._whitePoint;
    }

    set transparency(value: number) {
        if (value !== this._transparency) {
            this._transparency = value;
            this.scene.events.fire('splat.transparency', this);
        }
    }

    get transparency() {
        return this._transparency;
    }
}

export { Splat };
