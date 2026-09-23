import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { Mat4, Quat, Vec3 } from 'playcanvas';
import ts from 'typescript';

// Use the project's TypeScript dependency without adding a test runner or
// writing generated modules into the checkout.
const moduleUrl = async (file, imports = {}) => {
    let source = await readFile(new URL(file, import.meta.url), 'utf8');
    for (const [name, url] of Object.entries({ playcanvas: import.meta.resolve('playcanvas'), ...imports })) {
        source = source.replaceAll(`'${name}'`, JSON.stringify(url));
    }
    const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const transformUrl = await moduleUrl('../src/transform.ts');
const { Transform } = await import(transformUrl);
const { alignVertical } = await import(await moduleUrl('../src/tools/vertical-alignment.ts', { '../transform': transformUrl }));

const near = (a, b, epsilon = 1e-6) => assert.ok(a.distance(b) < epsilon, `${a.toString()} != ${b.toString()}`);
const matrix = t => new Mat4().setTRS(t.position, t.rotation, t.scale);
const direction = (t, top, bottom) => matrix(t).transformVector(top.clone().sub(bottom)).normalize();
const top = new Vec3(1, 4, 2);
const bottom = new Vec3(1, -1, 2);
const pivot = new Vec3(3, 1, -2);

for (const angle of [0, 35, 45, 70, 90, 180]) {
    test(`aligns a ${angle} degree tilt with world up without changing scale or pivot`, () => {
        const baseline = new Transform(new Vec3(-2, 3, 5), new Quat().setFromEulerAngles(13, 47, angle), new Vec3(2, 3, 0.5));
        const oldMatrix = matrix(baseline);
        const localPivot = new Mat4().invert(oldMatrix).transformPoint(pivot);
        const aligned = alignVertical(baseline, pivot, top, bottom);
        assert.ok(aligned);
        near(direction(aligned, top, bottom), Vec3.UP);
        near(matrix(aligned).transformPoint(localPivot), pivot, 1e-5);
        near(aligned.scale, baseline.scale);
        const before = baseline.rotation.transformVector(Vec3.BACK);
        const after = aligned.rotation.transformVector(Vec3.BACK);
        const headingDelta = Math.atan2(before.x, before.z) - Math.atan2(after.x, after.z);
        assert.ok(Math.abs(Math.sin(headingDelta)) < 1e-6);
    });
}

test('flip uses a rigid rotation, preserves distances, and flips back exactly', () => {
    const baseline = new Transform(new Vec3(2, -4, 7), new Quat().setFromEulerAngles(40, 75, 55), new Vec3(2, 0.5, 3));
    const aligned = alignVertical(baseline, pivot, top, bottom);
    const flipped = alignVertical(baseline, pivot, top, bottom, true);
    const restored = alignVertical(baseline, pivot, top, bottom, false);
    near(direction(flipped, top, bottom), Vec3.DOWN);
    const oldLength = matrix(baseline).transformPoint(top).distance(matrix(baseline).transformPoint(bottom));
    const newLength = matrix(flipped).transformPoint(top).distance(matrix(flipped).transformPoint(bottom));
    assert.ok(Math.abs(oldLength - newLength) < 1e-5);
    assert.ok(aligned.equals(restored));
    near(flipped.scale, baseline.scale);
});

test('handles a model heading at its vertical pole', () => {
    const baseline = new Transform(Vec3.ZERO, new Quat().setFromEulerAngles(90, 0, 0), Vec3.ONE);
    const aligned = alignVertical(baseline, pivot, top, bottom);
    near(direction(aligned, top, bottom), Vec3.UP);
    assert.ok([aligned.rotation.x, aligned.rotation.y, aligned.rotation.z, aligned.rotation.w].every(Number.isFinite));
});

test('uses actual endpoints rather than a model axis, including mirrored scale', () => {
    const a = new Vec3(4, 7, -2);
    const b = new Vec3(-3, 1, 5);
    const baseline = new Transform(Vec3.ZERO, new Quat().setFromEulerAngles(10, 40, 70), new Vec3(-2, 3, 1));
    const aligned = alignVertical(baseline, pivot, a, b);
    near(direction(aligned, a, b), Vec3.UP);
    near(aligned.scale, baseline.scale);
});

test('rejects coincident or non-finite points without changing the baseline', () => {
    const baseline = new Transform();
    const saved = baseline.clone();
    assert.equal(alignVertical(baseline, pivot, top, top), null);
    assert.equal(alignVertical(baseline, pivot, new Vec3(NaN, 0, 0), bottom), null);
    assert.equal(alignVertical(baseline, pivot, new Vec3(0, Infinity, 0), bottom), null);
    assert.ok(baseline.equals(saved));
});
