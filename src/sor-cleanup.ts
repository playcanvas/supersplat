import { Vec3 } from 'playcanvas';

import { ProcessingManager } from './processing-utils';
import { Splat } from './splat';
import { State } from './splat-state';
import { SORCleanupOptions } from './ui/sor-cleanup-dialog';

interface SORResult {
    outlierIndices: number[];
    totalProcessed: number;
    totalOutliers: number;
}

// K-D Tree node for efficient nearest neighbor search
class KDNode {
    point: Vec3;
    index: number;
    left: KDNode | null = null;
    right: KDNode | null = null;
    axis: number;

    constructor(point: Vec3, index: number, axis: number) {
        this.point = point;
        this.index = index;
        this.axis = axis;
    }
}

// Simple K-D Tree implementation for 3D nearest neighbor search
class KDTree {
    root: KDNode | null = null;
    points: Vec3[];

    constructor(points: Vec3[]) {
        this.points = points;
        const pointsWithIndices = points.map((point, index) => ({ point, index }));
        this.root = this.buildTree(pointsWithIndices, 0);
    }

    private buildTree(points: { point: Vec3; index: number }[], depth: number): KDNode | null {
        if (points.length === 0) return null;

        const axis = depth % 3;
        points.sort((a, b) => {
            const aVal = axis === 0 ? a.point.x : axis === 1 ? a.point.y : a.point.z;
            const bVal = axis === 0 ? b.point.x : axis === 1 ? b.point.y : b.point.z;
            return aVal - bVal;
        });

        const median = Math.floor(points.length / 2);
        const node = new KDNode(points[median].point, points[median].index, axis);

        node.left = this.buildTree(points.slice(0, median), depth + 1);
        node.right = this.buildTree(points.slice(median + 1), depth + 1);

        return node;
    }

    findKNearest(target: Vec3, k: number, excludeIndex: number = -1): { point: Vec3; index: number; distance: number }[] {
        const best: { point: Vec3; index: number; distance: number }[] = [];

        this.searchKNN(this.root, target, k, best, excludeIndex);

        return best.sort((a, b) => a.distance - b.distance).slice(0, k);
    }

    private searchKNN(
        node: KDNode | null,
        target: Vec3,
        k: number,
        best: { point: Vec3; index: number; distance: number }[],
        excludeIndex: number,
        depth: number = 0
    ): void {
        if (!node) return;

        const axis = depth % 3;
        const targetVal = axis === 0 ? target.x : axis === 1 ? target.y : target.z;
        const nodeVal = axis === 0 ? node.point.x : axis === 1 ? node.point.y : node.point.z;

        // Calculate distance to current node
        if (node.index !== excludeIndex) {
            const distance = target.distance(node.point);

            if (best.length < k) {
                best.push({ point: node.point, index: node.index, distance });
            } else if (distance < best[best.length - 1].distance) {
                best[best.length - 1] = { point: node.point, index: node.index, distance };
                best.sort((a, b) => a.distance - b.distance);
            }
        }

        // Determine which side to search first
        const nearSide = targetVal < nodeVal ? node.left : node.right;
        const farSide = targetVal < nodeVal ? node.right : node.left;

        // Search the near side first
        this.searchKNN(nearSide, target, k, best, excludeIndex, depth + 1);

        // Check if we need to search the far side
        if (best.length < k || Math.abs(targetVal - nodeVal) < best[best.length - 1].distance) {
            this.searchKNN(farSide, target, k, best, excludeIndex, depth + 1);
        }
    }
}

/**
 * Perform Statistical Outlier Removal (SOR) on a splat
 * Based on the algorithm used in Open3D and PointNuker
 */
export class SORCleanup {
    /**
     * Identify statistical outliers in point cloud data
     * @param {Splat} splat - The splat to process
     * @param {SORCleanupOptions} options - SOR parameters
     * @returns {Promise<SORResult>} Result containing outlier indices and statistics
     */
    static async identifyOutliers(splat: Splat, options: SORCleanupOptions): Promise<SORResult> {
        const { nbNeighbors, stdRatio, mode } = options;
        const splatData = splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        const numSplats = splatData.numSplats;

        // Get world-space positions using the existing data processor
        const positionsData = splat.scene.dataProcessor.calcPositions(splat);
        const positions: Vec3[] = [];
        const validIndices: number[] = [];

        // Extract valid points based on mode and current state
        // NOTE: Locked splats are INCLUDED in calculations to help determine outliers,
        // but will be protected from being marked as outliers themselves
        for (let i = 0; i < numSplats; i++) {
            const currentState = state[i];

            // Skip deleted points
            if (currentState & State.deleted) continue;

            // Filter based on mode (include locked splats in calculations)
            const isSelected = currentState & State.selected;
            const isLocked = currentState & State.locked;

            if (mode === 'selection' && !isSelected && !isLocked) continue;
            if (mode === 'all' || isSelected || isLocked) {
                const x = positionsData[i * 4];
                const y = positionsData[i * 4 + 1];
                const z = positionsData[i * 4 + 2];

                // Skip invalid positions
                if (isFinite(x) && isFinite(y) && isFinite(z)) {
                    positions.push(new Vec3(x, y, z));
                    validIndices.push(i);
                }
            }
        }

        if (positions.length < nbNeighbors + 1) {
            // Not enough points to perform SOR
            return {
                outlierIndices: [],
                totalProcessed: positions.length,
                totalOutliers: 0
            };
        }

        // Build KD-tree for efficient nearest neighbor search
        const kdTree = new KDTree(positions);

        // Calculate distances to neighbors for each point
        const meanDistances: number[] = [];

        for (let i = 0; i < positions.length; i++) {
            const currentPoint = positions[i];
            const originalIndex = validIndices[i];

            // Yield every 500 iterations to prevent page unresponsive warnings
            if (i % 500 === 0 && i > 0) {
                await ProcessingManager.yieldToUI();
            }

            // Find k nearest neighbors (excluding the point itself)
            const neighbors = kdTree.findKNearest(currentPoint, nbNeighbors, i);

            if (neighbors.length === 0) {
                meanDistances.push(0);
                continue;
            }

            // Calculate mean distance to neighbors
            const totalDistance = neighbors.reduce((sum, neighbor) => sum + neighbor.distance, 0);
            const meanDistance = totalDistance / neighbors.length;
            meanDistances.push(meanDistance);
        }

        // Calculate global mean and standard deviation of distances
        const globalMean = meanDistances.reduce((sum, dist) => sum + dist, 0) / meanDistances.length;

        let variance = 0;
        for (const dist of meanDistances) {
            variance += (dist - globalMean) * (dist - globalMean);
        }
        variance /= meanDistances.length;
        const stdDev = Math.sqrt(variance);

        // Identify outliers (but protect locked splats)
        const threshold = globalMean + stdRatio * stdDev;
        const outlierIndices: number[] = [];

        for (let i = 0; i < meanDistances.length; i++) {
            if (meanDistances[i] > threshold) {
                const originalIndex = validIndices[i];
                const currentState = state[originalIndex];

                // Protect locked splats - they help with calculations but can't be outliers
                if (!(currentState & State.locked)) {
                    outlierIndices.push(originalIndex);
                }
            }
        }

        return {
            outlierIndices,
            totalProcessed: positions.length,
            totalOutliers: outlierIndices.length
        };
    }

    /**
     * Preview outliers by temporarily marking them with outlier state
     * @param {Splat} splat - The splat to preview
     * @param {SORCleanupOptions} options - SOR parameters
     * @returns {Promise<SORResult>} Result containing outlier indices and statistics
     */
    static async previewOutliers(splat: Splat, options: SORCleanupOptions): Promise<SORResult> {
        // First, clear any existing preview outliers
        this.clearPreview(splat);

        const result = await this.identifyOutliers(splat, options);

        if (result.outlierIndices.length > 0) {
            const state = splat.splatData.getProp('state') as Uint8Array;

            // Mark outliers with outlier state for preview (no need to store original states)
            for (const index of result.outlierIndices) {
                if (!(state[index] & State.deleted)) {
                    state[index] |= State.outlier;
                }
            }

            splat.updateState(State.outlier);

            // Store the preview outlier indices
            splat.sorPreviewOutliers = new Set(result.outlierIndices);
        }

        return result;
    }

    /**
     * Clear preview by removing outlier state from preview points
     * @param {Splat} splat - The splat to clear preview for
     */
    static clearPreview(splat: Splat): void {
        const state = splat.splatData.getProp('state') as Uint8Array;
        let modified = false;

        // Clear outlier state from preview outliers
        if (splat.sorPreviewOutliers) {
            for (const index of splat.sorPreviewOutliers) {
                if (!(state[index] & State.deleted) && (state[index] & State.outlier)) {
                    state[index] &= ~State.outlier;
                    modified = true;
                }
            }
            delete splat.sorPreviewOutliers;
        }

        // Clean up legacy data if it exists
        if (splat.sorOriginalStates) {
            delete splat.sorOriginalStates;
        }

        if (modified) {
            splat.updateState(State.outlier);
        }
    }

    /**
     * Apply SOR cleanup by marking outliers as deleted
     * @param {Splat} splat - The splat to clean up
     * @param {SORCleanupOptions} options - SOR parameters
     * @returns {Promise<number[]>} Array of indices that were marked as deleted
     */
    static async applyCleanup(splat: Splat, options: SORCleanupOptions): Promise<number[]> {
        const result = await this.identifyOutliers(splat, options);

        if (result.outlierIndices.length > 0) {
            const state = splat.splatData.getProp('state') as Uint8Array;

            // Mark outliers as deleted (with additional locked protection)
            for (const index of result.outlierIndices) {
                if (!(state[index] & State.deleted) && !(state[index] & State.locked)) {
                    state[index] |= State.deleted;
                }
            }

            splat.updateState(State.deleted);
        }

        return result.outlierIndices;
    }
}
