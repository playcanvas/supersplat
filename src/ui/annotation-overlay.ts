import { Vec3 } from 'playcanvas';

import { Annotation } from '../annotation-manager';
import { Events } from '../events';
import { Scene } from '../scene';
import deleteSvg from './svg/delete.svg';
import editSvg from './svg/EditIcon.svg';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class AnnotationOverlay {
    private container: HTMLDivElement;
    private events: Events;
    private scene: Scene;
    private annotations: Annotation[] = [];
    private markerGroups: { wrapper: HTMLDivElement, label: HTMLDivElement }[] = [];
    private expandedIndex: number = -1;
    private expandedPopup: HTMLDivElement | null = null;

    // Drag state
    private dragIndex: number = -1;
    private dragDepth: number = 0;
    private dragStartX: number = 0;
    private dragStartY: number = 0;
    private dragActive: boolean = false;
    private dragPointerId: number = -1;

    constructor(events: Events, scene: Scene, parentElement: HTMLElement) {
        this.events = events;
        this.scene = scene;

        // Create overlay container
        this.container = document.createElement('div');
        this.container.id = 'annotation-overlay';
        parentElement.appendChild(this.container);

        // Listen for annotation changes
        events.on('annotations.changed', (annotations: Annotation[]) => {
            this.annotations = annotations.map(a => ({ ...a }));
            this.rebuildMarkers();
            scene.forceRender = true;
        });

        // Update positions on each render
        events.on('prerender', () => {
            this.updatePositions();
        });

        // Close expanded popup when clicking on canvas
        parentElement.addEventListener('pointerdown', (e: PointerEvent) => {
            if (e.target === parentElement.querySelector('canvas')) {
                this.closeExpanded();
            }
        });

        // Drag move/up handlers on document so drag works everywhere
        document.addEventListener('pointermove', (e: PointerEvent) => {
            if (this.dragIndex < 0 || e.pointerId !== this.dragPointerId) return;
            e.preventDefault();
            this.handleDragMove(e);
        });

        document.addEventListener('pointerup', (e: PointerEvent) => {
            this.handleDragEnd(e);
        });
    }

    private rebuildMarkers() {
        // Remove existing markers
        this.markerGroups.forEach(g => g.wrapper.remove());
        this.markerGroups = [];
        this.closeExpanded();

        // Create new markers
        this.annotations.forEach((annotation, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'annotation-marker';
            wrapper.dataset.index = String(index);

            // Stop pointer events from reaching the canvas (but let pointerup bubble to document for drag end)
            ['pointerdown', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
                wrapper.addEventListener(eventName, (event: Event) => event.stopPropagation());
            });

            // Dot (draggable — only the dot starts drag)
            const dot = document.createElement('div');
            dot.className = 'annotation-marker-dot';
            dot.addEventListener('pointerdown', (e: PointerEvent) => {
                e.preventDefault();
                e.stopPropagation();
                this.startDrag(index, e);
            });
            wrapper.appendChild(dot);

            // Compact label
            const label = document.createElement('div');
            label.className = 'annotation-label';
            this.buildCompactLabel(label, annotation, index);
            wrapper.appendChild(label);

            this.container.appendChild(wrapper);
            this.markerGroups.push({ wrapper, label });
        });
    }

    private buildCompactLabel(label: HTMLDivElement, annotation: Annotation, index: number) {
        label.innerHTML = '';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'annotation-label-name';
        nameSpan.textContent = annotation.name;

        // Edit button — pencil icon
        const editBtn = document.createElement('button');
        editBtn.className = 'annotation-label-btn annotation-label-edit';
        editBtn.appendChild(createSvg(editSvg));
        editBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openExpanded(index);
        });

        // Delete button — uses same SVG as views panel
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'annotation-label-btn annotation-label-delete';
        deleteBtn.appendChild(createSvg(deleteSvg));
        deleteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeExpanded();
            this.events.invoke('annotations.remove', index);
        });

        label.appendChild(nameSpan);
        label.appendChild(editBtn);
        label.appendChild(deleteBtn);
    }

    // ── Drag logic ──

    private startDrag(index: number, e: PointerEvent) {
        this.dragIndex = index;
        this.dragActive = false;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragPointerId = e.pointerId;

        // Compute the depth of the annotation in camera space
        const annotation = this.annotations[index];
        const worldPos = new Vec3(annotation.position[0], annotation.position[1], annotation.position[2]);
        const cameraPos = this.scene.camera.mainCamera.getPosition();
        const cameraForward = this.scene.camera.mainCamera.forward;

        const toAnnotation = new Vec3().sub2(worldPos, cameraPos);
        this.dragDepth = toAnnotation.dot(cameraForward);
    }

    private screenToWorldAtDepth(screenX: number, screenY: number): Vec3 | null {
        const cam = this.scene.camera;
        const cameraComponent = cam.camera;

        const nearPoint = new Vec3();
        const farPoint = new Vec3();
        cameraComponent.screenToWorld(screenX, screenY, cameraComponent.nearClip, nearPoint);
        cameraComponent.screenToWorld(screenX, screenY, cameraComponent.farClip, farPoint);

        const rayDir = new Vec3().sub2(farPoint, nearPoint).normalize();
        const cameraPos = cam.mainCamera.getPosition();
        const cameraForward = cam.mainCamera.forward;

        const denom = rayDir.dot(cameraForward);
        if (Math.abs(denom) < 0.0001) return null;

        const t = this.dragDepth / denom;
        return new Vec3().copy(cameraPos).add(new Vec3().copy(rayDir).mulScalar(t));
    }

    private handleDragMove(e: PointerEvent) {
        if (this.dragIndex < 0) return;

        // Require minimum 5px movement before starting actual drag
        if (!this.dragActive) {
            const dx = e.clientX - this.dragStartX;
            const dy = e.clientY - this.dragStartY;
            if (dx * dx + dy * dy < 25) return;
            this.dragActive = true;
            this.closeExpanded();
            document.body.style.cursor = 'grabbing';
        }

        // Move marker DOM directly for smooth visual feedback (no data round-trip)
        const group = this.markerGroups[this.dragIndex];
        if (group) {
            const rect = this.container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            group.wrapper.style.left = `${x}px`;
            group.wrapper.style.top = `${y}px`;
        }
    }

    private handleDragEnd(e: PointerEvent) {
        if (this.dragIndex < 0 || e.pointerId !== this.dragPointerId) return;

        const index = this.dragIndex;
        this.dragIndex = -1;
        this.dragPointerId = -1;

        document.body.style.cursor = '';

        if (!this.dragActive) return;

        // Compute final world position and commit
        const canvasRect = this.scene.canvas.getBoundingClientRect();
        const screenX = e.clientX - canvasRect.left;
        const screenY = e.clientY - canvasRect.top;
        const newWorldPos = this.screenToWorldAtDepth(screenX, screenY);

        if (newWorldPos) {
            this.events.invoke('annotations.setPosition', index, [newWorldPos.x, newWorldPos.y, newWorldPos.z]);
        }
    }

    // ── Expanded edit popup ──

    private openExpanded(index: number) {
        this.closeExpanded();
        this.expandedIndex = index;

        const annotation = this.annotations[index];
        if (!annotation) return;

        const group = this.markerGroups[index];
        if (!group) return;

        const popup = document.createElement('div');
        popup.className = 'annotation-expanded';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'annotation-expanded-title';
        titleInput.value = annotation.name;
        titleInput.placeholder = 'Title';
        titleInput.addEventListener('keydown', (e) => e.stopPropagation());

        const descInput = document.createElement('textarea');
        descInput.className = 'annotation-expanded-desc';
        descInput.value = annotation.description || '';
        descInput.placeholder = 'Enter a description';
        descInput.rows = 3;
        descInput.addEventListener('keydown', (e) => e.stopPropagation());

        const btnRow = document.createElement('div');
        btnRow.className = 'annotation-expanded-buttons';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'annotation-expanded-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeExpanded();
        });

        const okBtn = document.createElement('button');
        okBtn.className = 'annotation-expanded-ok';
        okBtn.textContent = 'OK';
        okBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newName = titleInput.value.trim();
            const newDesc = descInput.value.trim();
            if (newName && newName !== annotation.name) {
                this.events.invoke('annotations.rename', index, newName);
            }
            if (newDesc !== (annotation.description || '')) {
                this.events.invoke('annotations.setDescription', index, newDesc);
            }
            this.closeExpanded();
        });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);

        popup.appendChild(titleInput);
        popup.appendChild(descInput);
        popup.appendChild(btnRow);

        // Stop pointer events on the popup (let pointerup bubble for drag end)
        ['pointerdown', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            popup.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        // Append to marker wrapper so it positions relative to the marker
        group.wrapper.appendChild(popup);
        this.expandedPopup = popup;

        titleInput.focus();
    }

    private closeExpanded() {
        if (this.expandedPopup) {
            this.expandedPopup.remove();
            this.expandedPopup = null;
        }
        this.expandedIndex = -1;
    }

    private updatePositions() {
        const screenPos = new Vec3();

        this.annotations.forEach((annotation, index) => {
            const group = this.markerGroups[index];
            if (!group) return;

            const worldPos = new Vec3(annotation.position[0], annotation.position[1], annotation.position[2]);
            this.scene.camera.worldToScreen(worldPos, screenPos);

            if (screenPos.z > 1) {
                group.wrapper.style.display = 'none';
                return;
            }

            const rect = this.container.getBoundingClientRect();
            const x = screenPos.x * rect.width;
            const y = screenPos.y * rect.height;

            group.wrapper.style.display = '';
            group.wrapper.style.left = `${x}px`;
            group.wrapper.style.top = `${y}px`;
        });
    }
}

export { AnnotationOverlay };
