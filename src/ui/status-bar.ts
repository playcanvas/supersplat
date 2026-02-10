import { Button, Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { Splat } from '../splat';
import { localize, formatInteger } from './localization';

class StatusBar extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'status-bar'
        };

        super(args);

        // Track the currently active panel
        let activePanel = '';

        // Toggle buttons for panels
        const timelineButton = new Button({
            class: 'status-bar-toggle',
            text: localize('status-bar.timeline').toUpperCase()
        });

        const splatDataButton = new Button({
            class: 'status-bar-toggle',
            text: localize('status-bar.splat-data').toUpperCase()
        });

        // Panel toggle logic
        const setActivePanel = (panel: string) => {
            activePanel = panel;
            timelineButton.dom.classList[panel === 'timeline' ? 'add' : 'remove']('active');
            splatDataButton.dom.classList[panel === 'splatData' ? 'add' : 'remove']('active');
            events.fire('statusBar.panelChanged', panel || null);
        };

        timelineButton.on('click', () => {
            setActivePanel(activePanel === 'timeline' ? '' : 'timeline');
        });

        splatDataButton.on('click', () => {
            setActivePanel(activePanel === 'splatData' ? '' : 'splatData');
        });

        // Right section: stats
        const statsContainer = new Container({
            class: 'status-bar-stats'
        });

        const createStat = (labelText: string) => {
            const container = new Container({
                class: 'status-bar-stat'
            });
            const label = new Label({
                class: 'status-bar-stat-label',
                text: labelText
            });
            const value = new Label({
                class: 'status-bar-stat-value',
                text: '0'
            });
            container.append(label);
            container.append(value);
            statsContainer.append(container);
            return value;
        };

        const splatsValue = createStat(localize('status-bar.splats'));
        const selectedValue = createStat(localize('status-bar.selected'));
        const lockedValue = createStat(localize('status-bar.locked'));
        const deletedValue = createStat(localize('status-bar.deleted'));

        this.append(timelineButton);
        this.append(splatDataButton);
        this.append(statsContainer);

        // Handle keyboard shortcuts for panel toggles
        events.on('dataPanel.toggle', () => {
            setActivePanel(activePanel === 'splatData' ? '' : 'splatData');
        });

        events.on('timelinePanel.toggle', () => {
            setActivePanel(activePanel === 'timeline' ? '' : 'timeline');
        });

        // Update stats from splat state
        let splat: Splat;

        const updateStats = () => {
            if (!splat) return;
            const state = splat.splatData.getProp('state') as Uint8Array;
            if (state) {
                splatsValue.text = formatInteger(state.length - splat.numDeleted);
                selectedValue.text = formatInteger(splat.numSelected);
                lockedValue.text = formatInteger(splat.numLocked);
                deletedValue.text = formatInteger(splat.numDeleted);
            }
        };

        events.on('splat.stateChanged', (splat_: Splat) => {
            splat = splat_;
            updateStats();
        });

        events.on('selection.changed', (selection: Element) => {
            if (selection instanceof Splat) {
                splat = selection;
                updateStats();
            }
        });
    }
}

export { StatusBar };
