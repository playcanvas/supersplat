import { Container, ContainerArgs, Label } from '@playcanvas/pcui';
import { Quat, Vec3 } from 'playcanvas';

import { alignColumns, makeEditable, parseNumbers } from './editable-text';
import { Events } from '../events';
import { i18n } from './localization';
import { Pivot } from '../pivot';

const v = new Vec3();

// fixed decimals so columns line up; avoids "-0.00"
const fixed = (n: number, decimals: number) => {
    const s = n.toFixed(decimals);
    return parseFloat(s) === 0 ? (0).toFixed(decimals) : s;
};

class Transform extends Container {
    constructor(events: Events, args: ContainerArgs = {}) {
        args = {
            ...args,
            id: 'transform'
        };

        super(args);

        // one label per line of the values block
        const labels = new Container({
            class: 'transform-labels'
        });

        ['position', 'rotation', 'scale'].forEach((key) => {
            const label = new Label({
                class: 'transform-label'
            });
            i18n.bindText(label, `panel.scene.transform.${key}`);
            labels.append(label);
        });

        // position, rotation and scale as a single editable text block so the
        // whole transform can be selected, copied and pasted
        const values = new Label({
            class: 'transform-values'
        });

        this.append(labels);
        this.append(values);

        // the panel shows the pivot in world coordinates. with a user-defined
        // local frame set (see Splat.getPivot), the pivot is that frame, so
        // zeroing the values aligns the frame with the world origin and axes
        const editable = makeEditable(values.dom, (text) => {
            const n = parseNumbers(text, 7);
            if (!n) {
                return false;
            }

            const p = new Vec3(n[0], n[1], n[2]);
            const q = new Quat().setFromEulerAngles(n[3], n[4], n[5]);
            const s = Math.min(10000, Math.max(0.001, n[6]));

            if (q.w < 0) {
                q.mulScalar(-1);
            }

            const pivot = events.invoke('pivot') as Pivot;
            pivot.start();
            pivot.moveTRS(p, q, new Vec3(s, s, s));
            pivot.end();

            return true;
        });

        const updateUI = (pivot: Pivot) => {
            const { position, rotation, scale } = pivot.transform;
            rotation.getEulerAngles(v);

            editable.update(alignColumns([
                [fixed(position.x, 3), fixed(position.y, 3), fixed(position.z, 3)],
                [fixed(v.x, 3), fixed(v.y, 3), fixed(v.z, 3)],
                [fixed(scale.x, 3)]
            ]), alignColumns([
                [`${position.x}`, `${position.y}`, `${position.z}`],
                [`${v.x}`, `${v.y}`, `${v.z}`],
                [`${scale.x}`]
            ]));
        };

        // toggle ui availability based on selection
        events.on('selection.changed', (selection) => {
            values.dom.setAttribute('contenteditable', selection ? 'plaintext-only' : 'false');
            values.enabled = !!selection;
        });

        events.on('pivot.placed', updateUI);
        events.on('pivot.moved', updateUI);
        events.on('pivot.ended', updateUI);
    }
}

export { Transform };
