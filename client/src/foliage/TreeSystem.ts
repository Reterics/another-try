/**
 * TreeSystem - Procedural tree placement system
 *
 * Places trees procedurally on grass splat areas with:
 * - Configurable density
 * - Height range 3-5 meters (configurable)
 * - Always upright (Y-up) regardless of terrain
 * - Collision cylinders for player blocking
 * - LOD-based culling
 */

import {
    Scene,
    Vector3,
    Group,
    Object3D,
    CylinderGeometry,
    MeshBasicMaterial,
    Mesh,
    Box3,
} from 'three';
import {
    type TreeParams,
    type TreeStats,
    type TreeWorkerResponse,
    type TerrainSampler,
    DEFAULT_TREE_PARAMS,
    TREE_CONSTANTS,
    TREE_VARIANTS,
} from './types';
import { environmentWorkerClient } from '../workers/environmentWorkerClient';
import type { EarthParams } from '../utils/terrain';
import { loadModel } from '../utils/model';
import { hash2 } from '../utils/terrainHelpers';

/**
 * Tree instance record for a patch
 */
interface TreeInstance {
    x: number;
    y: number;
    z: number;
    rotation: number;
    scale: number;
    variant: number;
}

/**
 * Patch record for internal tracking
 */
interface TreePatchRecord {
    key: string;
    chunkX: number;
    chunkZ: number;
    instances: TreeInstance[];
    meshes: Object3D[];
    colliders: Mesh[];
    lodTier: number;
    distanceToPlayer: number;
    pendingWorker: boolean;
    workerGeneration: number;
    visible: boolean;
}

/**
 * Worker queue item
 */
interface WorkerQueueItem {
    key: string;
    chunkX: number;
    chunkZ: number;
    priority: number;
    generation: number;
}

/**
 * TreeSystem - Procedural tree placement on grass areas
 *
 * Usage:
 * ```ts
 * const trees = new TreeSystem({ densityPerSqM: 0.01, maxDistance: 150 });
 * await trees.loadModels();
 * trees.setTerrainSampler(terrain.getHeightSampler());
 * trees.attach(scene);
 *
 * // In render loop:
 * trees.update(deltaTime, playerPosition);
 *
 * // Get collision meshes for BVH:
 * const colliders = trees.getColliderMeshes();
 * ```
 */
export class TreeSystem {
    // ========================================
    // Core State
    // ========================================

    private scene: Scene | null = null;
    private params: TreeParams;
    private enabled: boolean = true;

    // ========================================
    // Model Assets
    // ========================================

    private treeModels: Group[] = [];
    private treeModelScales: number[] = []; // Scale factor to normalize each model to 1m height
    private modelsLoaded: boolean = false;

    // ========================================
    // Patch Management
    // ========================================

    private patches: Map<string, TreePatchRecord> = new Map();
    private treeGroup: Group;
    private colliderGroup: Group;

    // ========================================
    // Worker Queue
    // ========================================

    private workerQueue: WorkerQueueItem[] = [];
    private activeWorkerRequests: number = 0;
    private maxConcurrentWorkers: number = 2;
    private workerGeneration: number = 0;

    // ========================================
    // Terrain Integration
    // ========================================

    private terrainSampler: TerrainSampler | null = null;
    private terrainParams: EarthParams | null = null;

    // ========================================
    // Performance Tracking
    // ========================================

    private lastPlayerChunk: { x: number; z: number } | null = null;
    private framesSinceFullUpdate: number = 0;
    private readonly fullUpdateInterval: number = 60;

    // ========================================
    // Collision callback
    // ========================================

    private onCollidersChanged: (() => void) | null = null;

    constructor(params: Partial<TreeParams> = {}) {
        this.params = { ...DEFAULT_TREE_PARAMS, ...params };
        this.enabled = this.params.enabled;

        this.treeGroup = new Group();
        this.treeGroup.name = 'tree-system';

        this.colliderGroup = new Group();
        this.colliderGroup.name = 'tree-colliders';
    }

    // ========================================
    // Lifecycle Methods
    // ========================================

    /**
     * Load tree model assets - must be called before attach()
     * Calculates normalization scale to convert each model to 1 meter height
     */
    async loadModels(): Promise<void> {
        if (this.modelsLoaded) return;

        const loadPromises = TREE_VARIANTS.map(async (variant) => {
            const gltf = await loadModel.gltf(variant.modelPath);
            if (gltf) {
                const model = gltf.scene;
                model.name = variant.name;

                // Measure the model's natural height
                model.updateMatrixWorld(true);
                const bounds = new Box3().setFromObject(model);
                const size = new Vector3();
                bounds.getSize(size);
                const modelHeight = size.y;

                // Calculate scale to normalize to 1 meter
                const normalizeScale = modelHeight > 0 ? 1.0 / modelHeight : 1.0;

                return { model, normalizeScale };
            }
            console.warn(`[TreeSystem] Failed to load model: ${variant.modelPath}`);
            return null;
        });

        const results = await Promise.all(loadPromises);

        this.treeModels = [];
        this.treeModelScales = [];

        for (const result of results) {
            if (result) {
                this.treeModels.push(result.model);
                this.treeModelScales.push(result.normalizeScale);
            }
        }

        if (this.treeModels.length === 0) {
            console.error('[TreeSystem] No tree models loaded!');
        }

        this.modelsLoaded = true;
    }

    /**
     * Attach the tree system to a scene
     */
    attach(scene: Scene): void {
        if (!this.modelsLoaded) {
            console.warn('[TreeSystem] Models not loaded. Call loadModels() first.');
        }
        this.scene = scene;
        scene.add(this.treeGroup);
        // Colliders are not added to scene - they're used for BVH only
    }

    /**
     * Detach from scene and clean up
     */
    detach(): void {
        if (!this.scene) return;

        // Remove all patches
        for (const record of this.patches.values()) {
            this.removePatchMeshes(record);
        }
        this.patches.clear();

        this.scene.remove(this.treeGroup);
        this.scene = null;
    }

    /**
     * Main update loop - call every frame
     */
    update(_deltaTime: number, playerPosition: Vector3): void {
        if (!this.enabled || !this.scene || !this.modelsLoaded) return;

        const playerChunkX = Math.floor(playerPosition.x / this.params.patchSize);
        const playerChunkZ = Math.floor(playerPosition.z / this.params.patchSize);

        const chunkChanged = !this.lastPlayerChunk ||
            this.lastPlayerChunk.x !== playerChunkX ||
            this.lastPlayerChunk.z !== playerChunkZ;

        this.framesSinceFullUpdate++;
        if (chunkChanged || this.framesSinceFullUpdate >= this.fullUpdateInterval) {
            this.updatePatches(playerPosition);
            this.lastPlayerChunk = { x: playerChunkX, z: playerChunkZ };
            this.framesSinceFullUpdate = 0;
        }

        this.updateLOD(playerPosition);
        this.processWorkerQueue();
    }

    /**
     * Dispose of all resources
     */
    dispose(): void {
        this.detach();
        this.treeModels = [];
        this.treeModelScales = [];
        this.modelsLoaded = false;
        this.workerQueue = [];
        this.workerGeneration++;
    }

    // ========================================
    // Configuration Methods
    // ========================================

    /**
     * Enable or disable the tree system
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;

        if (!enabled) {
            for (const record of this.patches.values()) {
                this.setPatchVisible(record, false);
            }
        }
    }

    /**
     * Check if system is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Set tree density (requires patch regeneration)
     */
    setDensity(densityPerSqM: number): void {
        this.params.densityPerSqM = Math.max(
            TREE_CONSTANTS.DENSITY_MIN,
            Math.min(TREE_CONSTANTS.DENSITY_MAX, densityPerSqM)
        );
        this.invalidateAllPatches();
    }

    /**
     * Set maximum render distance
     */
    setMaxDistance(distance: number): void {
        this.params.maxDistance = distance;
        this.params.lodDistances = [
            Math.min(50, distance * 0.25),
            Math.min(100, distance * 0.5),
            distance,
        ];
        this.invalidateAllPatches();
    }

    /**
     * Set callback for when colliders change (for BVH rebuild)
     */
    setCollidersChangedCallback(callback: () => void): void {
        this.onCollidersChanged = callback;
    }

    // ========================================
    // Terrain Integration
    // ========================================

    /**
     * Set the terrain height sampler function
     */
    setTerrainSampler(sampler: TerrainSampler): void {
        this.terrainSampler = sampler;
    }

    /**
     * Set terrain parameters (passed to worker)
     */
    setTerrainParams(params: EarthParams): void {
        this.terrainParams = params;
        this.invalidateAllPatches();
    }

    // ========================================
    // Collision Access
    // ========================================

    /**
     * Get all tree collider meshes for BVH integration
     * These are cylinder meshes positioned at each tree location
     */
    getColliderMeshes(): Mesh[] {
        const colliders: Mesh[] = [];
        for (const record of this.patches.values()) {
            if (record.visible) {
                colliders.push(...record.colliders);
            }
        }
        return colliders;
    }

    /**
     * Get the collider group (for adding to environment before BVH build)
     */
    getColliderGroup(): Group {
        return this.colliderGroup;
    }

    // ========================================
    // Debug Methods
    // ========================================

    /**
     * Get current stats for debugging
     */
    getStats(): TreeStats {
        let instanceCount = 0;
        const instancesByLod: [number, number, number] = [0, 0, 0];

        for (const record of this.patches.values()) {
            if (record.visible) {
                const count = record.instances.length;
                instanceCount += count;
                if (record.lodTier >= 0 && record.lodTier <= 2) {
                    instancesByLod[record.lodTier] += count;
                }
            }
        }

        return {
            instanceCount,
            patchCount: this.patches.size,
            drawCalls: this.patches.size * 2, // ~2 variants per patch
            instancesByLod,
        };
    }

    // ========================================
    // Private: Patch Management
    // ========================================

    /**
     * Generate chunk key
     */
    private chunkKey(chunkX: number, chunkZ: number): string {
        return `tree_${chunkX},${chunkZ}`;
    }

    /**
     * Get chunk center in world coordinates
     */
    private chunkCenter(chunkX: number, chunkZ: number): { x: number; z: number } {
        return {
            x: (chunkX + 0.5) * this.params.patchSize,
            z: (chunkZ + 0.5) * this.params.patchSize,
        };
    }

    /**
     * Update visible patches based on player position
     */
    private updatePatches(playerPosition: Vector3): void {
        if (!this.scene) return;

        const playerChunkX = Math.floor(playerPosition.x / this.params.patchSize);
        const playerChunkZ = Math.floor(playerPosition.z / this.params.patchSize);

        const chunkRadius = Math.ceil(this.params.maxDistance / this.params.patchSize) + 1;

        const wantedChunks = new Set<string>();

        for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
            for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const center = this.chunkCenter(chunkX, chunkZ);

                const dist = Math.hypot(
                    center.x - playerPosition.x,
                    center.z - playerPosition.z
                );

                if (dist <= this.params.maxDistance + this.params.patchSize * 0.707) {
                    const key = this.chunkKey(chunkX, chunkZ);
                    wantedChunks.add(key);

                    if (!this.patches.has(key)) {
                        this.createPatchRecord(key, chunkX, chunkZ, dist);
                    }
                }
            }
        }

        // Remove patches that are no longer needed
        for (const [key, record] of this.patches) {
            if (!wantedChunks.has(key)) {
                this.removePatchRecord(key, record);
            }
        }
    }

    /**
     * Create a new patch record
     */
    private createPatchRecord(key: string, chunkX: number, chunkZ: number, distance: number): void {
        const lodTier = this.getLODTier(distance);

        const record: TreePatchRecord = {
            key,
            chunkX,
            chunkZ,
            instances: [],
            meshes: [],
            colliders: [],
            lodTier,
            distanceToPlayer: distance,
            pendingWorker: false,
            workerGeneration: 0,
            visible: true,
        };

        this.patches.set(key, record);
        this.queueWorkerRequest(record);
    }

    /**
     * Remove a patch record
     */
    private removePatchRecord(key: string, record: TreePatchRecord): void {
        this.removePatchMeshes(record);
        this.patches.delete(key);
    }

    /**
     * Remove meshes from a patch
     */
    private removePatchMeshes(record: TreePatchRecord): void {
        for (const mesh of record.meshes) {
            this.treeGroup.remove(mesh);
        }
        for (const collider of record.colliders) {
            this.colliderGroup.remove(collider);
        }
        record.meshes = [];
        record.colliders = [];
    }

    /**
     * Set patch visibility
     */
    private setPatchVisible(record: TreePatchRecord, visible: boolean): void {
        record.visible = visible;
        for (const mesh of record.meshes) {
            mesh.visible = visible;
        }
    }

    /**
     * Update LOD for all patches
     */
    private updateLOD(playerPosition: Vector3): void {
        for (const record of this.patches.values()) {
            const center = this.chunkCenter(record.chunkX, record.chunkZ);
            const dist = Math.hypot(
                center.x - playerPosition.x,
                center.z - playerPosition.z
            );

            record.distanceToPlayer = dist;
            const newLodTier = this.getLODTier(dist);

            if (newLodTier !== record.lodTier) {
                record.lodTier = newLodTier;
                // For trees, LOD mainly affects visibility culling
                // Could add billboard/impostor system later
            }

            // Hide patches beyond max distance
            const shouldBeVisible = dist <= this.params.maxDistance;
            if (record.visible !== shouldBeVisible) {
                this.setPatchVisible(record, shouldBeVisible);
            }
        }
    }

    /**
     * Get LOD tier based on distance
     */
    private getLODTier(distance: number): number {
        const [lod0, lod1] = this.params.lodDistances;

        if (distance <= lod0) return 0;
        if (distance <= lod1) return 1;
        return 2;
    }

    /**
     * Invalidate all patches (forces regeneration)
     */
    private invalidateAllPatches(): void {
        this.workerGeneration++;
        this.workerQueue = [];

        for (const record of this.patches.values()) {
            this.removePatchMeshes(record);
            record.instances = [];
            record.pendingWorker = false;
            this.queueWorkerRequest(record);
        }

        this.notifyCollidersChanged();
    }

    // ========================================
    // Private: Worker Integration
    // ========================================

    /**
     * Queue a worker request for a patch
     */
    private queueWorkerRequest(record: TreePatchRecord): void {
        if (record.pendingWorker) return;

        record.pendingWorker = true;
        record.workerGeneration = this.workerGeneration;

        this.workerQueue.push({
            key: record.key,
            chunkX: record.chunkX,
            chunkZ: record.chunkZ,
            priority: record.distanceToPlayer,
            generation: this.workerGeneration,
        });

        this.workerQueue.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Process queued worker requests
     */
    private processWorkerQueue(): void {
        while (
            this.workerQueue.length > 0 &&
            this.activeWorkerRequests < this.maxConcurrentWorkers
        ) {
            const item = this.workerQueue.shift()!;

            if (item.generation !== this.workerGeneration) {
                continue;
            }

            const record = this.patches.get(item.key);
            if (!record || record.workerGeneration !== item.generation) {
                continue;
            }

            this.executeWorkerRequest(record);
        }
    }

    /**
     * Execute a worker request
     */
    private async executeWorkerRequest(record: TreePatchRecord): Promise<void> {
        this.activeWorkerRequests++;

        const generation = record.workerGeneration;
        const center = this.chunkCenter(record.chunkX, record.chunkZ);

        try {
            const result = await this.generateTreeData(
                center.x,
                center.z,
                this.params.patchSize
            );

            if (
                record.workerGeneration !== generation ||
                !this.patches.has(record.key)
            ) {
                return;
            }

            // Apply data to patch
            this.applyTreeData(record, result);
            this.notifyCollidersChanged();

        } catch (error) {
            console.error('[TreeSystem] Worker request failed:', error);
        } finally {
            record.pendingWorker = false;
            this.activeWorkerRequests--;
        }
    }

    /**
     * Generate tree instance data via web worker
     */
    private async generateTreeData(
        originX: number,
        originZ: number,
        patchSize: number
    ): Promise<TreeWorkerResponse> {
        const targetCount = Math.min(
            Math.ceil(patchSize * patchSize * this.params.densityPerSqM),
            TREE_CONSTANTS.MAX_INSTANCES_PER_PATCH
        );

        if (!this.terrainParams) {
            return this.generateTreeDataLocal(originX, originZ, patchSize, targetCount);
        }

        const result = await environmentWorkerClient.computeTreeInstances({
            instanceCount: targetCount,
            patchSize,
            origin: { x: originX, z: originZ },
            terrainParams: this.terrainParams,
            seed: this.params.seed,
            grassThreshold: this.params.grassThreshold,
            minHeight: this.params.minHeight,
            maxHeight: this.params.maxHeight,
        });

        return {
            positions: result.positions,
            instanceData: result.instanceData,
            count: result.count,
        };
    }

    /**
     * Fallback local tree generation
     */
    private generateTreeDataLocal(
        originX: number,
        originZ: number,
        patchSize: number,
        targetCount: number
    ): TreeWorkerResponse {
        const positions: number[] = [];
        const instanceData: number[] = [];
        const seed = this.params.seed;

        let count = 0;
        for (let i = 0; i < targetCount * 3 && count < targetCount; i++) {
            const sx = hash2(i + 1 + originX * 0.031, originZ * 0.017 + seed * 0.001, seed);
            const sz = hash2(i + 7 + originZ * 0.029, originX * 0.013 + seed * 0.002, seed + 13.37);
            const localX = (sx - 0.5) * patchSize;
            const localZ = (sz - 0.5) * patchSize;
            const wx = originX + localX;
            const wz = originZ + localZ;

            let height = 0;
            if (this.terrainSampler) {
                height = this.terrainSampler(wx, wz);
                if (height <= 0) continue;
            }

            // Random acceptance for spacing
            const acceptRand = hash2(wx * 0.1, wz * 0.1, seed + 100);
            if (acceptRand > 0.3) continue;

            positions.push(wx, height, wz);

            const rotation = hash2(wx + 100, wz + 100, seed) * Math.PI * 2;
            const scaleRand = hash2(wx + 200, wz + 200, seed);
            const scale = this.params.minHeight + scaleRand * (this.params.maxHeight - this.params.minHeight);
            const variantRand = hash2(wx + 300, wz + 300, seed);
            const variant = variantRand < 0.5 ? 0 : 1;

            instanceData.push(rotation, scale, variant);
            count++;
        }

        return {
            positions: new Float32Array(positions),
            instanceData: new Float32Array(instanceData),
            count,
        };
    }

    /**
     * Apply tree data from worker to patch
     */
    private applyTreeData(record: TreePatchRecord, data: TreeWorkerResponse): void {
        // Clear existing meshes
        this.removePatchMeshes(record);

        // Parse instance data
        const instances: TreeInstance[] = [];
        for (let i = 0; i < data.count; i++) {
            instances.push({
                x: data.positions[i * 3],
                y: data.positions[i * 3 + 1],
                z: data.positions[i * 3 + 2],
                rotation: data.instanceData[i * 3],
                scale: data.instanceData[i * 3 + 1],
                variant: Math.floor(data.instanceData[i * 3 + 2]),
            });
        }
        record.instances = instances;

        // Create tree meshes
        for (const instance of instances) {
            const variantIndex = Math.min(instance.variant, this.treeModels.length - 1);
            if (variantIndex < 0 || this.treeModels.length === 0) continue;

            const model = this.treeModels[variantIndex];
            const normalizeScale = this.treeModelScales[variantIndex] || 1.0;
            const tree = model.clone(true); // Deep clone

            // Position at terrain height
            tree.position.set(instance.x, instance.y, instance.z);

            // Always upright - only Y rotation
            tree.rotation.set(0, instance.rotation, 0);

            // Scale = normalization factor * desired height in meters
            // normalizeScale converts model to 1m, instance.scale is desired height (3-5m)
            const finalScale = normalizeScale * instance.scale;
            tree.scale.set(finalScale, finalScale, finalScale);

            tree.updateMatrixWorld(true);
            record.meshes.push(tree);
            this.treeGroup.add(tree);

            // Create collision cylinder
            const collider = this.createCollider(instance);
            record.colliders.push(collider);
            this.colliderGroup.add(collider);
        }
    }

    /**
     * Create a collision cylinder for a tree
     */
    private createCollider(instance: TreeInstance): Mesh {
        const radius = this.params.collisionRadius;
        const height = instance.scale * 0.6; // Collision height is 60% of visual height

        const geometry = new CylinderGeometry(radius, radius, height, 8);
        const material = new MeshBasicMaterial({
            visible: false,
            transparent: true,
            opacity: 0,
        });

        const collider = new Mesh(geometry, material);
        collider.position.set(
            instance.x,
            instance.y + height / 2,  // Center cylinder at half height
            instance.z
        );
        collider.name = 'tree-collider';

        return collider;
    }

    /**
     * Notify that colliders have changed
     */
    private notifyCollidersChanged(): void {
        if (this.onCollidersChanged) {
            this.onCollidersChanged();
        }
    }
}
