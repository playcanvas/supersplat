import { Container } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';
import { Splat } from '../splat';

interface ControlPointData {
  id: string;
  point: Vec3;
}

let savedSplat: Splat | null = null;
const controlPointElements: { circle: SVGCircleElement; text: SVGTextElement }[] = [];
let controlPointsData: ControlPointData[] = [];

class ControlPointTool {
  activate: () => void;
  deactivate: () => void;
  addControlPoint: (x: number, y: number, z: number, id?: string) => void;
  removeControlPoint: (id: string) => void;
  clearAllControlPoints: () => void;
  syncControlPoints: (points: { id: string; x: number; y: number; z: number }[]) => void;
  pollInterval?: number;

  constructor(events: Events, scene: Scene, parent: HTMLElement, canvasContainer: Container) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('tool-svg');
    svg.id = 'control-point-tool-svg';
    svg.style.pointerEvents = 'none';
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.zIndex = '1000';
    parent.appendChild(svg);

    const updateVisuals = () => {
      const splat = savedSplat;
      if (!splat) return;
      const canvasWidth = canvasContainer.dom.clientWidth;
      const canvasHeight = canvasContainer.dom.clientHeight;

      // Hide all elements first
      controlPointElements.forEach((el) => {
        el.circle.setAttribute('visibility', 'hidden');
        el.text.setAttribute('visibility', 'hidden');
      });

      // Show only as many as we have points
      for (let i = 0; i < controlPointsData.length; i++) {
        if (i >= controlPointElements.length) {
          // Create new element
          const circle = document.createElementNS(svg.namespaceURI, 'circle') as SVGCircleElement;
          circle.setAttribute('r', '8');
          circle.setAttribute('fill', '#ff69b4');
          circle.setAttribute('stroke', '#fff');
          circle.setAttribute('stroke-width', '2');
          circle.setAttribute('visibility', 'hidden');
          svg.appendChild(circle);

          const text = document.createElementNS(svg.namespaceURI, 'text') as SVGTextElement;
          text.setAttribute('fill', '#fff9c4');
          text.setAttribute('stroke', '#000');
          text.setAttribute('stroke-width', '0.5');
          text.setAttribute('font-size', '12');
          text.setAttribute('font-weight', 'bold');
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'central');
          text.setAttribute('visibility', 'hidden');
          svg.appendChild(text);

          controlPointElements.push({ circle, text });
        }

        const p = new Vec3();
        splat.worldTransform.transformPoint(controlPointsData[i].point, p);
        scene.camera.worldToScreen(p, p);
        p.x *= canvasWidth;
        p.y *= canvasHeight;

        if (isNaN(p.x) || isNaN(p.y)) {
          continue;
        }

        const el = controlPointElements[i];
        el.circle.setAttribute('cx', p.x.toString());
        el.circle.setAttribute('cy', p.y.toString());
        el.circle.setAttribute('visibility', 'visible');
        el.text.setAttribute('x', p.x.toString());
        el.text.setAttribute('y', p.y.toString());
        el.text.textContent = (i + 1).toString();
        el.text.setAttribute('visibility', 'visible');
      }
    };

    // Check if all control points have corresponding map markers
    const canAddNewPoint = (): boolean => {
      const storedMarkers = localStorage.getItem('controlPoints');
      let markersCount = 0;

      if (storedMarkers) {
        try {
          const markers = JSON.parse(storedMarkers);
          if (Array.isArray(markers)) {
            markersCount = markers.length;
          }
        } catch (e) {
          return false;
        }
      }

      // Can add new point only if there is an unused marker on map
      return controlPointsData.length < markersCount;
    };

    // Get localized message based on current language
    const getLocalizedMessage = (): string => {
      const lang = localStorage.getItem('i18nextLng') || 'en';
      if (lang.startsWith('uk')) {
        return 'Спочатку поставте маркер на мапі для попередньої точки';
      }
      return 'Place a marker on the map for the previous point first';
    };

    // Show notification in Supersplat UI
    const showNotification = (message?: string) => {
      const text = message || getLocalizedMessage();
      let notification = document.getElementById('control-point-notification');
      if (!notification) {
        notification = document.createElement('div');
        notification.id = 'control-point-notification';
        notification.style.cssText =
          'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#f44336;color:white;padding:12px 24px;border-radius:4px;z-index:10000;font-family:sans-serif;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        document.body.appendChild(notification);
      }
      notification.textContent = text;
      notification.style.display = 'block';

      setTimeout(() => {
        (notification as HTMLElement).style.display = 'none';
      }, 3000);
    };

    const addControlPoint = (x: number, y: number, z: number, id?: string) => {
      const splat = savedSplat;
      if (!splat) {
        console.error('[ControlPoint] No splat selected');
        return;
      }

      if (!canAddNewPoint()) {
        showNotification();
        return;
      }

      const pointId = id || `cp_${Date.now()}_${Math.random()}`;
      const point = new Vec3(x, y, z);
      controlPointsData.push({ id: pointId, point: point });
      splat.controlPoints.push(point);

      updateVisuals();
      scene.forceRender = true;
    };

    const removeControlPoint = (id: string) => {
      const splat = savedSplat;
      if (!splat) {
        console.error('[ControlPoint] No splat selected');
        return;
      }

      const index = controlPointsData.findIndex((p) => p.id === id);
      if (index === -1) {
        return;
      }

      controlPointsData.splice(index, 1);
      splat.controlPoints.splice(index, 1);

      updateVisuals();
      scene.forceRender = true;
    };

    const clearAllControlPoints = () => {
      const splat = savedSplat;
      if (!splat) {
        console.error('[ControlPoint] No splat selected');
        return;
      }

      controlPointsData = [];
      splat.controlPoints = [];

      updateVisuals();
      scene.forceRender = true;
    };

    const syncControlPoints = (points: { id: string; x: number; y: number; z: number }[]) => {
      const splat = savedSplat;
      if (!splat) {
        console.error('[ControlPoint] No splat selected');
        return;
      }

      // Validate that we have enough markers for all points
      const storedMarkers = localStorage.getItem('controlPoints');
      let markersCount = 0;
      if (storedMarkers) {
        try {
          const markers = JSON.parse(storedMarkers);
          if (Array.isArray(markers)) {
            markersCount = markers.length;
          }
        } catch (e) {
          return;
        }
      }

      // Only sync points that have corresponding markers
      const validPoints = points.slice(0, markersCount);
      if (validPoints.length < points.length) {
        console.warn('[ControlPoint] Blocked sync of points without markers');
      }

      controlPointsData = validPoints.map((p) => ({
        id: p.id,
        point: new Vec3(p.x, p.y, p.z),
      }));
      splat.controlPoints = controlPointsData.map((p) => p.point);

      updateVisuals();
      scene.forceRender = true;
    };

    this.addControlPoint = addControlPoint;
    this.removeControlPoint = removeControlPoint;
    this.clearAllControlPoints = clearAllControlPoints;
    this.syncControlPoints = syncControlPoints;

    // --- Highlight measure button when measurement tool is inactive ---
    let isMeasureActive = false;

    const updateMeasureButtonHighlight = () => {
      const measureButton = document.getElementById('bottom-toolbar-measure');
      if (!measureButton) return;
      measureButton.style.boxShadow = isMeasureActive
        ? ''
        : '0 0 0 2px red, 0 0 8px rgba(255,0,0,0.5)';
    };

    events.on('tool.activated', (toolName: string) => {
      isMeasureActive = toolName === 'measure';
      updateMeasureButtonHighlight();
    });

    events.on('tool.deactivated', () => {
      isMeasureActive = false;
      updateMeasureButtonHighlight();
    });

    (window as any)._addControlPoint = addControlPoint;
    (window as any)._removeControlPoint = removeControlPoint;
    (window as any)._clearAllControlPoints = clearAllControlPoints;
    (window as any)._syncControlPoints = syncControlPoints;

    events.on('controlPoint.add', (data: { x: number; y: number; z: number }) => {
      if (data && data.x !== undefined) {
        addControlPoint(data.x, data.y, data.z);
      }
    });

    events.on('controlPoints.sync', (points: { id: string; x: number; y: number; z: number }[]) => {
      syncControlPoints(points);
    });

    events.on('controlPoints.clearAll', () => {
      clearAllControlPoints();
    });

    this.activate = () => {
      // Keep SVG visible
    };

    this.deactivate = () => {
      // Keep SVG visible
    };

    events.on('selection.changed', (selection: Splat) => {
      if (selection) {
        savedSplat = selection;
      } else {
        // Keep saved splat
      }
      updateVisuals();
    });

    events.on('postrender', () => {
      updateVisuals();
    });

    // Load existing points from localStorage on init
    const storedPoints = localStorage.getItem('controlPoints');
    if (storedPoints) {
      try {
        const points = JSON.parse(storedPoints);
        if (Array.isArray(points)) {
          syncControlPoints(points);
        }
      } catch (e) {
        console.error('[ControlPoint] Failed to parse stored points:', e);
      }
    }

    // Listen for storage events to sync control points from wizard
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'controlPoints' && e.newValue) {
        try {
          const points = JSON.parse(e.newValue);
          if (Array.isArray(points)) {
            syncControlPoints(points);
          }
        } catch (err) {
          console.error('[ControlPoint] Failed to parse storage points:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Expose sync function globally for direct calls from wizard
    (window as any)._syncControlPoints = syncControlPoints;
    (window as any)._clearAllControlPoints = clearAllControlPoints;
    (window as any)._addControlPoint = addControlPoint;
    (window as any)._removeControlPoint = removeControlPoint;

    // Check if there are points in localStorage that need to be synced
    const existingPoints = localStorage.getItem('controlPoints');
    if (existingPoints) {
      try {
        const points = JSON.parse(existingPoints);
        if (Array.isArray(points) && points.length > 0) {
          syncControlPoints(points);
        }
      } catch (e) {
        console.error('[ControlPoint] Failed to parse existing points:', e);
      }
    }

    // Poll for changes in localStorage (reliable cross-context communication)
    let lastControlPointsJSON = localStorage.getItem('controlPoints') || '[]';
    setInterval(() => {
      const current = localStorage.getItem('controlPoints') || '[]';
      if (current !== lastControlPointsJSON) {
        try {
          const points = JSON.parse(current);
          if (Array.isArray(points)) {
            syncControlPoints(points);
          }
        } catch (e) {
          console.error('[ControlPoint] Failed to parse points from poll:', e);
        }
        lastControlPointsJSON = current;
      }
      updateMeasureButtonHighlight();
    }, 500); // Check every 500ms

    // Initial render
    updateVisuals();
  }
}

export { ControlPointTool };
