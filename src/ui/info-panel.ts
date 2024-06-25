import { Container } from 'pcui';
import { Events } from '../events';
import { Splat } from '../splat';
import { Histogram } from './histogram';

class InfoPanel extends Container {
    constructor(events: Events, args = { }) {
        args = Object.assign(args, {
            id: 'info-panel-container'
        });

        super(args);

        const histogram = new Histogram(512, 256);

        this.dom.appendChild(histogram.canvas);

        events.on('splat.stateChanged', (splat: Splat) => {
            const state = splat.splatData.getProp('scale_0');
            if (state) {
                histogram.update(state, (v) => Math.exp(v));
            }
        });
    }
}

export { InfoPanel };
