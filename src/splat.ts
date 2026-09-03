import {
    Asset,
    BoundingBox,
    Color,
    Entity,
    Mat4,
    Quat,
    Vec3
} from 'playcanvas';

import { ColorGrade, createGradeTerms, gradeTerms } from './color-grade';
import { ColorPalette } from './color-palette';
import { EditorSplatResource } from './editor-splat-resource';
import { Element, ElementType } from './element';
import { GaussianInstances } from './gaussian-instances';
import { IndexRanges } from './index-ranges';
import { Serializer } from './serializer';
import { Transform } from './transform';
import { TransformPalette } from './transform-palette';

const vec = new Vec3();
const veca = new Vec3();
const vecb = new Vec3();
const quat = new Quat();

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
    resource: EditorSplatResource;
    numSplats = 0;
    numDeleted = 0;
    numLocked = 0;
    numSelected = 0;
    entity: Entity;
    changedCounter = 0;
    // the live edited data: one instance per rendered gaussian, referencing a
    // row of the immutable static resource. all per-gaussian writes go through
    // instances.setBits/clearBits/toggleBits/setTransformIndex, then flush().
    instances: GaussianInstances;
    selectionBoundStorage: BoundingBox;
    localBoundStorage: BoundingBox;
    worldBoundStorage: BoundingBox;

    _visible = true;
    transformPalette: TransformPalette;
    colorPalette: ColorPalette;

    selectionAlpha = 1;

    _name = '';

    measurePoints: Vec3[] = [];
    measureSelection = -1;

    orientPoints: Vec3[] = [];
    orientSelection = -1;

    // user-defined local frame (relative to the data frame), set from the
    // orient tool's picked plane: origin at the first picked point, rotation
    // aligning +y with the plane normal. the transform gizmos and panel use
    // it as the model's local coordinate space; the gaussian data is
    // unaffected. the defaults reproduce the entity's own frame
    localFrameOrigin = new Vec3();
    localFrame = new Quat();

    // `instances` creates a layer over a subset of an existing layer's instances,
    // sharing the asset's static data (duplicate / separate). Ownership of the
    // list transfers here. Omit it for a normal load, which takes every row.
    constructor(asset: Asset, rotation: Quat, instances?: GaussianInstances) {
        super(ElementType.splat);

        const { device } = asset.resource as EditorSplatResource;

        // create the entity once. its transform persists across frame swaps so
        // an animated sequence can replace its data without losing the user's
        // transform (see replaceData).
        this.entity = new Entity('splatEntity');

        this.selectionBoundStorage = new BoundingBox();

        // create the palettes (reused across frame swaps; entry 0 is the identity
        // transform / grade)
        this.transformPalette = new TransformPalette(device);
        this.colorPalette = new ColorPalette(device);

        // bind the initial frame's data, applying the file's load rotation
        this.bindAsset(asset, rotation, instances);
    }

    // bind a gsplat asset to this element: creates the per-splat state/transform
    // channels and their gpu textures. When `rotation` is supplied (initial load)
    // the entity rotation is set; on a frame swap it is omitted so the user's
    // transform is preserved.
    private bindAsset(asset: Asset, rotation?: Quat, instances?: GaussianInstances) {
        const splatResource = asset.resource as EditorSplatResource;
        const { device } = splatResource;

        this.asset = asset;
        this.resource = splatResource;
        this.numSplats = splatResource.numSplats;

        // this layer now depends on the static data staying loaded; released in
        // destroy() and when a sequence frame swap drops the old asset
        splatResource.acquire();

        // name and orientation are set on the initial bind only; a frame swap
        // (replaceData, no rotation) keeps the element's name and transform
        if (rotation) {
            this._name = (asset.file as any).filename;
            this.entity.setLocalRotation(rotation);
        }

        // a shared-data layer arrives with its instances already built; otherwise
        // build the identity list over this frame's rows, seeded with the state
        // column the file carried (if any)
        this.instances = instances ??
            new GaussianInstances(device, splatResource.numRows, splatResource.initialState);

        this.localBoundStorage = splatResource.aabb.clone();
        this.worldBoundStorage = new BoundingBox();
    }

    // wait for the next scene render to complete, with a safety timeout so a
    // stalled render loop (e.g. a backgrounded tab where rAF is paused) can't
    // block frame swapping forever. In a live app postrender fires within a
    // frame, so the timeout never matters.
    private waitForRender(): Promise<void> {
        return new Promise((resolve) => {
            // single finish() removes the listener and clears the timeout, so the
            // common case (postrender fires first) doesn't leave a pending timer.
            const handles: { off?: { off: () => void }, timer?: ReturnType<typeof setTimeout> } = {};
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                handles.off?.off();
                clearTimeout(handles.timer);
                resolve();
            };
            handles.off = this.scene.events.on('postrender', finish);
            // safety: don't block frame swapping forever if the render loop is stalled
            handles.timer = setTimeout(finish, 200);
        });
    }

    // swap in a new frame's gsplat data while preserving this element's identity,
    // transform and visual properties.
    async replaceData(asset: Asset) {
        const oldAsset = this.asset;
        const oldResource = this.resource;
        const oldInstances = this.instances;

        // no rotation: preserve the entity transform
        this.bindAsset(asset);

        // refresh gpu state/counts/bounds, then wait for the new frame to render.
        // Skip the wait during offline video render
        // (lockedRenderMode): renders are gated on scene.lockedRender there, so
        // blocking on a render would deadlock — and the render loop sorts+captures
        // each frame deterministically anyway.
        await this.updateState();
        if (!this.scene.lockedRenderMode) {
            await this.waitForRender();
        }

        // notify dependents to bind the new textures
        this.scene.events.fire('splat.replaced', this);

        // tear down the previous frame. Another layer may share the frame's static
        // data (it can be duplicated or separated out of a sequence), so only the
        // last layer to let go unloads it.
        oldInstances.destroy();
        if (oldResource.release()) {
            oldAsset.registry?.remove(oldAsset);
            oldAsset.unload();
        }

        this.changedCounter++;
        this.scene.forceRender = true;
    }

    destroy() {
        super.destroy();
        this.instances.destroy();
        this.transformPalette.destroy();
        this.colorPalette.destroy();
        this.entity.destroy();
        // layers can share static data, so the asset outlives this layer unless
        // this was the last reference to it
        if (this.resource.release()) {
            this.asset.registry.remove(this.asset);
            this.asset.unload();
        }
    }

    async updateState() {
        // uploads dirty ranges; counts are maintained by the mutators.
        this.instances.flush();
        this.numSplats = this.instances.count;
        this.numLocked = this.instances.numLocked;
        this.numSelected = this.instances.numSelected;
        this.numDeleted = this.instances.numRemoved;

        // an edit may have resized the list, which the renderer's placement caches
        this.scene.projectedSplatRenderer.replace(this);
        await this.updateLocalBounds();

        this.scene.forceRender = true;
        this.scene.events.fire('splat.stateChanged', this);
    }

    // colour palette index edits: like updatePositions but no bounds to recompute,
    // so nothing here needs awaiting
    updateColors() {
        this.instances.flush();

        this.scene.forceRender = true;
        this.scene.events.fire('splat.colorsChanged', this);
    }

    async updatePositions() {
        // palette index edits mark dirty spans; get them onto the GPU
        this.instances.flush();
        await this.updateLocalBounds();

        this.scene.forceRender = true;
        this.scene.events.fire('splat.positionsChanged', this);
    }

    get worldTransform() {
        return this.entity.getWorldTransform();
    }

    set name(newName: string) {
        if (newName !== this.name) {
            this._name = newName;
            this.scene.events.fire('splat.name', this);
        }
    }

    get name() {
        return this._name;
    }

    get filename() {
        return (this.asset.file as any).filename;
    }

    async add() {
        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        this.scene.projectedSplatRenderer.add(this);

        // we must update state in case the state data was loaded from ply
        await this.updateState();
    }

    remove() {
        this.scene.projectedSplatRenderer.remove(this);

        this.scene.contentRoot.removeChild(this.entity);
        this.scene.boundDirty = true;
    }

    // Create a new layer over a subset of this layer's instances, for duplicate
    // and separate. The new layer *shares* this layer's static data - not one
    // gaussian is copied, so the cost is the ~14 bytes per instance of the list -
    // and inherits the per-layer state that makes it look identical. Keep this in
    // step with serialize() below: both enumerate the same per-layer state.
    createLayer(ranges: IndexRanges, name: string) {
        const instances = GaussianInstances.fromSubset(this.resource.device, this.instances, ranges);

        // the entity transform is inherited rather than baked into the data, which
        // is what lets the static rows be shared
        const layer = new Splat(this.asset, this.entity.getLocalRotation(), instances);
        layer.entity.setLocalPosition(this.entity.getLocalPosition());
        layer.entity.setLocalScale(this.entity.getLocalScale());
        layer.localFrameOrigin.copy(this.localFrameOrigin);
        layer.localFrame.copy(this.localFrame);

        // assigned through the backing fields: the public setters notify the scene,
        // and this layer has not been added to one yet
        layer._name = name;
        layer._visible = this._visible;

        // the copied instances still index *this* layer's palettes, so give the new
        // layer its own entries for the transforms and grades it actually
        // references. Entry 0 is the identity in every palette, so instances that
        // reference it need no work.
        const transformMap = new Map<number, number>();
        const colorMap = new Map<number, number>();
        const transform = new Mat4();
        const terms = createGradeTerms();
        for (let i = 0; i < instances.count; ++i) {
            const transformIndex = instances.transformIndex(i);
            if (transformIndex !== 0) {
                let mapped = transformMap.get(transformIndex);
                if (mapped === undefined) {
                    mapped = layer.transformPalette.alloc();
                    this.transformPalette.getTransform(transformIndex, transform);
                    layer.transformPalette.setTransform(mapped, transform);
                    transformMap.set(transformIndex, mapped);
                }
                instances.setTransformIndex(i, mapped);
            }

            const colorIndex = instances.colorIndex(i);
            if (colorIndex !== 0) {
                let mapped = colorMap.get(colorIndex);
                if (mapped === undefined) {
                    mapped = layer.colorPalette.alloc();
                    this.colorPalette.getEntry(colorIndex, terms);
                    layer.colorPalette.setEntry(mapped, terms);
                    colorMap.set(colorIndex, mapped);
                }
                instances.setColorIndex(i, mapped);
            }
        }

        return layer;
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.changedCounter);
        serializer.pack(this.visible);
    }

    onPreRender() {
        const events = this.scene.events;
        const selected = this.scene.camera.renderOverlays && events.invoke('selection') === this;

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

                    this.scene.app.drawLine(veca, vecb, Color.WHITE, true, this.scene.worldLayer);
                }
            }
        }

        this.entity.enabled = this.visible;
    }

    focalPoint() {
        return this.worldBound.center;
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

        this.updateWorldBound();

        this.scene.events.fire('splat.moved', this);
    }

    // calculate both selection and local bounds (async, callers must await)
    async updateLocalBounds(): Promise<void> {
        await this.scene.dataProcessor.calcBound(this, this.selectionBoundStorage, this.localBoundStorage);
        this.updateWorldBound();
    }

    // update world bound from local bound (synchronous)
    private updateWorldBound() {
        this.worldBoundStorage.setFromTransformedAabb(this.localBoundStorage, this.entity.getWorldTransform());
        this.scene.boundDirty = true;
    }

    // get the selection bound
    get selectionBound() {
        return this.selectionBoundStorage;
    }

    // get local space bound
    get localBound() {
        return this.localBoundStorage;
    }

    // get world space bound
    get worldBound() {
        return this.worldBoundStorage;
    }

    set visible(value: boolean) {
        if (value !== this.visible) {
            this._visible = value;
            this.scene?.events.fire('splat.visibility', this);
        }
    }

    get visible() {
        return this._visible;
    }

    // get pivot position/rotation/scale (caller should have awaited operation that changed data)
    getPivot(result: Transform) {
        const { entity } = this;
        // the pivot is the model's local frame: the entity's own frame
        // amended by the user-defined local frame (identity by default, so
        // the pivot then lands exactly on the entity transform)
        quat.mul2(entity.getLocalRotation(), this.localFrame);
        entity.getLocalTransform().transformPoint(this.localFrameOrigin, vec);
        result.set(vec, quat, entity.getLocalScale());
    }

    setLocalFrame(origin: Vec3, rotation: Quat) {
        this.localFrameOrigin.copy(origin);
        this.localFrame.copy(rotation);
        this.scene.events.fire('splat.localFrame', this);
    }

    get hasLocalFrame() {
        return !this.localFrameOrigin.equals(Vec3.ZERO) || !this.localFrame.equals(Quat.IDENTITY);
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];
        const pack4 = (q: Quat) => [q.x, q.y, q.z, q.w];
        return {
            name: this.name,
            position: pack3(this.entity.getLocalPosition()),
            rotation: pack4(this.entity.getLocalRotation()),
            scale: pack3(this.entity.getLocalScale()),
            localFrameOrigin: pack3(this.localFrameOrigin),
            localFrame: pack4(this.localFrame),
            visible: this.visible
        };
    }

    docDeserialize(doc: any) {
        const { name, position, rotation, scale, visible } = doc;

        this.name = name;
        this.move(new Vec3(position), new Quat(rotation), new Vec3(scale));
        // older documents predate the local frame
        this.localFrameOrigin = doc.localFrameOrigin ? new Vec3(doc.localFrameOrigin) : new Vec3();
        this.localFrame = doc.localFrame ? new Quat(doc.localFrame) : new Quat();
        this.visible = visible;
        this.migrateLayerGrade(doc);
    }

    // Documents up to v0 carried one colour grade for the whole layer. Colour is
    // per-gaussian now, so fold a saved grade into a single palette entry that
    // every instance references: exactly equivalent, costs one entry, and it
    // becomes editable and resettable through the colour panel like any other.
    // v1 documents don't write these fields, so this is a no-op for them.
    private migrateLayerGrade(doc: any) {
        const tintClr = doc.tintClr ?
            new Color(doc.tintClr[0], doc.tintClr[1], doc.tintClr[2]) : Color.WHITE;
        const params = {
            tintClr,
            temperature: doc.temperature ?? 0,
            saturation: doc.saturation ?? 1,
            brightness: doc.brightness ?? 0,
            blackPoint: doc.blackPoint ?? 0,
            whitePoint: doc.whitePoint ?? 1,
            transparency: doc.transparency ?? 1
        };

        const grade = new ColorGrade(gradeTerms(params, createGradeTerms()));
        if (!grade.hasTint && !grade.hasTransparency) {
            return;
        }

        const index = this.colorPalette.alloc();
        this.colorPalette.setEntry(index, gradeTerms(params, createGradeTerms()));
        for (let i = 0; i < this.instances.count; ++i) {
            this.instances.setColorIndex(i, index);
        }
        this.instances.flush();
    }
}

export { Splat };
