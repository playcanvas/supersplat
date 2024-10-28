import {
    path,
    BoundingBox,
    Mat4,
    Texture,
    Vec3,
    Vec4,
} from 'playcanvas';
import { Scene } from './scene';
import { EditHistory } from './edit-history';
import { Splat } from './splat';
import { SelectAllOp, SelectNoneOp, SelectInvertOp, SelectOp, HideSelectionOp, UnhideAllOp, DeleteSelectionOp, ResetOp } from './edit-ops';
import { Events } from './events';
import { PngCompressor } from './png-compressor';

// register for editor and scene events
const registerEditorEvents = (events: Events, editHistory: EditHistory, scene: Scene) => {
    const vec = new Vec3();
    const vec2 = new Vec3();
    const vec4 = new Vec4();
    const mat = new Mat4();
    const aabb = new BoundingBox();

    // get the list of selected splats (currently limited to just a single one)
    const selectedSplats = () => {
        const selected = events.invoke('selection') as Splat;
        return selected?.visible ? [selected] : [];
    };

    let lastExportCursor = 0;

    // add unsaved changes warning message.
    window.addEventListener("beforeunload", function (e) {
        if (!events.invoke('scene.dirty')) {
            // if the undo cursor matches last export, then we have no unsaved changes
            return undefined;
        }

        const msg = 'You have unsaved changes. Are you sure you want to leave?';
        e.returnValue = msg;
        return msg;
    });

    events.on('scene.clear', () => {
        scene.clear();
        editHistory.clear();
        lastExportCursor = 0;
    });

    events.function('scene.dirty', () => {
        return editHistory.cursor !== lastExportCursor;
    });

    events.on('scene.saved', () => {
        lastExportCursor = editHistory.cursor;
    });

    events.on('camera.mode', () => {
        scene.forceRender = true;
    });

    events.on('camera.overlay', () => {
        scene.forceRender = true;
    });

    events.on('camera.splatSize', () => {
        scene.forceRender = true;
    });

    events.on('view.outlineSelection', () => {
        scene.forceRender = true;
    });

    events.on('view.bands', (bands: number) => {
        scene.forceRender = true;
    });

    events.on('camera.bound', () => {
        scene.forceRender = true;
    });

    // grid.visible

    const setGridVisible = (visible: boolean) => {
        if (visible !== scene.grid.visible) {
            scene.grid.visible = visible;
            events.fire('grid.visible', visible);
        }
    };

    events.function('grid.visible', () => {
        return scene.grid.visible;
    });

    events.on('grid.setVisible', (visible: boolean) => {
        setGridVisible(visible);
    });

    events.on('grid.toggleVisible', () => {
        setGridVisible(!scene.grid.visible);
    });

    setGridVisible(scene.config.show.grid);

    // camera.fov

    const setCameraFov = (fov: number) => {
        if (fov !== scene.camera.fov) {
            scene.camera.fov = fov;
            events.fire('camera.fov', scene.camera.fov);
        }
    };

    events.function('camera.fov', () => {
        return scene.camera.fov;
    });

    events.on('camera.setFov', (fov: number) => {
        setCameraFov(fov);
    });

    // camera.bound

    let bound = scene.config.show.bound;

    const setBoundVisible = (visible: boolean) => {
        if (visible !== bound) {
            bound = visible;
            events.fire('camera.bound', bound);
        }
    };

    events.function('camera.bound', () => {
        return bound;
    });

    events.on('camera.setBound', (value: boolean) => {
        setBoundVisible(value);
    });

    events.on('camera.toggleBound', () => {
        setBoundVisible(!events.invoke('camera.bound'));
    });

    // camera.focus

    events.on('camera.focus', () => {
        const splat = selectedSplats()[0];
        if (splat) {
    
            const bound = splat.numSelected > 0 ? splat.selectionBound : splat.localBound;
            vec.copy(bound.center);

            const worldTransform = splat.worldTransform;
            worldTransform.transformPoint(vec, vec);
            worldTransform.getScale(vec2);

            scene.camera.focus({
                focalPoint: vec,
                radius: bound.halfExtents.length() * vec2.x,
                speed: 1
            });
        }
    });

    events.on('camera.reset', () => {
        const { initialAzim, initialElev, initialZoom } = scene.config.controls;
        const x = Math.sin(initialAzim * Math.PI / 180) * Math.cos(initialElev * Math.PI / 180);
        const y =-Math.sin(initialElev * Math.PI / 180);
        const z = Math.cos(initialAzim * Math.PI / 180) * Math.cos(initialElev * Math.PI / 180);
        const zoom = initialZoom;

        scene.camera.setPose(new Vec3(x * zoom, y * zoom, z * zoom), new Vec3(0, 0, 0));
    });

    // handle camera align events
    events.on('camera.align', (axis: string) => {
        switch (axis) {
            case 'px': scene.camera.setAzimElev(90, 0); break;
            case 'py': scene.camera.setAzimElev(0, -90); break;
            case 'pz': scene.camera.setAzimElev(0, 0); break;
            case 'nx': scene.camera.setAzimElev(270, 0); break;
            case 'ny': scene.camera.setAzimElev(0, 90); break;
            case 'nz': scene.camera.setAzimElev(180, 0); break;
        }
    });

    events.on('select.all', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectAllOp(splat));
        });
    });

    events.on('select.none', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectNoneOp(splat));
        });
    });

    events.on('select.invert', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectInvertOp(splat));
        });
    });

    events.on('select.pred', (op, pred: (i: number) => boolean) => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new SelectOp(splat, op, pred));
        });
    });

    const intersectCenters = (splat: Splat, op: 'add'|'remove'|'set', options: any) => {
        const data = scene.dataProcessor.intersect(options, splat);
        const filter = (i: number) => data[i] === 255;
        events.fire('edit.add', new SelectOp(splat, op, filter));
    };

    events.on('select.bySphere', (op: 'add'|'remove'|'set', sphere: number[]) => {
        selectedSplats().forEach((splat) => {
            intersectCenters(splat, op, {
                sphere: { x: sphere[0], y: sphere[1], z: sphere[2], radius: sphere[3] }
            });
        });
    });

    events.on('select.rect', (op: 'add'|'remove'|'set', rect: any) => {
        const mode = events.invoke('camera.mode');

        selectedSplats().forEach((splat) => {
            if (mode === 'centers') {
                intersectCenters(splat, op, {
                    rect: { x1: rect.start.x, y1: rect.start.y, x2: rect.end.x, y2: rect.end.y },
                });
            } else if (mode === 'rings') {
                const { width, height } = scene.targetSize;

                scene.camera.pickPrep(splat);
                const pick = scene.camera.pickRect(
                    Math.floor(rect.start.x * width),
                    Math.floor(rect.start.y * height),
                    Math.floor((rect.end.x - rect.start.x) * width),
                    Math.floor((rect.end.y - rect.start.y) * height)
                );

                const selected = new Set<number>(pick);
                const filter = (i: number) => {
                    return selected.has(i);
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            }
        });
    });

    let maskTexture: Texture = null;

    events.on('select.byMask', (op: 'add'|'remove'|'set', canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) => {
        const mode = events.invoke('camera.mode');

        selectedSplats().forEach((splat) => {
            if (mode === 'centers') {
                // create mask texture
                if (!maskTexture || maskTexture.width !== canvas.width || maskTexture.height !== canvas.height) {
                    if (maskTexture) {
                        maskTexture.destroy();
                    }
                    maskTexture = new Texture(scene.graphicsDevice);
                }
                maskTexture.setSource(canvas);

                intersectCenters(splat, op, {
                    mask: maskTexture
                });
            } else if (mode === 'rings') {
                const mask = context.getImageData(0, 0, canvas.width, canvas.height);

                // calculate mask bound so we limit pixel operations
                let mx0 = mask.width - 1;
                let my0 = mask.height - 1;
                let mx1 = 0;
                let my1 = 0;
                for (let y = 0; y < mask.height; ++y) {
                    for (let x = 0; x < mask.width; ++x) {
                        if (mask.data[(y * mask.width + x) * 4 + 3] === 255) {
                            mx0 = Math.min(mx0, x);
                            my0 = Math.min(my0, y);
                            mx1 = Math.max(mx1, x);
                            my1 = Math.max(my1, y);
                        }
                    }
                }

                const { width, height } = scene.targetSize;
                const px0 = Math.floor(mx0 / mask.width * width);
                const py0 = Math.floor(my0 / mask.height * height);
                const px1 = Math.floor(mx1 / mask.width * width);
                const py1 = Math.floor(my1 / mask.height * height);
                const pw = px1 - px0 + 1;
                const ph = py1 - py0 + 1;

                scene.camera.pickPrep(splat);
                const pick = scene.camera.pickRect(px0, py0, pw, ph);

                const selected = new Set<number>();
                for (let y = 0; y < ph; ++y) {
                    for (let x = 0; x < pw; ++x) {
                        const mx = Math.floor((px0 + x) / width * mask.width);
                        const my = Math.floor((py0 + y) / height * mask.height);
                        if (mask.data[(my * mask.width + mx) * 4] === 255) {
                            selected.add(pick[(ph - y) * pw + x]);
                        }
                    }
                }

                const filter = (i: number) => {
                    return selected.has(i);
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            }
        });
    });

    events.on('select.point', (op: 'add'|'remove'|'set', point: { x: number, y: number }) => {
        const { width, height } = scene.targetSize;
        const mode = events.invoke('camera.mode');

        selectedSplats().forEach((splat) => {
            const splatData = splat.splatData;

            if (mode === 'centers') {
                const x = splatData.getProp('x');
                const y = splatData.getProp('y');
                const z = splatData.getProp('z');

                const splatSize = events.invoke('camera.splatSize');
                const camera = scene.camera.entity.camera;
                const sx = point.x * width;
                const sy = point.y * height;

                // calculate final matrix
                mat.mul2(camera.camera._viewProjMat, splat.worldTransform);

                const filter = (i: number) => {
                    vec4.set(x[i], y[i], z[i], 1.0);
                    mat.transformVec4(vec4, vec4);
                    const px = (vec4.x / vec4.w * 0.5 + 0.5) * width;
                    const py = (-vec4.y / vec4.w * 0.5 + 0.5) * height;
                    return Math.abs(px - sx) < splatSize && Math.abs(py - sy) < splatSize;
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            } else if (mode === 'rings') {
                scene.camera.pickPrep(splat);

                const pickId = scene.camera.pickRect(
                    Math.floor(point.x * width),
                    Math.floor(point.y * height),
                    1, 1
                )[0];

                const filter = (i: number) => {
                    return i === pickId;
                };

                events.fire('edit.add', new SelectOp(splat, op, filter));
            }
        });
    });

    events.on('select.hide', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new HideSelectionOp(splat));
        });
    });

    events.on('select.unhide', () => {
        selectedSplats().forEach((splat) => {
            events.fire('edit.add', new UnhideAllOp(splat));
        });
    });

    events.on('select.delete', () => {
        selectedSplats().forEach((splat) => {
            editHistory.add(new DeleteSelectionOp(splat));
        });
    });

    events.on('scene.reset', () => {
        selectedSplats().forEach((splat) => {
            editHistory.add(new ResetOp(splat));
        });
    });

    const setAllData = (value: boolean) => {
        if (value !== scene.assetLoader.loadAllData) {
            scene.assetLoader.loadAllData = value;
            events.fire('allData', scene.assetLoader.loadAllData);
        }
    };

    events.function('allData', () => {
        return scene.assetLoader.loadAllData;
    });

    events.on('toggleAllData', (value: boolean) => {
        setAllData(!events.invoke('allData'));
    });

    // camera mode

    let activeMode = 'centers';

    const setCameraMode = (mode: string) => {
        if (mode !== activeMode) {
            activeMode = mode;
            events.fire('camera.mode', activeMode);
        }
    };

    events.function('camera.mode', () => {
        return activeMode;
    });

    events.on('camera.setMode', (mode: string) => {
        setCameraMode(mode);
    });

    events.on('camera.toggleMode', () => {
        setCameraMode(events.invoke('camera.mode') === 'centers' ? 'rings' : 'centers');
    });

    // camera overlay

    let cameraOverlay = scene.config.camera.overlay;

    const setCameraOverlay = (enabled: boolean) => {
        if (enabled !== cameraOverlay) {
            cameraOverlay = enabled;
            events.fire('camera.overlay', cameraOverlay);
        }
    };

    events.function('camera.overlay', () => {
        return cameraOverlay;
    });

    events.on('camera.setOverlay', (value: boolean) => {
        setCameraOverlay(value);
    });

    events.on('camera.toggleOverlay', () => {
        setCameraOverlay(!events.invoke('camera.overlay'));
    });

    // splat size

    let splatSize = 2;

    const setSplatSize = (value: number) => {
        if (value !== splatSize) {
            splatSize = value;
            events.fire('camera.splatSize', splatSize);
        }
    };

    events.function('camera.splatSize', () => {
        return splatSize;
    });

    events.on('camera.setSplatSize', (value: number) => {
        setSplatSize(value);
    });

    // outline selection

    let outlineSelection = false;

    const setOutlineSelection = (value: boolean) => {
        if (value !== outlineSelection) {
            outlineSelection = value;
            events.fire('view.outlineSelection', outlineSelection);
        }
    };

    events.function('view.outlineSelection', () => {
        return outlineSelection;
    });

    events.on('view.setOutlineSelection', (value: boolean) => {
        setOutlineSelection(value);
    });

    // view spherical harmonic bands

    let viewBands = scene.config.show.shBands;

    const setViewBands = (value: number) => {
        if (value !== viewBands) {
            viewBands = value;
            events.fire('view.bands', viewBands);
        }
    };

    events.function('view.bands', () => {
        return viewBands;
    });

    events.on('view.setBands', (value: number) => {
        setViewBands(value);
    });

    events.function('camera.getPose', () => {
        const camera = scene.camera;
        const position = camera.entity.getPosition();
        const focalPoint = camera.focalPoint;
        return {
            position: { x: position.x, y: position.y, z: position.z },
            target: { x: focalPoint.x, y: focalPoint.y, z: focalPoint.z }
        };
    });

    events.on('camera.setPose', (pose: { position: Vec3, target: Vec3 }, speed = 1) => {
        scene.camera.setPose(pose.position, pose.target, speed);
    });

    // hack: fire events to initialize UI
    events.fire('camera.fov', scene.camera.fov);
    events.fire('camera.overlay', cameraOverlay);
    events.fire('view.bands', viewBands);

    const replaceExtension = (filename: string, extension: string) => {
        const removeExtension = (filename: string) => {
            return filename.substring(0, filename.length - path.getExtension(filename).length);
        };
        return `${removeExtension(filename)}${extension}`;
    };

    let compressor: PngCompressor;

    events.function('scene.saveScreenshot', async () => {
        events.fire('startSpinner');

        try {
            const texture = scene.camera.entity.camera.renderTarget.colorBuffer;
            await texture.downloadAsync();

            // construct the png compressor
            if (!compressor) {
                compressor = new PngCompressor();
            }

            // @ts-ignore
            const pixels = new Uint8ClampedArray(texture.getSource().buffer.slice());

            // the render buffer contains premultiplied alpha. so apply background color.
            const { r, g, b } = events.invoke('bgClr');
            for (let i = 0; i < pixels.length; i += 4) {
                const a = 255 - pixels[i + 3];
                pixels[i + 0] += r * a;
                pixels[i + 1] += g * a;
                pixels[i + 2] += b * a;
                pixels[i + 3] = 255;
            }

            const arrayBuffer = await compressor.compress(
                new Uint32Array(pixels.buffer),
                texture.width,
                texture.height
            );

            // construct filename
            const filename = replaceExtension(selectedSplats()?.[0]?.filename ?? 'SuperSplat', '.png');

            // download
            const blob = new Blob([arrayBuffer], { type: 'octet/stream' });
            const url = window.URL.createObjectURL(blob);
            const el = document.createElement('a');
            el.download = filename;
            el.href = url;
            el.click();
            window.URL.revokeObjectURL(url);
        } finally {
            events.fire('stopSpinner');
        }
    });
}

export { registerEditorEvents };
