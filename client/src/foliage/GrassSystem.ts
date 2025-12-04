/**
 * GrassSystem - Main controller for the grass rendering system
 *
 * Manages:
 * - Patch lifecycle (creation, updates, disposal)
 * - LOD based on distance
 * - Worker integration for instance generation
 * - Shader uniform updates
 */

import {
    Scene,
    Vector3,
    BufferGeometry,
    RawShaderMaterial,
    Box3Helper,
    Color,
} from 'three';
import { GrassPatch } from './GrassPatch';
import { createSharedBladeGeometry } from './bladeGeometry';
import {
    createSharedGrassMaterial,
    updateGrassMaterialPerFrame,
    updateGrassMaterialWind,
    updateGrassMaterialDistance,
} from './GrassMaterial';
import {
    type GrassParams,
    type GrassStats,
    type TerrainSampler,
    type SplatSampler,
    type GrassWorkerResponse,
    DEFAULT_GRASS_PARAMS,
    GRASS_CONSTANTS,
    LOD_DENSITY_FACTORS,
} from './types';
import { environmentWorkerClient } from '../workers/environmentWorkerClient';
import type { EarthParams } from '../utils/terrain';

/**
 * Patch record for internal tracking
 */
interface PatchRecord {
    key: string;
    chunkX: number;
    chunkZ: number;
    patch: GrassPatch;
    lodTier: number;
    distanceToPlayer: number;
    pendingWorker: boolean;
    workerGeneration: number;
}

/**
 * Worker request queue item
 */
interface WorkerQueueItem {
    key: string;
    chunkX: number;
    chunkZ: number;
    priority: number; // Lower = higher priority (distance-based)
    generation: number;
}

/**
 * GrassSystem - Fortnite-style stylized grass renderer
 *
 * Usage:
 * ```ts
 * const grass = new GrassSystem({ densityPerSqM: 400, maxDistance: 60 });
 * grass.setTerrainSampler(terrain.getHeightSampler());
 * grass.attach(scene);
 *
 * // In render loop:
 * grass.update(deltaTime, playerPosition, cameraPosition);
 * ```
 */
export class GrassSystem {
    // ========================================
    // Core State
    // ========================================

    private scene: Scene | null = null;
    private params: GrassParams;
    private enabled: boolean = true;

    // ========================================
    // Geometry & Material
    // ========================================

    private geometry: BufferGeometry;
    private material: RawShaderMaterial;

    // ========================================
    // Patch Management
    // ========================================

    private patches: Map<string, PatchRecord> = new Map();
    private patchPool: GrassPatch[] = [];
    private maxPoolSize: number = 50;

    // ========================================
    // Worker Queue
    // ========================================

    private workerQueue: WorkerQueueItem[] = [];
    private activeWorkerRequests: number = 0;
    private maxConcurrentWorkers: number = 4;
    private workerGeneration: number = 0;

    // ========================================
    // Terrain Integration
    // ========================================

    private terrainSampler: TerrainSampler | null = null;
    // Reserved for future splat-based features on main thread
    // private splatSampler: SplatSampler | null = null;
    private terrainParams: EarthParams | null = null;

    // ========================================
    // Performance Tracking
    // ========================================

    private lastPlayerChunk: { x: number; z: number } | null = null;
    private framesSinceFullUpdate: number = 0;
    private readonly fullUpdateInterval: number = 30; // Frames between full patch checks

    // ========================================
    // Debug
    // ========================================

    private debugBoundsEnabled: boolean = false;
    private debugHelpers: Map<string, Box3Helper> = new Map();

    // ========================================
    // Time Tracking
    // ========================================

    private elapsedTime: number = 0;

    constructor(params: Partial<GrassParams> = {}) {
        this.params = { ...DEFAULT_GRASS_PARAMS, ...params };
        this.enabled = this.params.enabled;

        // Create shared geometry and material
        this.geometry = createSharedBladeGeometry();
        this.material = createSharedGrassMaterial({ params: this.params });

        // Calculate max instances per patch based on density and patch size
        const patchArea = this.params.patchSize * this.params.patchSize;
        const maxInstancesPerPatch = Math.min(
            Math.ceil(patchArea * this.params.densityPerSqM),
            GRASS_CONSTANTS.MAX_INSTANCES_PER_PATCH
        );

        // Pre-allocate some patches to the pool
        for (let i = 0; i < 10; i++) {
            this.patchPool.push(this.createPatch(maxInstancesPerPatch));
        }
    }

    // ========================================
    // Lifecycle Methods
    // ========================================

    /**
     * Attach the grass system to a scene
     */
    attach(scene: Scene): void {
        this.scene = scene;
    }

    /**
     * Detach from scene and clean up
     */
    detach(): void {
        if (!this.scene) return;

        // Remove all patches from scene
        for (const record of this.patches.values()) {
            this.scene.remove(record.patch.mesh);
            this.removeDebugHelper(record.key);
        }

        // Clear patches
        this.patches.clear();

        // Clear pool
        for (const patch of this.patchPool) {
            patch.dispose();
        }
        this.patchPool = [];

        this.scene = null;
    }

    /**
     * Main update loop - call every frame
     */
    update(deltaTime: number, playerPosition: Vector3, cameraPosition: Vector3): void {
        if (!this.enabled || !this.scene) return;

        this.elapsedTime += deltaTime;

        // Update material uniforms
        updateGrassMaterialPerFrame(this.material, this.elapsedTime, cameraPosition);

        // Check if player moved to a new chunk
        const playerChunkX = Math.floor(playerPosition.x / this.params.patchSize);
        const playerChunkZ = Math.floor(playerPosition.z / this.params.patchSize);

        const chunkChanged = !this.lastPlayerChunk ||
            this.lastPlayerChunk.x !== playerChunkX ||
            this.lastPlayerChunk.z !== playerChunkZ;

        // Update patches if chunk changed or periodic full update
        this.framesSinceFullUpdate++;
        if (chunkChanged || this.framesSinceFullUpdate >= this.fullUpdateInterval) {
            this.updatePatches(playerPosition, cameraPosition);
            this.lastPlayerChunk = { x: playerChunkX, z: playerChunkZ };
            this.framesSinceFullUpdate = 0;
        }

        // Update LOD for existing patches
        this.updateLOD(playerPosition);

        // Process worker queue
        this.processWorkerQueue();
    }

    /**
     * Dispose of all resources
     */
    dispose(): void {
        this.detach();

        // Dispose geometry and material
        this.geometry.dispose();
        this.material.dispose();

        // Clear worker queue
        this.workerQueue = [];
        this.workerGeneration++;
    }

    // ========================================
    // Configuration Methods
    // ========================================

    /**
     * Enable or disable the grass system
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;

        // Hide all patches if disabled
        if (!enabled) {
            for (const record of this.patches.values()) {
                record.patch.setVisible(false);
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
     * Set wind parameters
     */
    setWind(strength: number, speed: number, direction: [number, number]): void {
        this.params.windStrength = strength;
        this.params.windSpeed = speed;
        this.params.windDirection = direction;
        updateGrassMaterialWind(this.material, strength, speed, direction);
    }

    /**
     * Set grass density (requires patch regeneration)
     */
    setDensity(densityPerSqM: number): void {
        this.params.densityPerSqM = Math.max(
            GRASS_CONSTANTS.DENSITY_MIN,
            Math.min(GRASS_CONSTANTS.DENSITY_MAX, densityPerSqM)
        );
        // Mark all patches for regeneration
        this.invalidateAllPatches();
    }

    /**
     * Set maximum render distance
     */
    setMaxDistance(distance: number): void {
        this.params.maxDistance = distance;
        this.params.lodDistances = [
            Math.min(20, distance * 0.33),
            Math.min(40, distance * 0.66),
            distance,
        ];
        updateGrassMaterialDistance(this.material, distance);
        // Some patches may now be out of range
        this.invalidateAllPatches();
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
     * Set the splat map sampler function
     * Reserved for future main-thread splat features
     */
    setSplatSampler(_sampler: SplatSampler): void {
        // Currently splat sampling is done in the worker
        // This is reserved for potential main-thread features
    }

    /**
     * Set terrain parameters (passed to worker)
     */
    setTerrainParams(params: EarthParams): void {
        this.terrainParams = params;
        // Terrain changed, regenerate all patches
        this.invalidateAllPatches();
    }

    // ========================================
    // Debug Methods
    // ========================================

    /**
     * Get current stats for debugging
     */
    getStats(): GrassStats {
        let instanceCount = 0;
        const instancesByLod: [number, number, number] = [0, 0, 0];

        for (const record of this.patches.values()) {
            const count = record.patch.getInstanceCount();
            instanceCount += count;
            if (record.lodTier >= 0 && record.lodTier <= 2) {
                instancesByLod[record.lodTier] += count;
            }
        }

        return {
            instanceCount,
            patchCount: this.patches.size,
            drawCalls: this.patches.size, // One draw call per patch
            instancesByLod,
        };
    }

    /**
     * Enable/disable debug bounds visualization
     */
    debugDrawBounds(enable: boolean): void {
        this.debugBoundsEnabled = enable;

        if (!enable) {
            // Remove all debug helpers
            for (const helper of this.debugHelpers.values()) {
                this.scene?.remove(helper);
            }
            this.debugHelpers.clear();
        } else {
            // Add helpers for existing patches
            for (const record of this.patches.values()) {
                this.addDebugHelper(record);
            }
        }
    }

    // ========================================
    // Private: Patch Management
    // ========================================

    /**
     * Create a new patch (from pool or new)
     */
    private createPatch(maxInstances: number): GrassPatch {
        return new GrassPatch({
            geometry: this.geometry,
            material: this.material,
            maxInstances,
        });
    }

    /**
     * Get a patch from pool or create new
     */
    private obtainPatch(): GrassPatch {
        if (this.patchPool.length > 0) {
            const patch = this.patchPool.pop()!;
            patch.reset();
            return patch;
        }

        const patchArea = this.params.patchSize * this.params.patchSize;
        const maxInstances = Math.min(
            Math.ceil(patchArea * this.params.densityPerSqM),
            GRASS_CONSTANTS.MAX_INSTANCES_PER_PATCH
        );
        return this.createPatch(maxInstances);
    }

    /**
     * Return a patch to the pool
     */
    private releasePatch(patch: GrassPatch): void {
        if (this.patchPool.length < this.maxPoolSize) {
            patch.reset();
            this.patchPool.push(patch);
        } else {
            patch.dispose();
        }
    }

    /**
     * Generate chunk key
     */
    private chunkKey(chunkX: number, chunkZ: number): string {
        return `${chunkX},${chunkZ}`;
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
    private updatePatches(playerPosition: Vector3, _cameraPosition: Vector3): void {
        if (!this.scene) return;

        const playerChunkX = Math.floor(playerPosition.x / this.params.patchSize);
        const playerChunkZ = Math.floor(playerPosition.z / this.params.patchSize);

        // Calculate chunk range to cover maxDistance
        const chunkRadius = Math.ceil(this.params.maxDistance / this.params.patchSize) + 1;

        // Track which chunks should exist
        const wantedChunks = new Set<string>();

        // Find all chunks within range
        for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
            for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const center = this.chunkCenter(chunkX, chunkZ);

                // Check if chunk center is within maxDistance
                const dist = Math.hypot(
                    center.x - playerPosition.x,
                    center.z - playerPosition.z
                );

                if (dist <= this.params.maxDistance + this.params.patchSize * 0.707) {
                    const key = this.chunkKey(chunkX, chunkZ);
                    wantedChunks.add(key);

                    // Create patch if doesn't exist
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
        if (!this.scene) return;

        const patch = this.obtainPatch();
        const center = this.chunkCenter(chunkX, chunkZ);
        patch.setCenter(center.x, center.z);
        patch.state.chunkX = chunkX;
        patch.state.chunkZ = chunkZ;

        const lodTier = this.getLODTier(distance);

        const record: PatchRecord = {
            key,
            chunkX,
            chunkZ,
            patch,
            lodTier,
            distanceToPlayer: distance,
            pendingWorker: false,
            workerGeneration: 0,
        };

        this.patches.set(key, record);
        this.scene.add(patch.mesh);

        // Queue for worker processing
        this.queueWorkerRequest(record);

        // Add debug helper if enabled
        if (this.debugBoundsEnabled) {
            this.addDebugHelper(record);
        }
    }

    /**
     * Remove a patch record
     */
    private removePatchRecord(key: string, record: PatchRecord): void {
        if (!this.scene) return;

        this.scene.remove(record.patch.mesh);
        this.removeDebugHelper(key);
        this.releasePatch(record.patch);
        this.patches.delete(key);
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
                const densityFactor = this.getLODDensityFactor(newLodTier);
                record.patch.setDensityFactor(densityFactor);
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
     * Get density factor for LOD tier
     */
    private getLODDensityFactor(tier: number): number {
        switch (tier) {
            case 0: return LOD_DENSITY_FACTORS.TIER_0;
            case 1: return LOD_DENSITY_FACTORS.TIER_1;
            case 2: return LOD_DENSITY_FACTORS.TIER_2;
            default: return LOD_DENSITY_FACTORS.TIER_2;
        }
    }

    /**
     * Invalidate all patches (forces regeneration)
     */
    private invalidateAllPatches(): void {
        this.workerGeneration++;
        this.workerQueue = [];

        for (const record of this.patches.values()) {
            record.patch.reset();
            record.pendingWorker = false;
            this.queueWorkerRequest(record);
        }
    }

    // ========================================
    // Private: Worker Integration
    // ========================================

    /**
     * Queue a worker request for a patch
     */
    private queueWorkerRequest(record: PatchRecord): void {
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

        // Sort by priority (closest first)
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

            // Skip stale requests
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
    private async executeWorkerRequest(record: PatchRecord): Promise<void> {
        this.activeWorkerRequests++;

        const generation = record.workerGeneration;
        const center = this.chunkCenter(record.chunkX, record.chunkZ);

        try {
            // Generate grass data (this would call the actual worker)
            const result = await this.generateGrassData(
                center.x,
                center.z,
                this.params.patchSize,
                record.chunkX,
                record.chunkZ
            );

            // Check if request is still valid
            if (
                record.workerGeneration !== generation ||
                !this.patches.has(record.key)
            ) {
                return;
            }

            // Apply data to patch
            record.patch.setInstanceData(result.positions, result.instanceData, result.count);

            // Apply current LOD
            const densityFactor = this.getLODDensityFactor(record.lodTier);
            record.patch.setDensityFactor(densityFactor);

            // Update debug helper bounds
            if (this.debugBoundsEnabled) {
                this.updateDebugHelper(record);
            }
        } catch (error) {
            console.error('[GrassSystem] Worker request failed:', error);
        } finally {
            record.pendingWorker = false;
            this.activeWorkerRequests--;
        }
    }

    /**
     * Generate grass instance data via web worker
     * Handles terrain height sampling and splat-based density on worker thread
     */
    private async generateGrassData(
        originX: number,
        originZ: number,
        patchSize: number,
        _chunkX: number,
        _chunkZ: number
    ): Promise<GrassWorkerResponse> {
        // Calculate target instance count
        const targetCount = Math.min(
            Math.ceil(patchSize * patchSize * this.params.densityPerSqM),
            GRASS_CONSTANTS.MAX_INSTANCES_PER_PATCH
        );

        // If no terrain params, fall back to local generation
        if (!this.terrainParams) {
            return this.generateGrassDataLocal(originX, originZ, patchSize, targetCount);
        }

        // Call worker for proper terrain integration
        const result = await environmentWorkerClient.computeGrassInstances({
            instanceCount: targetCount,
            patchSize,
            origin: { x: originX, z: originZ },
            terrainParams: this.terrainParams,
            seed: this.params.seed,
        });

        return {
            positions: result.positions,
            instanceData: result.instanceData,
            count: result.count,
        };
    }

    /**
     * Fallback local grass generation when no terrain params available
     * Used for testing or simple scenes without terrain
     */
    private generateGrassDataLocal(
        originX: number,
        originZ: number,
        patchSize: number,
        targetCount: number
    ): GrassWorkerResponse {
        const positions: number[] = [];
        const instanceData: number[] = [];
        const seed = this.params.seed;

        // Simple hash function for deterministic placement
        const hash = (x: number, z: number, s: number = 0): number => {
            const h = Math.sin(x * 127.1 + z * 311.7 + s * 17.23) * 43758.5453;
            return h - Math.floor(h);
        };

        let count = 0;
        for (let i = 0; i < targetCount && count < targetCount; i++) {
            // Deterministic position within patch
            const sx = hash(i + 1 + originX * 0.031, originZ * 0.017 + seed * 0.001, seed);
            const sz = hash(i + 7 + originZ * 0.029, originX * 0.013 + seed * 0.002, seed + 13.37);

            const localX = (sx - 0.5) * patchSize;
            const localZ = (sz - 0.5) * patchSize;
            const worldX = originX + localX;
            const worldZ = originZ + localZ;

            // Get terrain height if sampler available
            let height = 0;
            if (this.terrainSampler) {
                height = this.terrainSampler(worldX, worldZ);
                // Skip underwater (assuming water level ~0)
                if (height <= 0) continue;
            }

            // Simple density check
            const densityRand = hash(worldX, worldZ, seed);
            if (densityRand > 0.8) continue; // 80% base density

            // Position
            positions.push(worldX, height, worldZ);

            // Instance data: rotation, scale, variant, random
            const rotation = hash(worldX + 100, worldZ + 100, seed) * Math.PI * 2;
            const scale = 0.8 + hash(worldX + 200, worldZ + 200, seed) * 0.4;
            const variant = Math.floor(hash(worldX + 300, worldZ + 300, seed) * 3);
            const random = hash(worldX + 400, worldZ + 400, seed);

            instanceData.push(rotation, scale, variant, random);
            count++;
        }

        return {
            positions: new Float32Array(positions),
            instanceData: new Float32Array(instanceData),
            count,
        };
    }

    // ========================================
    // Private: Debug Helpers
    // ========================================

    /**
     * Add debug bounding box helper for a patch
     */
    private addDebugHelper(record: PatchRecord): void {
        if (!this.scene || !this.debugBoundsEnabled) return;

        const bounds = record.patch.mesh.geometry.boundingBox;
        if (!bounds) return;

        // LOD-based color
        const colors = [
            new Color(0x00ff00), // LOD 0: Green
            new Color(0xffff00), // LOD 1: Yellow
            new Color(0xff0000), // LOD 2: Red
        ];

        const helper = new Box3Helper(bounds, colors[record.lodTier] || colors[2]);
        this.scene.add(helper);
        this.debugHelpers.set(record.key, helper);
    }

    /**
     * Update debug helper for a patch
     */
    private updateDebugHelper(record: PatchRecord): void {
        const helper = this.debugHelpers.get(record.key);
        if (!helper) return;

        const bounds = record.patch.mesh.geometry.boundingBox;
        if (bounds) {
            helper.box.copy(bounds);
        }
    }

    /**
     * Remove debug helper
     */
    private removeDebugHelper(key: string): void {
        const helper = this.debugHelpers.get(key);
        if (helper) {
            this.scene?.remove(helper);
            this.debugHelpers.delete(key);
        }
    }
}
