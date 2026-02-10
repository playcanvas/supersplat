import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { Splat } from '../splat';
import { localize, formatInteger } from './localization';
import { MenuPanel } from './menu-panel';

const getPanelLabel = (panel: string) => {
    if (panel === 'timeline') return localize('status-bar.timeline').toUpperCase();
    if (panel === 'splatData') return localize('status-bar.splat-data').toUpperCase();
    return 'NONE';
};

class StatusBar extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'status-bar'
        };

        super(args);

        // Track the currently active panel
        let activePanel = '';

        // Left section: panel trigger label + menu
        const panelTrigger = new Label({
            class: 'status-bar-panel-trigger',
            text: getPanelLabel(activePanel)
        });

        // Panel toggle logic
        const setActivePanel = (panel: string) => {
            activePanel = panel;
            panelTrigger.text = getPanelLabel(panel);
            events.fire('statusBar.panelChanged', panel || null);
        };

        const panelMenu = new MenuPanel([
            {
                text: 'NONE',
                onSelect: () => setActivePanel('')
            },
            {
                text: localize('status-bar.timeline').toUpperCase(),
                onSelect: () => setActivePanel('timeline')
            },
            {
                text: localize('status-bar.splat-data').toUpperCase(),
                onSelect: () => setActivePanel('splatData')
            }
        ]);

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

        this.append(panelTrigger);
        this.append(panelMenu);
        this.append(statsContainer);

        // Toggle menu on trigger click
        panelTrigger.dom.addEventListener('pointerdown', (event: PointerEvent) => {
            event.stopPropagation();
            if (!panelMenu.hidden) {
                panelMenu.hidden = true;
            } else {
                // Position the menu above the trigger
                const triggerRect = panelTrigger.dom.getBoundingClientRect();
                const parentRect = this.dom.getBoundingClientRect();
                panelMenu.dom.style.left = `${triggerRect.left - parentRect.left}px`;
                panelMenu.dom.style.bottom = `${parentRect.bottom - triggerRect.top + 2}px`;
                panelMenu.dom.style.top = '';
                panelMenu.hidden = false;
            }
        });

        // Close menu on click outside
        window.addEventListener('pointerdown', (event: PointerEvent) => {
            if (!this.dom.contains(event.target as Node)) {
                panelMenu.hidden = true;
            }
        }, true);

        window.addEventListener('pointerup', (event: PointerEvent) => {
            if (!this.dom.contains(event.target as Node)) {
                panelMenu.hidden = true;
            }
        }, true);

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
