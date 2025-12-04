/**
 * GrassPatch - Single patch of instanced grass blades
 * Uses THREE.InstancedMesh for efficient GPU rendering
 */

import {
    BufferGeometry,
    Box3,
    InstancedBufferAttribute,
    InstancedMesh,
    Material,
    Matrix4,
    Sphere,
    Vector3,
} from 'three';
import { GRASS_CONSTANTS, type PatchState } from './types';

/**
 * Options for creating a GrassPatch
 */
export interface GrassPatchOptions {
    /** Blade geometry to instance */
    geometry: BufferGeometry;
    /** Shader material for rendering */
    material: Material;
    /** Maximum instances this patch can hold */
    maxInstances: number;
}

/**
 * GrassPatch manages a single patch of instanced grass
 *
 * Features:
 * - Uses InstancedMesh with custom instance attributes
 * - Supports dynamic instance count for LOD
 * - Efficient buffer updates via typed arrays
 * - Proper bounding box for frustum culling
 */
export class GrassPatch {
    /** The THREE.js instanced mesh */
    public readonly mesh: InstancedMesh;

    /** Maximum number of instances */
    private readonly maxInstances: number;

    /** Current active instance count */
    private activeInstances: number = 0;


    /** Patch center position */
    private readonly center: Vector3 = new Vector3();

    /** Instance positions buffer (x, y, z per instance) */
    private readonly positionBuffer: Float32Array;

    /** Instance data buffer (rotation, scale, variant, random per instance) */
    private readonly dataBuffer: Float32Array;

    /** Instance position attribute */
    private readonly positionAttribute: InstancedBufferAttribute;

    /** Instance data attribute */
    private readonly dataAttribute: InstancedBufferAttribute;

    /** Current LOD density factor (0-1) */
    private densityFactor: number = 1.0;

    /** Full instance count before LOD reduction */
    private fullInstanceCount: number = 0;

    /** Patch state for lifecycle tracking */
    public state: PatchState;


    /** Identity matrix for instance transforms (position handled in shader) */
    private readonly identityMatrix: Matrix4 = new Matrix4();

    constructor(options: GrassPatchOptions) {
        this.maxInstances = Math.min(
            options.maxInstances,
            GRASS_CONSTANTS.MAX_INSTANCES_PER_PATCH
        );

        // Allocate instance buffers
        this.positionBuffer = new Float32Array(this.maxInstances * 3);
        this.dataBuffer = new Float32Array(this.maxInstances * 4);

        // Create instanced buffer attributes
        this.positionAttribute = new InstancedBufferAttribute(this.positionBuffer, 3);
        this.positionAttribute.setUsage(35048); // THREE.DynamicDrawUsage

        this.dataAttribute = new InstancedBufferAttribute(this.dataBuffer, 4);
        this.dataAttribute.setUsage(35048); // THREE.DynamicDrawUsage

        // Clone geometry to add instance attributes
        const instancedGeometry = options.geometry.clone();
        instancedGeometry.setAttribute('aInstancePosition', this.positionAttribute);
        instancedGeometry.setAttribute('aInstanceData', this.dataAttribute);

        // Create the instanced mesh
        this.mesh = new InstancedMesh(
            instancedGeometry,
            options.material,
            this.maxInstances
        );

        // Set all instance matrices to identity (positioning done in shader)
        for (let i = 0; i < this.maxInstances; i++) {
            this.mesh.setMatrixAt(i, this.identityMatrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;

        // Start with 0 visible instances
        this.mesh.count = 0;
        this.mesh.visible = false;

        // Enable frustum culling (we'll set proper bounds)
        this.mesh.frustumCulled = true;

        // Initialize state
        this.state = {
            chunkX: 0,
            chunkZ: 0,
            lodTier: 0,
            dataLoaded: false,
            generation: 0,
        };
    }

    /**
     * Set instance data from worker results
     * @param positions - Float32Array of world positions (x, y, z per instance)
     * @param data - Float32Array of instance data (rotation, scale, variant, random per instance)
     * @param count - Number of instances
     */
    setInstanceData(positions: Float32Array, data: Float32Array, count: number): void {
        const instanceCount = Math.min(count, this.maxInstances);

        if (instanceCount === 0) {
            this.activeInstances = 0;
            this.fullInstanceCount = 0;
            this.mesh.count = 0;
            this.mesh.visible = false;
            this.state.dataLoaded = true;
            return;
        }

        // Copy position data
        const positionsToCopy = Math.min(positions.length, instanceCount * 3);
        this.positionBuffer.set(positions.subarray(0, positionsToCopy));

        // Copy instance data
        const dataToCopy = Math.min(data.length, instanceCount * 4);
        this.dataBuffer.set(data.subarray(0, dataToCopy));

        // Update counts
        this.fullInstanceCount = instanceCount;
        this.activeInstances = Math.floor(instanceCount * this.densityFactor);

        // Mark attributes for GPU upload
        this.positionAttribute.needsUpdate = true;
        this.dataAttribute.needsUpdate = true;

        // Update mesh
        this.mesh.count = this.activeInstances;
        this.mesh.visible = this.activeInstances > 0;

        // Update bounding volume
        this.updateBounds(positions, instanceCount);

        this.state.dataLoaded = true;
    }

    /**
     * Set the patch center position (for chunk identification)
     */
    setCenter(x: number, z: number): void {
        this.center.set(x, 0, z);
    }

    /**
     * Get the patch center
     */
    getCenter(): Vector3 {
        return this.center;
    }

    /**
     * Set LOD density factor
     * Reduces visible instances without reloading data
     * @param factor - Density multiplier (0-1)
     */
    setDensityFactor(factor: number): void {
        const clampedFactor = Math.max(0, Math.min(1, factor));

        if (clampedFactor === this.densityFactor) {
            return;
        }

        this.densityFactor = clampedFactor;

        // Recalculate visible instance count
        this.activeInstances = Math.floor(this.fullInstanceCount * this.densityFactor);
        this.mesh.count = this.activeInstances;
        this.mesh.visible = this.activeInstances > 0;
    }

    /**
     * Get current density factor
     */
    getDensityFactor(): number {
        return this.densityFactor;
    }

    /**
     * Set visibility
     */
    setVisible(visible: boolean): void {
        this.mesh.visible = visible && this.activeInstances > 0;
    }

    /**
     * Get visibility
     */
    isVisible(): boolean {
        return this.mesh.visible;
    }

    /**
     * Get active instance count
     */
    getInstanceCount(): number {
        return this.activeInstances;
    }

    /**
     * Get full instance count (before LOD reduction)
     */
    getFullInstanceCount(): number {
        return this.fullInstanceCount;
    }

    /**
     * Check if patch has loaded data
     */
    isDataLoaded(): boolean {
        return this.state.dataLoaded;
    }

    /**
     * Update bounding volume for frustum culling
     */
    private updateBounds(positions: Float32Array, count: number): void {
        if (count === 0) {
            return;
        }

        // Calculate bounds from instance positions
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < count; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            maxZ = Math.max(maxZ, z);
        }

        // Add blade height to max Y
        maxY += GRASS_CONSTANTS.HEIGHT_MAX;

        // Set bounding box on geometry
        const geometry = this.mesh.geometry;
        if (!geometry.boundingBox) {
            geometry.boundingBox = new Box3();
        }
        geometry.boundingBox.min.set(minX, minY, minZ);
        geometry.boundingBox.max.set(maxX, maxY, maxZ);

        // Update bounding sphere
        if (!geometry.boundingSphere) {
            geometry.boundingSphere = new Sphere();
        }
        geometry.boundingBox.getBoundingSphere(geometry.boundingSphere);

        // Update center from bounds
        this.center.set(
            (minX + maxX) / 2,
            (minY + maxY) / 2,
            (minZ + maxZ) / 2
        );
    }

    /**
     * Reset patch for reuse (object pooling)
     */
    reset(): void {
        this.activeInstances = 0;
        this.fullInstanceCount = 0;
        this.densityFactor = 1.0;
        this.mesh.count = 0;
        this.mesh.visible = false;
        this.state.dataLoaded = false;
        this.state.generation++;
        this.center.set(0, 0, 0);
    }

    /**
     * Dispose of GPU resources
     */
    dispose(): void {
        this.mesh.geometry.dispose();
        // Note: Material is shared, don't dispose here
        this.mesh.dispose();
    }
}
