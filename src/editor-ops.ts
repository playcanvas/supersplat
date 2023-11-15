import {
    BLEND_NORMAL,
    BoundingBox,
    Color,
    Mat4,
    Material,
    Mesh,
    MeshInstance,
    path,
    PRIMITIVE_POINTS,
    Quat,
    SEMANTIC_POSITION,
    createShaderFromCode,
    Vec3,
    Vec4
} from 'playcanvas';
import { Splat as SplatRender, SplatData, SplatInstance } from 'playcanvas-extras';
import { Scene } from './scene';
import { EditorUI } from './editor-ui';
import { Element, ElementType } from './element';
import { Splat } from './splat';
import { EditHistory } from './edit-history';
import { deletedOpacity, DeleteSelectionEditOp, ResetEditOp } from './edit-ops';

import { KdTree } from './kd-tree';

const vs = /* glsl */ `
attribute vec4 vertex_position;

uniform mat4 matrix_model;
uniform mat4 matrix_view;
uniform mat4 matrix_projection;
uniform mat4 matrix_viewProjection;

uniform float splatSize;

varying vec4 color;

void main(void) {
    if (vertex_position.w == -1.0) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    } else {
        gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position.xyz, 1.0);
        gl_PointSize = splatSize;
        float opacity = vertex_position.w;
        color = (opacity == -1.0) ? vec4(0) : mix(vec4(0, 0, 1.0, 0.5), vec4(1.0, 1.0, 0.0, 0.5), opacity);
    }
}
`;

const fs = /* glsl */ `
varying vec4 color;
void main(void)
{
    gl_FragColor = color;
}
`;

class SplatDebug {
    splatData: SplatData;
    meshInstance: MeshInstance;

    constructor(scene: Scene, splat: Splat, splatData: SplatData) {
        const device = scene.graphicsDevice;

        const shader = createShaderFromCode(device, vs, fs, `splatDebugShader`, {
            vertex_position: SEMANTIC_POSITION
        });

        const material = new Material();
        material.name = 'splatDebugMaterial';
        material.blendType = BLEND_NORMAL;
        material.shader = shader;
        material.setParameter('splatSize', 1.0);
        material.update();

        const x = splatData.getProp('x');
        const y = splatData.getProp('y');
        const z = splatData.getProp('z');
        const s = splatData.getProp('selection');

        const vertexData = new Float32Array(splatData.numSplats * 4);
        for (let i = 0; i < splatData.numSplats; ++i) {
            vertexData[i * 4 + 0] = x[i];
            vertexData[i * 4 + 1] = y[i];
            vertexData[i * 4 + 2] = z[i];
            vertexData[i * 4 + 3] = s[i];
        }

        const mesh = new Mesh(device);
        mesh.setPositions(vertexData, 4);
        mesh.update(PRIMITIVE_POINTS, true);

        this.splatData = splatData;
        this.meshInstance = new MeshInstance(mesh, material, splat.root);
    }

    update() {
        const splatData = this.splatData;
        const s = splatData.getProp('selection');
        const o = splatData.getProp('opacity');

        const vb = this.meshInstance.mesh.vertexBuffer;
        const vertexData = new Float32Array(vb.lock());

        let count = 0;

        for (let i = 0; i < splatData.numSplats; ++i) {
            const selection = o[i] === deletedOpacity ? -1 : s[i];
            vertexData[i * 4 + 3] = selection;
            count += selection === 1 ? 1 : 0;
        }

        vb.unlock();

        return count;
    }

    set splatSize(splatSize: number) {
        this.meshInstance.material.setParameter('splatSize', splatSize);
    }

    get splatSize() {
        // @ts-ignore
        return this.meshInstance.material.getParameter('splatSize').data;
    }
}

// download the data uri
const download = (filename: string, data: ArrayBuffer) => {
    const blob = new Blob([data], { type: "octet/stream" });
    const url = window.URL.createObjectURL(blob);

    const lnk = document.createElement('a');
    lnk.download = filename;
    lnk.href = url;

    // create a "fake" click-event to trigger the download
    if (document.createEvent) {
        const e = document.createEvent("MouseEvents");
        e.initMouseEvent("click", true, true, window,
                         0, 0, 0, 0, 0, false, false, false,
                         false, 0, null);
        lnk.dispatchEvent(e);
    } else {
        // @ts-ignore
        lnk.fireEvent?.("onclick");
    }

    window.URL.revokeObjectURL(url);
};

const convertPly = (splatData: SplatData, modelMat: Mat4) => {
    // count the number of non-deleted splats
    const opacity = splatData.getProp('opacity');
    let numSplats = 0;
    for (let i = 0; i < splatData.numSplats; ++i) {
        numSplats += opacity[i] !== deletedOpacity ? 1 : 0;
    }

    const internalProps = ['selection', 'opacityOrig'];
    const props = splatData.vertexElement.properties.filter(p => p.storage && !internalProps.includes(p.name)).map(p => p.name);
    const header = (new TextEncoder()).encode(`ply\nformat binary_little_endian 1.0\nelement vertex ${numSplats}\n` + props.map(p => `property float ${p}`).join('\n') + `\nend_header\n`);
    const result = new Uint8Array(header.byteLength + numSplats * props.length * 4);

    result.set(header);

    const dataView = new DataView(result.buffer);
    let offset = header.byteLength;

    for (let i = 0; i < splatData.numSplats; ++i) {
        props.forEach((prop) => {
            const p = splatData.getProp(prop);
            if (p) {
                if (opacity[i] !== deletedOpacity) {
                    dataView.setFloat32(offset, p[i], true);
                    offset += 4;
                }
            }
        });
    }

    // FIXME
    // we must undo the transform we apply at load time to output data
    const mat = new Mat4();
    mat.setScale(-1, -1, 1);
    mat.invert();
    mat.mul2(mat, modelMat);

    const quat = new Quat();
    quat.setFromMat4(mat);

    const scale = new Vec3();
    mat.getScale(scale);

    const v = new Vec3();
    const q = new Quat();

    const x_off = props.indexOf('x') * 4;
    const y_off = props.indexOf('y') * 4;
    const z_off = props.indexOf('z') * 4;
    const r0_off = props.indexOf('rot_0') * 4;
    const r1_off = props.indexOf('rot_1') * 4;
    const r2_off = props.indexOf('rot_2') * 4;
    const r3_off = props.indexOf('rot_3') * 4;
    const scale0_off = props.indexOf('scale_0') * 4;
    const scale1_off = props.indexOf('scale_1') * 4;
    const scale2_off = props.indexOf('scale_2') * 4;

    for (let i = 0; i < numSplats; ++i) {
        const off = header.byteLength + i * props.length * 4;
        const x = dataView.getFloat32(off + x_off, true);
        const y = dataView.getFloat32(off + y_off, true);
        const z = dataView.getFloat32(off + z_off, true);
        const rot_0 = dataView.getFloat32(off + r0_off, true);
        const rot_1 = dataView.getFloat32(off + r1_off, true);
        const rot_2 = dataView.getFloat32(off + r2_off, true);
        const rot_3 = dataView.getFloat32(off + r3_off, true);
        const scale_0 = dataView.getFloat32(off + scale0_off, true);
        const scale_1 = dataView.getFloat32(off + scale1_off, true);
        const scale_2 = dataView.getFloat32(off + scale2_off, true);

        v.set(x, y, z);
        mat.transformPoint(v, v);
        dataView.setFloat32(off + x_off, v.x, true);
        dataView.setFloat32(off + y_off, v.y, true);
        dataView.setFloat32(off + z_off, v.z, true);

        q.set(rot_1, rot_2, rot_3, rot_0).mul2(quat, q);
        dataView.setFloat32(off + r0_off, q.w, true);
        dataView.setFloat32(off + r1_off, q.x, true);
        dataView.setFloat32(off + r2_off, q.y, true);
        dataView.setFloat32(off + r3_off, q.z, true);

        dataView.setFloat32(off + scale0_off, Math.log(Math.exp(scale_0) * scale.x), true);
        dataView.setFloat32(off + scale1_off, Math.log(Math.exp(scale_1) * scale.x), true);
        dataView.setFloat32(off + scale2_off, Math.log(Math.exp(scale_2) * scale.x), true);
    }

    return result;
};

const convertSplat = (splatData: SplatData, modelMat: Mat4) => {
    // count the number of non-deleted splats
    const x = splatData.getProp('x');
    const y = splatData.getProp('y');
    const z = splatData.getProp('z');
    const opacity = splatData.getProp('opacity');
    const rot_0 = splatData.getProp('rot_0');
    const rot_1 = splatData.getProp('rot_1');
    const rot_2 = splatData.getProp('rot_2');
    const rot_3 = splatData.getProp('rot_3');
    const f_dc_0 = splatData.getProp('f_dc_0');
    const f_dc_1 = splatData.getProp('f_dc_1');
    const f_dc_2 = splatData.getProp('f_dc_2');
    const scale_0 = splatData.getProp('scale_0');
    const scale_1 = splatData.getProp('scale_1');
    const scale_2 = splatData.getProp('scale_2');

    // count number of non-deleted splats
    let numSplats = 0;
    for (let i = 0; i < splatData.numSplats; ++i) {
        numSplats += opacity[i] !== deletedOpacity ? 1 : 0;
    }

    // position.xyz: float32, scale.xyz: float32, color.rgba: uint8, quaternion.ijkl: uint8
    const result = new Uint8Array(numSplats * 32);
    const dataView = new DataView(result.buffer);

    // we must undo the transform we apply at load time to output data
    const mat = new Mat4();
    mat.setScale(-1, -1, 1);
    mat.invert();
    mat.mul2(mat, modelMat);

    const quat = new Quat();
    quat.setFromMat4(mat);

    const v = new Vec3();
    const q = new Quat();

    const scale = new Vec3();
    mat.getScale(scale);

    const clamp = (x: number) => Math.max(0, Math.min(255, x));
    let idx = 0;

    for (let i = 0; i < splatData.numSplats; ++i) {
        if (opacity[i] === deletedOpacity) continue;

        const off = idx++ * 32;

        v.set(x[i], y[i], z[i]);
        mat.transformPoint(v, v);
        dataView.setFloat32(off + 0, v.x, true);
        dataView.setFloat32(off + 4, v.y, true);
        dataView.setFloat32(off + 8, v.z, true);

        dataView.setFloat32(off + 12, Math.exp(scale_0[i]) * scale.x, true);
        dataView.setFloat32(off + 16, Math.exp(scale_1[i]) * scale.x, true);
        dataView.setFloat32(off + 20, Math.exp(scale_2[i]) * scale.x, true);

        const SH_C0 = 0.28209479177387814;
        dataView.setUint8(off + 24, clamp((0.5 + SH_C0 * f_dc_0[i]) * 255));
        dataView.setUint8(off + 25, clamp((0.5 + SH_C0 * f_dc_1[i]) * 255));
        dataView.setUint8(off + 26, clamp((0.5 + SH_C0 * f_dc_2[i]) * 255));
        dataView.setUint8(off + 27, clamp((1 / (1 + Math.exp(-opacity[i]))) * 255));

        q.set(rot_1[i], rot_2[i], rot_3[i], rot_0[i]).mul2(quat, q).normalize();
        dataView.setUint8(off + 28, clamp(q.w * 128 + 128));
        dataView.setUint8(off + 29, clamp(q.x * 128 + 128));
        dataView.setUint8(off + 30, clamp(q.y * 128 + 128));
        dataView.setUint8(off + 31, clamp(q.z * 128 + 128));
    }

    return result;
};

interface SplatDef {
    element: Splat,
    data: SplatData,
    render: SplatRender,
    instance: SplatInstance,
    debug: SplatDebug,
    kdTree: KdTree
};

// register for editor and scene events
const registerEvents = (scene: Scene, editorUI: EditorUI) => {
    const vec = new Vec3();
    const vec2 = new Vec3();
    const vec4 = new Vec4();
    const mat = new Mat4();
    const aabb = new BoundingBox();
    const splatDefs: SplatDef[] = [];

    // make a copy of the opacity channel because that's what we'll be modifying
    scene.on('element:added', (element: Element) => {
        if (element.type === ElementType.splat) {
            const splatElement = element as Splat;
            const resource = splatElement.asset.resource;
            const splatData = resource.splatData;
            const splatRender = resource.splat;

            if (splatData && splatRender) {
                // make a copy of the opacity channel because that's what we'll be modifying with edits
                splatData.addProp('opacityOrig', splatData.getProp('opacity').slice());

                // add a selection channel
                splatData.addProp('selection', new Float32Array(splatData.numSplats));

                // store splat info
                splatDefs.push({
                    element: splatElement,
                    data: splatData,
                    render: splatRender,
                    instance: splatElement.root.render.meshInstances[0].splatInstance,
                    debug: new SplatDebug(scene, splatElement, splatData),
                    kdTree: new KdTree(splatData.getProp('x'), splatData.getProp('y'), splatData.getProp('z'))
                });
            }
        }
    });

    let selectedSplats = 0;

    const debugSphereCenter = new Vec3();
    let debugSphereRadius = 0;

    const debugPlane = new Vec3();
    let debugPlaneDistance = 0;

    let showOrigin = false;

    // draw debug mesh instances
    scene.on('prerender', () => {
        const app = scene.app;

        splatDefs.forEach((splatDef) => {
            const debug = splatDef.debug;

            if (debug.splatSize > 0) {
                app.drawMeshInstance(debug.meshInstance);
            }

            if (debugSphereRadius > 0) {
                app.drawWireSphere(debugSphereCenter, debugSphereRadius, Color.RED, 40);
            }

            if (debugPlane.length() > 0) {
                vec.copy(debugPlane).mulScalar(debugPlaneDistance);
                vec2.add2(vec, debugPlane);

                mat.setLookAt(vec, vec2, Math.abs(Vec3.UP.dot(debugPlane)) > 0.99 ? Vec3.FORWARD : Vec3.UP);

                const lines = [
                    new Vec3(-1,-1, 0), new Vec3( 1,-1, 0),
                    new Vec3( 1,-1, 0), new Vec3( 1, 1, 0),
                    new Vec3( 1, 1, 0), new Vec3(-1, 1, 0),
                    new Vec3(-1, 1, 0), new Vec3(-1,-1, 0),
                    new Vec3( 0, 0, 0), new Vec3( 0, 0,-1)
                ];
                for (let i = 0; i < lines.length; ++i) {
                    mat.transformPoint(lines[i], lines[i]);
                }

                app.drawLines(lines, Color.RED);
            }

            // get camera position in local space
            mat.invert(splatDef.element.entity.getWorldTransform());
            mat.transformPoint(scene.camera.entity.position, vec);

            const opacity = splatDef.data.getProp('opacity');

            const result = splatDef.kdTree.findNearest(vec.x, vec.y, vec.z, (index) => opacity[index] !== deletedOpacity);
            const x = splatDef.data.getProp('x');
            const y = splatDef.data.getProp('y');
            const z = splatDef.data.getProp('z');
            app.drawWireSphere(new Vec3(x[result.index], y[result.index], z[result.index]), 0.1, Color.GREEN, 40);
        });

        if (showOrigin) {
            const lines = [
                0, 0, 0, 1, 0, 0,
                0, 0, 0, 0, 1, 0,
                0, 0, 0, 0, 0, 1
            ];
            const colors = [
                1, 0, 0, 1, 1, 0, 0, 1,
                0, 1, 0, 1, 0, 1, 0, 1,
                0, 0, 1, 1, 0, 0, 1, 1
            ];
            app.drawLineArrays(lines, colors);
        }
    });

    const editHistory = new EditHistory();

    const events = editorUI.controlPanel.events;

    const updateSelection = () => {
        selectedSplats = 0;
        splatDefs.forEach((splatDef) => {
            selectedSplats += splatDef.debug.update();
        });
        events.fire('splat:count', selectedSplats);
        scene.forceRender = true;
    };

    const updateColorData = () => {
        splatDefs.forEach((splatDef) => {
            const data = splatDef.data;
            const render = splatDef.render;

            render.updateColorData(
                data.getProp('f_dc_0'),
                data.getProp('f_dc_1'),
                data.getProp('f_dc_2'),
                data.getProp('opacity')
            );
        });

        updateSelection();
    };

    const processSelection = (selection: Float32Array, opacity: Float32Array, op: string, pred: (i: number) => boolean) => {
        for (let i = 0; i < selection.length; ++i) {
            if (opacity[i] === deletedOpacity) {
                selection[i] = 0;
            } else {
                const result = pred(i);
                switch (op) {
                    case 'add':
                        if (result) selection[i] = 1;
                        break;
                    case 'remove':
                        if (result) selection[i] = 0;
                        break;
                    case 'set':
                        selection[i] = result ? 1 : 0;
                        break;
                }
            }
        }
    };

    events.on('focusCamera', () => {
        const splatDef = splatDefs[0];
        if (splatDef) {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');
            const opacityPred = (i: number) => opacity[i] !== deletedOpacity;
            const selectionPred = (i: number) => selection[i] === 1;
            splatData.calcAabb(aabb, selectedSplats ? selectionPred : opacityPred);
            splatData.calcFocalPoint(vec, selectedSplats ? selectionPred : opacityPred);

            const worldTransform = splatDef.element.entity.getWorldTransform();
            worldTransform.transformPoint(vec, vec);
            worldTransform.getScale(vec2);

            scene.camera.focus({
                focalPoint: vec,
                distance: aabb.halfExtents.length() * vec2.x / scene.bound.halfExtents.length()
            });
        }
    });

    events.on('splatSize', (value: number) => {
        splatDefs.forEach((splatDef) => {
            splatDef.debug.splatSize = value;
        });
        scene.forceRender = true;
    });

    events.on('selectAll', () => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');
            processSelection(selection, opacity, 'set', (i) => true);
        });
        updateSelection();
    });

    events.on('selectNone', () => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');
            processSelection(selection, opacity, 'set', (i) => false);
        });
        updateSelection();
    });

    events.on('invertSelection', () => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');
            processSelection(selection, opacity, 'set', (i) => !selection[i]);
        });
        updateSelection();
    });

    events.on('selectBySize', (op: string, value: number) => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const opacity = splatData.getProp('opacity');
            const selection = splatData.getProp('selection');
            const scale_0 = splatData.getProp('scale_0');
            const scale_1 = splatData.getProp('scale_1');
            const scale_2 = splatData.getProp('scale_2');

            // calculate min and max size
            let first = true;
            let scaleMin;
            let scaleMax;
            for (let i = 0; i < splatData.numSplats; ++i) {
                if (opacity[i] === deletedOpacity) continue;
                if (first) {
                    first = false;
                    scaleMin = Math.min(scale_0[i], scale_1[i], scale_2[i]);
                    scaleMax = Math.max(scale_0[i], scale_1[i], scale_2[i]);
                } else {
                    scaleMin = Math.min(scaleMin, scale_0[i], scale_1[i], scale_2[i]);
                    scaleMax = Math.max(scaleMax, scale_0[i], scale_1[i], scale_2[i]);
                }
            }

            const maxScale = Math.log(Math.exp(scaleMin) + value * (Math.exp(scaleMax) - Math.exp(scaleMin)));

            processSelection(selection, opacity, op, (i) => scale_0[i] > maxScale || scale_1[i] > maxScale || scale_2[i] > maxScale);
        });
        updateSelection();
    });

    events.on('selectByOpacity', (op: string, value: number) => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');

            processSelection(selection, opacity, op, (i) => {
                const t = Math.exp(opacity[i]);
                return ((1 / (1 + t)) < value);
            });
        });
        updateSelection();
    });

    events.on('selectBySpherePlacement', (sphere: number[]) => {
        debugSphereCenter.set(sphere[0], sphere[1], sphere[2]);
        debugSphereRadius = sphere[3];

        scene.forceRender = true;
    });

    events.on('selectByPlanePlacement', (axis: number[], distance: number) => {
        debugPlane.set(axis[0], axis[1], axis[2]);
        debugPlaneDistance = distance;

        scene.forceRender = true;
    });

    events.on('selectBySphere', (op: string, sphere: number[]) => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');

            const radius2 = sphere[3] * sphere[3];
            vec.set(sphere[0], sphere[1], sphere[2]);

            mat.invert(splatDef.element.entity.getWorldTransform());
            mat.transformPoint(vec, vec);

            processSelection(selection, opacity, op, (i) => {
                vec2.set(x[i], y[i], z[i]);
                return vec2.sub(vec).lengthSq() < radius2;
            });
        });
        updateSelection();
    });

    events.on('selectByPlane', (op: string, axis: number[], distance: number) => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');

            vec.set(axis[0], axis[1], axis[2]);
            vec2.set(axis[0] * distance, axis[1] * distance, axis[2] * distance);

            // transform the plane to local space
            mat.invert(splatDef.element.entity.getWorldTransform());
            mat.transformVector(vec, vec);
            mat.transformPoint(vec2, vec2);

            const localDistance = vec.dot(vec2);

            processSelection(selection, opacity, op, (i) => {
                vec2.set(x[i], y[i], z[i]);
                return vec.dot(vec2) - localDistance > 0;
            });
        });
        updateSelection();
    });

    events.on('selectRect', (op: string, rect: any) => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');

            // convert screen rect to camera space
            const camera = scene.camera.entity.camera;

            // calculate final matrix
            mat.mul2(camera.camera._viewProjMat, splatDef.element.entity.getWorldTransform());
            const sx = rect.start.x * 2 - 1;
            const sy = rect.start.y * 2 - 1;
            const ex = rect.end.x * 2 - 1;
            const ey = rect.end.y * 2 - 1;

            processSelection(selection, opacity, op, (i) => {
                vec4.set(x[i], y[i], z[i], 1.0);
                mat.transformVec4(vec4, vec4);
                vec4.x /= vec4.w;
                vec4.y = -vec4.y / vec4.w;
                if (vec4.x < sx || vec4.x > ex || vec4.y < sy || vec4.y > ey) {
                    return false;
                }
                return true;
            });
        });
        updateSelection();
    });

    events.on('selectByMask', (op: string, mask: ImageData) => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');

            // convert screen rect to camera space
            const camera = scene.camera.entity.camera;

            // calculate final matrix
            mat.mul2(camera.camera._viewProjMat, splatDef.element.entity.getWorldTransform());

            processSelection(selection, opacity, op, (i) => {
                vec4.set(x[i], y[i], z[i], 1.0);
                mat.transformVec4(vec4, vec4);
                vec4.x = vec4.x / vec4.w * 0.5 + 0.5;
                vec4.y = -vec4.y / vec4.w * 0.5 + 0.5;
                vec4.z = vec4.z / vec4.w * 0.5 + 0.5;

                if (vec4.x < 0 || vec4.x > 1 || vec4.y < 0 || vec4.y > 1 || vec4.z < 0 || vec4.z > 1) {
                    return false;
                }

                const mx = Math.floor(vec4.x * mask.width);
                const my = Math.floor(vec4.y * mask.height);
                return mask.data[(my * mask.width + mx) * 4] === 255;
            });
        });
        updateSelection();
    });

    events.on('selectFill', (op: string) => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');

            const distances = new Float32Array(selection.length);
            const indices = [];

            // make list of selected splats
            for (let i = 0; i < selection.length; ++i) {
                if (opacity[i] !== deletedOpacity) {
                    distances[i] = splatDef.kdTree.findNearest(x[i], y[i], z[i], (idx) => idx !== i && opacity[idx] !== deletedOpacity).distanceSqr;
                    indices.push(i);
                }
            }

            indices.sort((a, b) => distances[b] - distances[a]);

            // select the first 10%
            for (let i = 0; i < indices.length * 0.05; ++i) {
                selection[indices[i]] = 1;
            }
        });

        updateSelection();
    });

    events.on('showOrigin', (value: boolean) => {
        showOrigin = value;
        scene.forceRender = true;
    });

    events.on('scenePosition', (value: number[]) => {
        splatDefs.forEach((splatDef) => {
            splatDef.element.entity.setLocalPosition(value[0], value[1], value[2]);
        });

        scene.updateBound();
    });

    events.on('sceneRotation', (value: number[]) => {
        splatDefs.forEach((splatDef) => {
            splatDef.element.entity.setLocalEulerAngles(value[0], value[1], value[2]);
        });

        scene.updateBound();
    });

    events.on('sceneScale', (value: number) => {
        splatDefs.forEach((splatDef) => {
            splatDef.element.entity.setLocalScale(value, value, value);
        });

        scene.updateBound();
    });

    events.on('deleteSelection', () => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            editHistory.add(new DeleteSelectionEditOp(splatData));
        });
        updateColorData();
    });

    events.on('reset', () => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            editHistory.add(new ResetEditOp(splatData));
        });
        updateColorData();
    });

    events.on('allData', (value: boolean) => {
        scene.assetLoader.loadAllData = value;
    });

    const removeExtension = (filename: string) => {
        return filename.substring(0, filename.length - path.getExtension(filename).length);
    };

    events.on('export', (format: string) => {
        switch (format) {
            case 'ply':
                splatDefs.forEach((splatDef) => {
                    const data = convertPly(splatDef.data, splatDef.element.entity.getWorldTransform());
                    download(removeExtension(splatDef.element.asset.file.filename) + '.cleaned.ply', data);
                });
                break;
            case 'splat':
                splatDefs.forEach((splatDef) => {
                    const data = convertSplat(splatDef.data, splatDef.element.entity.getWorldTransform());
                    download(removeExtension(splatDef.element.asset.file.filename) + '.cleaned.splat', data);
                });
                break;
        }
    });

    events.on('undo', () => {
        if (editHistory.canUndo()) {
            editHistory.undo();
            updateColorData();
        }
    });

    events.on('redo', () => {
        if (editHistory.canRedo()) {
            editHistory.redo();
            updateColorData();
        }
    });
}

export { registerEvents };
