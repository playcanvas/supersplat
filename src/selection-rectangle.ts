import type { CameraFrame } from './camera';
import type { CommandContext } from './command-queue';
import { SelectOp } from './edit-ops';
import type { Scene } from './scene';
import type { Splat } from './splat';

type SelectRegion = { y0: number; y1: number; intervals: Uint32Array };

// per-row x-interval tables in render-target pixels for the footprint
// pass: (rowCount + 1) offsets into the same buffer, then (x0, x1) pairs,
// so every row's runs are represented exactly

const packRegion = (py0: number, py1: number, rowRuns: number[][]): SelectRegion => {
    const rows = py1 - py0 + 1;
    const table = rows + 1;
    let total = 0;
    for (const runs of rowRuns) {
        total += runs.length;
    }
    const intervals = new Uint32Array(table + total);
    let cursor = table;
    for (let r = 0; r < rows; r++) {
        intervals[r] = cursor;
        intervals.set(rowRuns[r], cursor);
        cursor += rowRuns[r].length;
    }
    intervals[rows] = cursor;
    return { y0: py0, y1: py1, intervals };
};

const emptyRegion = (): SelectRegion => {
    return packRegion(0, 0, [[]]);
};

const rectRegion = (frame: CameraFrame, x0: number, y0: number, x1: number, y1: number): SelectRegion => {
    const { width, height } = frame.target;
    const py0 = Math.max(0, Math.floor(y0 * height));
    const py1 = Math.min(height - 1, Math.ceil(y1 * height) - 1);
    const px0 = Math.max(0, Math.floor(x0 * width));
    const px1 = Math.min(width - 1, Math.ceil(x1 * width) - 1);
    if (py1 < py0 || px1 < px0) {
        return emptyRegion();
    }
    const rowRuns: number[][] = [];
    for (let r = py0; r <= py1; r++) {
        rowRuns.push([px0, px1]);
    }
    return packRegion(py0, py1, rowRuns);
};

// Produce the op in the caller's slot. Applying it is the caller's commit
// point, so cancellation and stale-view checks can run after GPU readback.
const rectangleOp = async (
    scene: Scene,
    ctx: CommandContext,
    splat: Splat,
    frame: CameraFrame,
    rect: { start: { x: number; y: number }; end: { x: number; y: number } },
    op: 'add' | 'remove' | 'set' | 'intersect',
    depth: boolean,
    footprint: number
) => {
    const x1 = Math.min(rect.start.x, rect.end.x);
    const y1 = Math.min(rect.start.y, rect.end.y);
    const x2 = Math.max(rect.start.x, rect.end.x);
    const y2 = Math.max(rect.start.y, rect.end.y);
    let visible: Set<number>;
    if (depth) {
        const { ids } = await scene.camera.pickIds(ctx, frame, splat, op, footprint, x1, y1, x2 - x1, y2 - y1);
        visible = new Set(ids);
        if (footprint > 0) return new SelectOp(splat, op, new Uint32Array(visible).sort());
    } else if (footprint > 0) {
        const data = await scene.projectedSplatRenderer.footprintIntersect(
            splat,
            rectRegion(frame, x1, y1, x2, y2),
            footprint,
            frame
        );
        return new SelectOp(splat, op, data ?? new Uint32Array());
    }
    const mask = await scene.dataProcessor.intersect({ rect: { x1, y1, x2, y2 } }, splat, frame);
    try {
        if (visible) {
            for (let i = 0; i < splat.instances.count; i++) {
                if (!visible.has(i)) mask[i] = 0;
            }
        }
        return new SelectOp(splat, op, mask);
    } finally {
        scene.dataProcessor.releaseMask(mask);
    }
};

export { packRegion, emptyRegion, rectRegion, rectangleOp };
