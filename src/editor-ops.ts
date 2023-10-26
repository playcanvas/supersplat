import {
    BLEND_NORMAL,
    Color,
    Mat4,
    Material,
    Mesh,
    MeshInstance,
    PRIMITIVE_POINTS,
    Quat,
    SEMANTIC_POSITION,
    createShaderFromCode,
    Vec3
} from 'playcanvas';
import { Scene } from './scene';
import { EditorUI } from './editor-ui';
import { Element, ElementType } from './element';
import { Splat } from './splat';
import { SplatData } from '../submodules/model-viewer/sr/splat/splat-data';

const vs = /* glsl */ `
attribute vec4 vertex_position;

uniform mat4 matrix_model;
uniform mat4 matrix_view;
uniform mat4 matrix_projection;
uniform mat4 matrix_viewProjection;

varying vec4 color;

void main(void) {
    gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position.xyz, 1.0);
    gl_PointSize = 2.0;
    float opacity = vertex_position.w;
    color = (opacity == -1.0) ? vec4(0) : mix(vec4(0, 0, 1.0, 0.5), vec4(1.0, 1.0, 0.0, 0.5), opacity);
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
        this.meshInstance = new MeshInstance(mesh, material, splat.entity);
    }

    update() {
        const splatData = this.splatData;
        const s = splatData.getProp('selection');
        const o = splatData.getProp('opacity');

        const vb = this.meshInstance.mesh.vertexBuffer;
        const vertexData = new Float32Array(vb.lock());

        for (let i = 0; i < splatData.numSplats; ++i) {
            vertexData[i * 4 + 3] = o[i] === deletedOpacity ? -1 : s[i];
        }

        vb.unlock();
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
    } else if (lnk.fireEvent) {
        lnk.fireEvent("onclick");
    }

    window.URL.revokeObjectURL(url);
};

const deletedOpacity = -1000;

const convertPly = (splatData: SplatData) => {
    // count the number of non-deleted splats
    const opacity = splatData.getProp('opacity');
    let numSplats = 0;
    for (let i = 0; i < splatData.numSplats; ++i) {
        numSplats += opacity[i] !== deletedOpacity ? 1 : 0;
    }

    const props = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
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

    const quat = new Quat();
    quat.setFromMat4(mat);

    const v = new Vec3();
    const q = new Quat();

    const x_off = props.indexOf('x') * 4;
    const y_off = props.indexOf('y') * 4;
    const z_off = props.indexOf('z') * 4;
    const r0_off = props.indexOf('rot_0') * 4;
    const r1_off = props.indexOf('rot_1') * 4;
    const r2_off = props.indexOf('rot_2') * 4;
    const r3_off = props.indexOf('rot_3') * 4;
    for (let i = 0; i < numSplats; ++i) {
        const off = header.byteLength + i * props.length * 4;
        const x = dataView.getFloat32(off + x_off, true);
        const y = dataView.getFloat32(off + y_off, true);
        const z = dataView.getFloat32(off + z_off, true);
        const rot_0 = dataView.getFloat32(off + r0_off, true);
        const rot_1 = dataView.getFloat32(off + r1_off, true);
        const rot_2 = dataView.getFloat32(off + r2_off, true);
        const rot_3 = dataView.getFloat32(off + r3_off, true);

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
    }

    return result;
};

// register for editor and scene events
const registerEvents = (scene: Scene, editorUI: EditorUI) => {
    const debugs = new Map<SplatData, SplatDebug>();
    const vec = new Vec3();
    const vec2 = new Vec3();
    const mat = new Mat4();

    const debugSphereCenter = new Vec3();
    let debugSphereRadius = 0;

    // make a copy of the opacity channel because that's what we'll be modifying
    scene.on('element:added', (element: Element) => {
        if (element.type === ElementType.splat) {
            const splatElement = element as Splat;
            const resource = splatElement.asset.resource;
            const splatData = resource?.splatData;
            if (splatData) {
                // make a copy of the opacity channel because that's what we'll be modifying with edits
                splatData.addProp('opacityOrig', splatData.getProp('opacity').slice());

                // add a selection channel
                splatData.addProp('selection', new Float32Array(splatData.numSplats));

                debugs.set(splatData, new SplatDebug(scene, splatElement, splatData));
            }
        }
    });

    // draw debug mesh instances
    scene.on('prerender', () => {
        const app = scene.app;

        debugs.forEach((debug) => {
            app.drawMeshInstance(debug.meshInstance);

            if (debugSphereRadius > 0) {
                debug.meshInstance.node.getWorldTransform().transformPoint(debugSphereCenter, vec);
                app.drawWireSphere(vec, debugSphereRadius, Color.RED);
            }
        });
    });

    editorUI.controlPanel.events.on('focusCamera', () => {
        scene.camera.focus();
    });


    const updateSelection = (splatData: SplatData) => {
        const splatDebug = debugs.get(splatData);
        if (splatDebug) {
            splatDebug.update();
        }

        scene.forceRender = true;
    };

    const updateColorData = (resource: any) => {
        const splatData = resource?.splatData;
        resource?.instances.forEach((instance: any) => {
            instance.splat.updateColorData(
                splatData.getProp('f_dc_0'),
                splatData.getProp('f_dc_1'),
                splatData.getProp('f_dc_2'),
                splatData.getProp('opacity')
            );
        });

        updateSelection(splatData);
    };

    const forEachSplat = (callback: (splatData: SplatData, resource: any) => void) => {
        scene.elements.forEach((element: Element) => {
            if (element.type === ElementType.splat) {
                const splatElement = element as Splat;
                const resource = splatElement.asset.resource;
                const splatData = resource?.splatData;
                if (splatData) {
                    callback(splatData, resource);
                }
            }
        });
    };

    editorUI.controlPanel.events.on('clearSelection', () => {
        forEachSplat((splatData: SplatData, resource: any) => {
            const selection = splatData.getProp('selection');

            for (let i = 0; i < splatData.numSplats; ++i) {
                selection[i] = 0;
            }

            updateSelection(splatData);
        });
    });

    editorUI.controlPanel.events.on('invertSelection', () => {
        forEachSplat((splatData: SplatData, resource: any) => {
            const selection = splatData.getProp('selection');

            for (let i = 0; i < splatData.numSplats; ++i) {
                selection[i] = 1 - selection[i];
            }

            updateSelection(splatData);
        });
    });

    editorUI.controlPanel.events.on('selectBySize', (value: number) => {
        forEachSplat((splatData: SplatData, resource: any) => {
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

            for (let i = 0; i < splatData.numSplats; ++i) {
                if (opacity[i] === deletedOpacity) {
                    selection[i] = 0;
                } else {
                    selection[i] = (scale_0[i] > maxScale || scale_1[i] > maxScale || scale_2[i] > maxScale) ? 1 : 0;
                }
            }

            updateSelection(splatData);
        });
    });

    editorUI.controlPanel.events.on('selectByOpacity', (value: number) => {
        forEachSplat((splatData: SplatData, resource: any) => {
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');

            for (let i = 0; i < splatData.numSplats; ++i) {
                if (opacity[i] === deletedOpacity) {
                    selection[i] = 0;
                } else {
                    const t = Math.exp(opacity[i]);
                    selection[i] = opacity[i] !== deletedOpacity && ((1 / (1 + t)) < value) ? 1 : 0;
                }
            }

            updateSelection(splatData);
        });
    });

    editorUI.controlPanel.events.on('selectBySphereMove', (sphere: number[]) => {
        debugSphereCenter.set(sphere[0], sphere[1], sphere[2]);
        debugSphereRadius = sphere[3];

        scene.forceRender = true;
    });

    editorUI.controlPanel.events.on('selectBySphere', (sphere: number[]) => {
        forEachSplat((splatData: SplatData, resource: any) => {
            const selection = splatData.getProp('selection');
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');

            const radius2 = sphere[3] * sphere[3];
            vec.set(sphere[0], sphere[1], sphere[2]);

            for (let i = 0; i < splatData.numSplats; ++i) {
                vec2.set(x[i], y[i], z[i]);
                selection[i] = vec2.sub(vec).lengthSq() < radius2 ? 1 : 0;
            }

            updateSelection(splatData);
        });
    });

    editorUI.controlPanel.events.on('deleteSelection', () => {
        forEachSplat((splatData: SplatData, resource: any) => {
            const selection = splatData.getProp('selection');
            const opacity = splatData.getProp('opacity');

            for (let i = 0; i < splatData.numSplats; ++i) {
                opacity[i] = selection[i] > 0 ? deletedOpacity : opacity[i];
            }

            updateColorData(resource);
        });
    });

    editorUI.controlPanel.events.on('reset', () => {
        forEachSplat((splatData: SplatData, resource: any) => {
            const opacity = splatData.getProp('opacity');
            const opacityOrig = splatData.getProp('opacityOrig');

            for (let i = 0; i < splatData.numSplats; ++i) {
                opacity[i] = opacityOrig[i];
            }

            updateColorData(resource);
        });
    });

    editorUI.controlPanel.events.on('export', () => {
        forEachSplat((splatData: SplatData, resource: any) => {
            const data = convertPly(splatData);
            download(resource.name + '.ply', data);
        });
    });
}

export { registerEvents };
