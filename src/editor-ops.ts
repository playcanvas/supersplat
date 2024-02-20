import {
    BoundingBox,
    Color,
    GSplat as SplatRender,
    GSplatData,
    GSplatInstance,
    Mat4,
    path,
    Vec3,
    Vec4
} from 'playcanvas';
import { Scene } from './scene';
import { EditorUI } from './ui/editor';
import { EditHistory, EditOp } from './edit-history';
import { Element, ElementType } from './element';
import { Splat } from './splat';
import { deletedOpacity, DeleteSelectionEditOp, ResetEditOp } from './edit-ops';
import { SplatDebug } from './splat-debug';
import { convertPly, convertPlyCompressed, convertSplat } from './splat-convert';
import { startSpinner, stopSpinner } from './ui/spinner';
import { Events } from './events';

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

// upload the file to the remote storage
const sendToRemoteStorage = async (filename: string, data: ArrayBuffer, remoteStorageDetails: RemoteStorageDetails) => {
    const formData = new FormData();
    formData.append('file', new Blob([data], { type: "octet/stream" }), filename);
    formData.append('preserveThumbnail', true);
    await fetch(remoteStorageDetails.url, {
        method: remoteStorageDetails.method,
        body: formData
    });
};

interface SplatDef {
    element: Splat,
    data: GSplatData,
    render: SplatRender,
    instance: GSplatInstance,
    debug: SplatDebug
};

interface RemoteStorageDetails {
    method: string;
    url: string;
};

// register for editor and scene events
const registerEvents = (events: Events, editHistory: EditHistory, scene: Scene, editorUI: EditorUI, remoteStorageDetails: RemoteStorageDetails) => {
    const vec = new Vec3();
    const vec2 = new Vec3();
    const vec4 = new Vec4();
    const mat = new Mat4();
    const aabb = new BoundingBox();
    const splatDefs: SplatDef[] = [];

    scene.on('error', (err: any) => {
        editorUI.showError(err);
    });

    scene.on('loaded', (filename: string) => {
        editorUI.setFilename(filename);
    });

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
                    instance: splatElement.root.instances,
                    debug: new SplatDebug(scene, splatElement, splatData)
                });
            }
        }
    });

    let selectedSplats = 0;

    const debugSphereCenter = new Vec3();
    let debugSphereRadius = 0;

    const debugPlane = new Vec3();
    let debugPlaneDistance = 0;

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
        });
    });

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
                data.getProp('f_dc_0') as Float32Array,
                data.getProp('f_dc_1') as Float32Array,
                data.getProp('f_dc_2') as Float32Array,
                data.getProp('opacity') as Float32Array
            );

            splatDef.element.recalcBound();
        });

        updateSelection();

        // recalculate gsplat and scene bounds
        scene.updateBound();

        // fire new scene bound
        events.fire('scene:bound:changed');
    };

    events.on('edit:apply', (editOp: EditOp) => {
        if (editOp instanceof DeleteSelectionEditOp || editOp instanceof ResetEditOp) {
            updateColorData();
        }
    });

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

    let lastExportCursor = 0;

    // add unsaved changes warning message.
    window.addEventListener("beforeunload", function (e) {
        if (editHistory.cursor === lastExportCursor) {
            // if the undo cursor matches last export, then we have no unsaved changes
            return undefined;
        }

        const msg = 'You have unsaved changes. Are you sure you want to leave?';
        e.returnValue = msg;
        return msg;
    });

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

            const worldTransform = splatDef.element.worldTransform;
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

    events.on('showGrid', (value: boolean) => {
        scene.grid.visible = value;
    });

    events.on('selectAll', () => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection') as Float32Array;
            const opacity = splatData.getProp('opacity') as Float32Array;
            processSelection(selection, opacity, 'set', (i) => true);
        });
        updateSelection();
    });

    events.on('selectNone', () => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection') as Float32Array;
            const opacity = splatData.getProp('opacity') as Float32Array;
            processSelection(selection, opacity, 'set', (i) => false);
        });
        updateSelection();
    });

    events.on('invertSelection', () => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection') as Float32Array;
            const opacity = splatData.getProp('opacity') as Float32Array;
            processSelection(selection, opacity, 'set', (i) => !selection[i]);
        });
        updateSelection();
    });

    events.on('selectBySize', (op: string, value: number) => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            const selection = splatData.getProp('selection') as Float32Array;
            const opacity = splatData.getProp('opacity') as Float32Array;
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
            const selection = splatData.getProp('selection') as Float32Array;
            const opacity = splatData.getProp('opacity') as Float32Array;

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
            const selection = splatData.getProp('selection') as Float32Array;
            const opacity = splatData.getProp('opacity') as Float32Array;
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');

            const radius2 = sphere[3] * sphere[3];
            vec.set(sphere[0], sphere[1], sphere[2]);

            mat.invert(splatDef.element.worldTransform);
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
            const selection = splatData.getProp('selection') as Float32Array;
            const opacity = splatData.getProp('opacity') as Float32Array;
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');

            vec.set(axis[0], axis[1], axis[2]);
            vec2.set(axis[0] * distance, axis[1] * distance, axis[2] * distance);

            // transform the plane to local space
            mat.invert(splatDef.element.worldTransform);
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
            const selection = splatData.getProp('selection') as Float32Array;
            const opacity = splatData.getProp('opacity') as Float32Array;
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');

            // convert screen rect to camera space
            const camera = scene.camera.entity.camera;

            // calculate final matrix
            mat.mul2(camera.camera._viewProjMat, splatDef.element.worldTransform);
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
            const selection = splatData.getProp('selection') as Float32Array;
            const opacity = splatData.getProp('opacity') as Float32Array;
            const x = splatData.getProp('x');
            const y = splatData.getProp('y');
            const z = splatData.getProp('z');

            // convert screen rect to camera space
            const camera = scene.camera.entity.camera;

            // calculate final matrix
            mat.mul2(camera.camera._viewProjMat, splatDef.element.worldTransform);

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

    events.on('deleteSelection', () => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            editHistory.add(new DeleteSelectionEditOp(splatData));
        });
    });

    events.on('reset', () => {
        splatDefs.forEach((splatDef) => {
            const splatData = splatDef.data;
            editHistory.add(new ResetEditOp(splatData));
        });
    });

    events.on('allData', (value: boolean) => {
        scene.assetLoader.loadAllData = value;
    });

    events.on('export', (format: string) => {
        const removeExtension = (filename: string) => {
            return filename.substring(0, filename.length - path.getExtension(filename).length);
        };

        if (splatDefs.length === 0) {
            return;
        }

        editorUI.showInfo('Exporting...');

        startSpinner();

        // setTimeout so spinner has a chance to activate
        setTimeout(async () => {
            const splatDef = splatDefs[0];

            let data;
            let extension;
            switch (format) {
                case 'ply':
                    data = convertPly(splatDef.data, splatDef.element.root.getWorldTransform());
                    extension = '.cleaned.ply';
                    break;
                case 'ply-compressed':
                    data = convertPlyCompressed(splatDef.data, splatDef.element.root.getWorldTransform());
                    extension = '.compressed.ply';
                    break;
                case 'splat':
                    data = convertSplat(splatDef.data, splatDef.element.worldTransform);
                    extension = '.splat';
                    break;
            }

            const filename = `${removeExtension(splatDef.element.asset.file.filename)}${extension}`;

            if (remoteStorageDetails) {
                // write data to remote storage
                await sendToRemoteStorage(filename, data, remoteStorageDetails);
            } else {
                // download file to local machine
                download(filename, data);
            }

            stopSpinner();
            editorUI.showInfo(null);
            lastExportCursor = editHistory.cursor;
        });
    });
}

export { registerEvents };
