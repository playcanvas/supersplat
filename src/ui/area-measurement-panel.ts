import { Button, Container, Label, Panel } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { AreaMeasurementData } from '../area-measurement-tool';
import { Events } from '../events';

class AreaMeasurementPanel extends Panel {
    private events: Events;
    private pointsContainer: Container;
    private edgesContainer: Container;
    private breaklinesContainer: Container;
    private areaLabel: Label;
    private planarityLabel: Label;
    private splitResultLabel: Label;
    private clearBtn: Button;
    private closeBtn: Button;
    private exitBtn: Button;
    private breaklineToggleBtn: Button;
    private exportBtn: Button;
    private visible = false;
    private splitMode = false;
    private lastData: AreaMeasurementData | null = null;

    constructor(events: Events) {
        super({
            id: 'area-measurement-panel',
            class: ['measurement-panel', 'area-measurement-panel'],
            headerText: 'AREA MEASUREMENT TOOL',
            collapsible: false,
            collapsed: false,
            removable: false
        });
        this.events = events;
        this.pointsContainer = new Container({ class: 'area-points-container' });
        this.edgesContainer = new Container({ class: 'area-edges-container' });
        this.areaLabel = new Label({ text: 'Area: ---', class: 'measurement-value' });
        this.planarityLabel = new Label({ text: '', class: 'measurement-value' });
        this.splitResultLabel = new Label({ text: '', class: 'measurement-value' });
        this.clearBtn = new Button({ text: 'Clear', size: 'small' });
        this.breaklinesContainer = new Container({ class: 'area-breaklines' });
        this.closeBtn = new Button({ text: 'Close Polygon', size: 'small' });
        this.exitBtn = new Button({ text: 'Close', size: 'small' });
        this.breaklineToggleBtn = new Button({ text: 'Start Breaklines', size: 'small' });
        this.exportBtn = new Button({ text: 'EXPORT', size: 'small' });

        // Layout: narrower panel + scrollable lists
        (this.dom as HTMLElement).style.maxWidth = '410px';
        (this.dom as HTMLElement).style.width = '410px';
        (this.pointsContainer.dom as HTMLElement).style.maxHeight = '260px';
        (this.pointsContainer.dom as HTMLElement).style.overflowY = 'auto';
        (this.pointsContainer.dom as HTMLElement).style.paddingRight = '4px';
        (this.edgesContainer.dom as HTMLElement).style.maxHeight = '140px';
        (this.edgesContainer.dom as HTMLElement).style.overflowY = 'auto';
        (this.edgesContainer.dom as HTMLElement).style.paddingRight = '4px';
        (this.breaklinesContainer.dom as HTMLElement).style.maxHeight = '550px';
        (this.breaklinesContainer.dom as HTMLElement).style.overflowY = 'auto';
        (this.breaklinesContainer.dom as HTMLElement).style.paddingRight = '4px';
        (this.breaklinesContainer.dom as HTMLElement).style.display = 'flex';
        (this.breaklinesContainer.dom as HTMLElement).style.flexDirection = 'column';

        // Bind actions robustly (both PCUI and raw DOM)
        const bindBtn = (btn: Button, action: () => void) => {
            btn.on('click', action);
            const handler = (e: Event) => {
                e.preventDefault(); e.stopPropagation(); action();
            };
            btn.dom.addEventListener('click', handler, true);
            btn.dom.addEventListener('pointerdown', handler, true);
        };
        bindBtn(this.clearBtn, () => {
            this.events.fire('area.measure.disable.temporary');
            // reset split UI immediately for clarity
            if (this.splitMode) {
                this.splitMode = false;
                this.updateSplitButtons();
            }
            this.breaklineToggleBtn.text = 'Start Breaklines';
            this.events.fire('area.measure.breakline.stop');
            this.events.fire('area.measure.split.cancel');
            this.events.fire('area.measure.clear');
        });
        bindBtn(this.closeBtn, () => {
            this.events.fire('area.measure.disable.temporary'); this.events.fire('area.measure.closePolygon');
        });
        bindBtn(this.exitBtn, () => {
            this.events.fire('area.measure.disable.temporary'); this.events.fire('area.measure.exit');
        });
        bindBtn(this.exportBtn, () => {
            this.exportData();
        });
        // Single toggle to add breaklines continuously
        this.breaklineToggleBtn.on('click', () => {
            this.events.fire('area.measure.disable.temporary');
            this.splitMode = !this.splitMode;
            if (this.splitMode) {
                this.breaklineToggleBtn.text = 'Stop Breaklines';
                this.events.fire('area.measure.breakline.start');
            } else {
                this.breaklineToggleBtn.text = 'Start Breaklines';
                this.events.fire('area.measure.breakline.stop');
            }
            this.updateSplitButtons();
            if (this.lastData) this.update(this.lastData);
        });

        const instructions = new Label({ text: 'Click to add points. Press "Close Polygon" to close the polygon.', class: 'measurement-instructions' });

        const breaklineButtons = new Container({ class: 'measurement-buttons' });
        const addBreaklineBtn = new Button({ text: 'Add Breakline', size: 'small' });
        const undoBreaklineBtn = new Button({ text: 'Undo Breakline', size: 'small' });
        const clearBreaklinesBtn = new Button({ text: 'Clear Breaklines', size: 'small' });
        breaklineButtons.append(addBreaklineBtn);
        breaklineButtons.append(undoBreaklineBtn);
        breaklineButtons.append(clearBreaklinesBtn);
        breaklineButtons.append(this.exportBtn);
        // Toggle auto-add mode on Add Breakline
        let addingAuto = false;
        addBreaklineBtn.on('click', () => {
            this.events.fire('area.measure.disable.temporary');
            if (!this.splitMode) {
                this.splitMode = true;
                this.updateSplitButtons();
            }
            addingAuto = !addingAuto;
            if (addingAuto) {
                addBreaklineBtn.text = 'Stop Adding';
                this.events.fire('area.measure.breakline.start');
            } else {
                addBreaklineBtn.text = 'Add Breakline';
                this.events.fire('area.measure.breakline.stop');
            }
        });
        undoBreaklineBtn.on('click', () => {
            this.events.fire('area.measure.disable.temporary'); this.events.fire('area.measure.split.undo');
        });
        clearBreaklinesBtn.on('click', () => {
            this.events.fire('area.measure.disable.temporary'); this.events.fire('area.measure.split.clearAll');
        });

        const buttons = new Container({ class: 'measurement-buttons' });
        buttons.append(this.clearBtn);
        buttons.append(this.closeBtn);
        buttons.append(this.breaklineToggleBtn);
        buttons.append(this.exitBtn);

        this.append(instructions);
        // prevent panel clicks from reaching canvas without blocking child controls
        // use non-capturing listeners so target (buttons) still receive the event
        (this.dom as HTMLElement).addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        }, false);
        (this.dom as HTMLElement).addEventListener('click', (e) => {
            e.stopPropagation();
        }, false);
        this.append(this.pointsContainer);
        this.append(this.edgesContainer);
        this.append(this.areaLabel);
        this.append(this.planarityLabel);
        this.append(this.splitResultLabel);
        this.append(this.breaklinesContainer);
        this.append(breaklineButtons);
        this.append(buttons);

        this.dom.style.display = 'none';

        this.events.on('area.measure.updated', (data: AreaMeasurementData) => this.update(data));
        this.events.on('area.measure.show', () => this.show());
        this.events.on('area.measure.hide', () => this.hide());
        this.events.on('area.measure.show', () => this.show());
        // keep a copy of last data to force immediate re-render when toggling
        this.events.on('area.measure.updated', (d: AreaMeasurementData) => {
            this.lastData = d;
        });
        // keep UI split mode in sync if tool cancels split (e.g., after clear)
        this.events.on('area.measure.split.cancel', () => {
            if (this.splitMode) {
                this.splitMode = false;
                this.breaklineToggleBtn.text = 'Start Breaklines';
                this.updateSplitButtons();
                this.splitResultLabel.text = '';
                if (this.lastData) this.update(this.lastData);
            }
        });
        this.events.on('area.measure.breakline.stop', () => {
            if (this.splitMode) {
                this.splitMode = false;
                this.breaklineToggleBtn.text = 'Start Breaklines';
                this.updateSplitButtons();
                if (this.lastData) this.update(this.lastData);
            }
        });
    }

    private makePointRow(idx: number, p: Vec3, used: Set<number>, selected: Set<number>) {
        const row = new Container({ class: 'measurement-row' });
        const label = new Label({ text: `P${idx + 1}: ${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}`, class: 'measurement-value' });
        const redo = new Button({ text: 'Redo', size: 'small' });
        const pick = new Button({ text: 'Pick', size: 'small' });
        const doRedo = () => {
            this.events.fire('area.measure.disable.temporary');
            this.events.fire('area.measure.redo', idx);
        };
        const doPick = () => {
            if (!this.splitMode) return;
            this.events.fire('area.measure.disable.temporary');
            this.events.fire('area.measure.split.select', idx);
        };
        redo.on('click', doRedo);
        pick.on('click', doPick);
        // color-code Pick button: selected -> yellow, used in ridge -> cyan
        if (selected.has(idx)) pick.dom.style.background = '#ffd400';
        else if (used.has(idx)) pick.dom.style.background = '#00bcd4';
        pick.dom.style.color = '#000';
        redo.dom.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation(); doRedo();
        }, true);
        pick.dom.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation(); doPick();
        }, true);
        redo.dom.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
        }, true);
        pick.dom.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
        }, true);
        row.append(label);
        row.append(redo);
        if (this.splitMode) row.append(pick);
        return row;
    }

    private update(data: AreaMeasurementData) {
        // points
        this.pointsContainer.clear();
        const used = new Set((data.breaklines ?? []).flatMap(r => [r.i, r.j]));
        const selected = new Set((data.splitSelection ?? []));
        data.points.forEach((p, i) => this.pointsContainer.append(this.makePointRow(i, p, used, selected)));

        // edges (render as simple labels without boxed container)
        this.edgesContainer.clear();
        data.edges.forEach((e, i) => {
            const lbl = new Label({ text: `L${i + 1}: ${e.length.toFixed(3)}`, class: 'area-edge-label' });
            this.edgesContainer.append(lbl);
        });

        // area
        if (data.area !== null) {
            this.areaLabel.text = `Area: ${data.area.toFixed(3)}`;
        } else {
            this.areaLabel.text = 'Area: ---';
        }

        // planarity
        if (data.nonPlanarity && (data.nonPlanarity.max > 0.2)) {
            this.planarityLabel.text = `Non-planar: max ${data.nonPlanarity.max.toFixed(3)}, rms ${data.nonPlanarity.rms.toFixed(3)}`;
        } else if (data.nonPlanarity) {
            this.planarityLabel.text = `Planarity OK (max ${data.nonPlanarity.max.toFixed(3)})`;
        } else {
            this.planarityLabel.text = '';
        }

        // breaklines list
        this.lastData = data;
        this.breaklinesContainer.clear();
        if (data.breaklines && data.breaklines.length) {
            data.breaklines.forEach((r, idx) => {
                const lbl = new Label({ text: `BL${idx + 1}: P${r.i + 1} ↔ P${r.j + 1}`, class: 'measurement-value' });
                this.breaklinesContainer.append(lbl);
            });
        }
        if (data.surfaces && data.surfaces.length) {
            // Add line break before surfaces if we have breaklines
            if (data.breaklines && data.breaklines.length > 0) {
                const spacer = new Label({ text: '', class: 'measurement-value' });
                this.breaklinesContainer.append(spacer);
            }
            // Add SURFACES header
            const surfacesHeader = new Label({ text: 'SURFACES:', class: 'measurement-value' });
            this.breaklinesContainer.append(surfacesHeader);
            data.surfaces.forEach((s, idx) => {
                // Add S# line first
                const lbl = new Label({ text: `S${idx + 1}: ${s.area.toFixed(3)} (indices ${s.indices.map(i => `P${i + 1}`).join('→')})`, class: 'measurement-value' });
                this.breaklinesContainer.append(lbl);
                // Add non-planar info line after S# line
                if (s.nonPlanarity) {
                    const nonPlanarText = s.nonPlanarity.max > 0.2 ?
                        `Non-planar: max ${s.nonPlanarity.max.toFixed(3)}, rms ${s.nonPlanarity.rms.toFixed(3)}` :
                        `Planarity OK (max ${s.nonPlanarity.max.toFixed(3)})`;
                    const nonPlanarLbl = new Label({ text: nonPlanarText, class: 'measurement-value' });
                    this.breaklinesContainer.append(nonPlanarLbl);
                }
            });
            if (data.surfacesTotal !== null) {
                const sumLbl = new Label({ text: `Surfaces total: ${data.surfacesTotal.toFixed(3)}`, class: 'measurement-value' });
                this.breaklinesContainer.append(sumLbl);
            }
        }

        // split results
        if (data.splitAreas) {
            this.splitResultLabel.text = `Split areas: ${data.splitAreas.a.toFixed(3)} + ${data.splitAreas.b.toFixed(3)} = ${data.splitAreas.total.toFixed(3)}`;
            // leave split mode once we have results
            this.splitMode = false;
            this.updateSplitButtons();
        } else if (this.splitMode) {
            const sel = data.splitSelection || [];
            if (sel.length === 1) this.splitResultLabel.text = `Pick second point (selected P${sel[0] + 1})...`;
            else this.splitResultLabel.text = 'Pick two points to split the polygon...';
        } else {
            this.splitResultLabel.text = '';
        }
    }

    private updateSplitButtons() {
        // currently handled by ridgeToggleBtn label; nothing else to show/hide
    }

    private exportData() {
        if (!this.lastData) return;

        const data = this.lastData;
        const lines: string[] = [];

        // Add header
        lines.push('AREA MEASUREMENT TOOL EXPORT');
        lines.push(`Generated: ${new Date().toLocaleString()}`);
        lines.push('');

        // Add points
        lines.push('POINTS:');
        data.points.forEach((p, i) => {
            lines.push(`P${i + 1}: ${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}`);
        });
        lines.push('');

        // Add edges
        if (data.edges.length > 0) {
            lines.push('EDGES:');
            data.edges.forEach((e, i) => {
                lines.push(`L${i + 1}: ${e.length.toFixed(3)}`);
            });
            lines.push('');
        }

        // Add area
        if (data.area !== null) {
            lines.push(`AREA: ${data.area.toFixed(3)}`);
        } else {
            lines.push('AREA: ---');
        }
        lines.push('');

        // Add planarity
        if (data.nonPlanarity) {
            if (data.nonPlanarity.max > 0.2) {
                lines.push(`NON-PLANAR: max ${data.nonPlanarity.max.toFixed(3)}, rms ${data.nonPlanarity.rms.toFixed(3)}`);
            } else {
                lines.push(`PLANARITY OK (max ${data.nonPlanarity.max.toFixed(3)})`);
            }
            lines.push('');
        }

        // Add breaklines
        if (data.breaklines && data.breaklines.length > 0) {
            lines.push('BREAKLINES:');
            data.breaklines.forEach((r, idx) => {
                lines.push(`BL${idx + 1}: P${r.i + 1} ↔ P${r.j + 1}`);
            });
            lines.push('');
        }

        // Add surfaces with non-planar info
        if (data.surfaces && data.surfaces.length > 0) {
            lines.push('SURFACES:');
            data.surfaces.forEach((s, idx) => {
                // Add surface info first
                lines.push(`S${idx + 1}: ${s.area.toFixed(3)} (indices ${s.indices.map(i => `P${i + 1}`).join('→')})`);
                // Add non-planar info after surface info
                if (s.nonPlanarity) {
                    const nonPlanarText = s.nonPlanarity.max > 0.2 ?
                        `Non-planar: max ${s.nonPlanarity.max.toFixed(3)}, rms ${s.nonPlanarity.rms.toFixed(3)}` :
                        `Planarity OK (max ${s.nonPlanarity.max.toFixed(3)})`;
                    lines.push(nonPlanarText);
                }
            });
            if (data.surfacesTotal !== null) {
                lines.push(`Surfaces total: ${data.surfacesTotal.toFixed(3)}`);
            }
            lines.push('');
        }

        // Add split results
        if (data.splitAreas) {
            lines.push(`SPLIT AREAS: ${data.splitAreas.a.toFixed(3)} + ${data.splitAreas.b.toFixed(3)} = ${data.splitAreas.total.toFixed(3)}`);
            lines.push('');
        }

        // Create and download file
        const content = lines.join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `area_measurement_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }
    show() {
        if (!this.visible) {
            this.visible = true; this.dom.style.display = 'block'; this.updateSplitButtons();
        }
    }
    hide() {
        if (this.visible) {
            this.visible = false;
            this.dom.style.display = 'none';
            // reset breakline/split UI state and notify tool to cancel any split selection
            if (this.splitMode) {
                this.splitMode = false;
                this.updateSplitButtons();
            }
            this.breaklineToggleBtn.text = 'Start Breaklines';
            this.splitResultLabel.text = '';
            this.planarityLabel.text = '';
            this.events.fire('area.measure.breakline.stop');
            this.events.fire('area.measure.split.cancel');
        }
    }
}

export { AreaMeasurementPanel };
