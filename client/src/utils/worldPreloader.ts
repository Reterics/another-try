/**
 * WorldPreloader - Preloads world chunks on game start
 *
 * Preloads 2x the current render area for grass/tree/terrain systems
 * to ensure smooth gameplay from the start.
 */

import { environmentWorkerClient } from '../workers/environmentWorkerClient';
import type { EarthParams } from './terrain';
import {
    getChunk,
    putChunk,
    makeChunkKey,
    serializeGrassChunk,
    serializeTreeChunk,
    serializeTerrainChunk,
    CACHE_VERSION,
} from './worldCache';

export interface PreloadConfig {
    /** Spawn position X */
    spawnX: number;
    /** Spawn position Z */
    spawnZ: number;
    /** Terrain parameters including seed */
    terrainParams: EarthParams;
    /** Grass system config */
    grass: {
        seed: number;
        patchSize: number;
        maxDistance: number;
        densityPerSqM: number;
    };
    /** Tree system config */
    tree: {
        seed: number;
        patchSize: number;
        maxDistance: number;
        densityPerSqM: number;
        grassThreshold: number;
        minHeight: number;
        maxHeight: number;
    };
    /** Terrain system config */
    terrain: {
        chunkSize: number;
        chunkRadius: number;
        chunkSegments: number;
        splatResolution: number;
    };
}

export interface PreloadProgress {
    total: number;
    completed: number;
    phase: 'terrain' | 'grass' | 'trees' | 'done';
}

type ProgressCallback = (progress: PreloadProgress) => void;

/**
 * Get all chunk coordinates within a radius from a center point
 */
function getChunksInRadius(
    centerX: number,
    centerZ: number,
    patchSize: number,
    radius: number
): Array<{ cx: number; cz: number }> {
    const chunks: Array<{ cx: number; cz: number }> = [];
    const chunkRadius = Math.ceil(radius / patchSize) + 1;
    const centerChunkX = Math.floor(centerX / patchSize);
    const centerChunkZ = Math.floor(centerZ / patchSize);

    for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
        for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
            const cx = centerChunkX + dx;
            const cz = centerChunkZ + dz;
            const chunkCenterX = (cx + 0.5) * patchSize;
            const chunkCenterZ = (cz + 0.5) * patchSize;
            const dist = Math.hypot(chunkCenterX - centerX, chunkCenterZ - centerZ);

            if (dist <= radius + patchSize * 0.707) {
                chunks.push({ cx, cz });
            }
        }
    }

    return chunks;
}

/**
 * Get terrain chunks within radius (for grid-based terrain)
 */
function getTerrainChunksInRadius(
    centerX: number,
    centerZ: number,
    chunkSize: number,
    chunkRadius: number
): Array<{ cx: number; cz: number }> {
    const chunks: Array<{ cx: number; cz: number }> = [];
    const centerChunkX = Math.floor(centerX / chunkSize);
    const centerChunkZ = Math.floor(centerZ / chunkSize);

    for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
        for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
            chunks.push({
                cx: centerChunkX + dx,
                cz: centerChunkZ + dz,
            });
        }
    }

    return chunks;
}

/**
 * Preload grass chunks
 */
async function preloadGrassChunks(
    config: PreloadConfig,
    onProgress?: ProgressCallback
): Promise<void> {
    const { grass, terrainParams, spawnX, spawnZ } = config;
    // 2x render distance for preloading
    const preloadRadius = grass.maxDistance * 2;
    const chunks = getChunksInRadius(spawnX, spawnZ, grass.patchSize, preloadRadius);

    const maxInstancesPerPatch = 65536;
    const targetCount = Math.min(
        Math.ceil(grass.patchSize * grass.patchSize * grass.densityPerSqM),
        maxInstancesPerPatch
    );

    let completed = 0;
    const total = chunks.length;

    // Process in batches to avoid overwhelming the worker
    const batchSize = 4;
    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        await Promise.all(
            batch.map(async ({ cx, cz }) => {
                const cacheKey = makeChunkKey(grass.seed, cx, cz, CACHE_VERSION);

                // Check if already cached
                const existing = await getChunk('grassChunks', cacheKey);
                if (existing) {
                    completed++;
                    onProgress?.({ total, completed, phase: 'grass' });
                    return;
                }

                // Generate and cache
                const originX = (cx + 0.5) * grass.patchSize;
                const originZ = (cz + 0.5) * grass.patchSize;

                try {
                    const result = await environmentWorkerClient.computeGrassInstances({
                        instanceCount: targetCount,
                        patchSize: grass.patchSize,
                        origin: { x: originX, z: originZ },
                        terrainParams,
                        seed: grass.seed,
                    });

                    const serialized = serializeGrassChunk({
                        positions: result.positions,
                        instanceData: result.instanceData,
                        count: result.count,
                    });
                    await putChunk('grassChunks', cacheKey, serialized);
                } catch (err) {
                    console.warn('[WorldPreloader] Failed to preload grass chunk:', cx, cz, err);
                }

                completed++;
                onProgress?.({ total, completed, phase: 'grass' });
            })
        );
    }
}

/**
 * Preload tree chunks
 */
async function preloadTreeChunks(
    config: PreloadConfig,
    onProgress?: ProgressCallback
): Promise<void> {
    const { tree, terrainParams, spawnX, spawnZ } = config;
    // 2x render distance for preloading
    const preloadRadius = tree.maxDistance * 2;
    const chunks = getChunksInRadius(spawnX, spawnZ, tree.patchSize, preloadRadius);

    const maxInstancesPerPatch = 1024;
    const targetCount = Math.min(
        Math.ceil(tree.patchSize * tree.patchSize * tree.densityPerSqM),
        maxInstancesPerPatch
    );

    let completed = 0;
    const total = chunks.length;

    // Process in batches
    const batchSize = 2;
    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        await Promise.all(
            batch.map(async ({ cx, cz }) => {
                const cacheKey = makeChunkKey(tree.seed, cx, cz, CACHE_VERSION);

                // Check if already cached
                const existing = await getChunk('treeChunks', cacheKey);
                if (existing) {
                    completed++;
                    onProgress?.({ total, completed, phase: 'trees' });
                    return;
                }

                // Generate and cache
                const originX = (cx + 0.5) * tree.patchSize;
                const originZ = (cz + 0.5) * tree.patchSize;

                try {
                    const result = await environmentWorkerClient.computeTreeInstances({
                        instanceCount: targetCount,
                        patchSize: tree.patchSize,
                        origin: { x: originX, z: originZ },
                        terrainParams,
                        seed: tree.seed,
                        grassThreshold: tree.grassThreshold,
                        minHeight: tree.minHeight,
                        maxHeight: tree.maxHeight,
                    });

                    const serialized = serializeTreeChunk({
                        positions: result.positions,
                        instanceData: result.instanceData,
                        count: result.count,
                    });
                    await putChunk('treeChunks', cacheKey, serialized);
                } catch (err) {
                    console.warn('[WorldPreloader] Failed to preload tree chunk:', cx, cz, err);
                }

                completed++;
                onProgress?.({ total, completed, phase: 'trees' });
            })
        );
    }
}

/**
 * Preload terrain chunks
 */
async function preloadTerrainChunks(
    config: PreloadConfig,
    onProgress?: ProgressCallback
): Promise<void> {
    const { terrain, terrainParams, spawnX, spawnZ } = config;
    // 2x chunk radius for preloading
    const preloadRadius = terrain.chunkRadius * 2;
    const chunks = getTerrainChunksInRadius(spawnX, spawnZ, terrain.chunkSize, preloadRadius);

    let completed = 0;
    const total = chunks.length;

    // Process terrain chunks sequentially (they're large)
    for (const { cx, cz } of chunks) {
        const cacheKey = makeChunkKey(terrainParams.seed, cx, cz, CACHE_VERSION);

        // Check if already cached
        const existing = await getChunk('terrainChunks', cacheKey);
        if (existing) {
            completed++;
            onProgress?.({ total, completed, phase: 'terrain' });
            continue;
        }

        // Generate geometry positions
        const centerX = cx * terrain.chunkSize + terrain.chunkSize / 2;
        const centerZ = cz * terrain.chunkSize + terrain.chunkSize / 2;
        const segments = terrain.chunkSegments;
        const size = terrain.chunkSize;

        // Create position array similar to PlaneGeometry
        const vertexCount = (segments + 1) * (segments + 1);
        const positions = new Float32Array(vertexCount * 3);

        let idx = 0;
        for (let iz = 0; iz <= segments; iz++) {
            const z = centerZ - size / 2 + (iz / segments) * size;
            for (let ix = 0; ix <= segments; ix++) {
                const x = centerX - size / 2 + (ix / segments) * size;
                positions[idx++] = x;
                positions[idx++] = 0; // Y will be filled by worker
                positions[idx++] = z;
            }
        }

        try {
            const result = await environmentWorkerClient.computeChunkData({
                positions,
                terrainParams,
                chunkX: cx,
                chunkZ: cz,
                chunkSize: terrain.chunkSize,
                chunkSegments: terrain.chunkSegments,
                splatResolution: terrain.splatResolution,
            });

            const serialized = serializeTerrainChunk({
                heights: result.heights,
                splat: result.splat,
                splatResolution: result.splatResolution,
            });
            await putChunk('terrainChunks', cacheKey, serialized);
        } catch (err) {
            console.warn('[WorldPreloader] Failed to preload terrain chunk:', cx, cz, err);
        }

        completed++;
        onProgress?.({ total, completed, phase: 'terrain' });
    }
}

/**
 * Preload all world chunks around a spawn point
 * Preloads 2x the current render area for each system
 *
 * @param config - Preload configuration
 * @param onProgress - Optional progress callback
 */
export async function preloadWorld(
    config: PreloadConfig,
    onProgress?: ProgressCallback
): Promise<void> {
    console.log('[WorldPreloader] Starting world preload at', config.spawnX, config.spawnZ);
    const startTime = performance.now();

    // Preload terrain first (required for grass/trees)
    await preloadTerrainChunks(config, onProgress);

    // Preload grass and trees in parallel after terrain
    await Promise.all([
        preloadGrassChunks(config, onProgress),
        preloadTreeChunks(config, onProgress),
    ]);

    onProgress?.({ total: 0, completed: 0, phase: 'done' });

    const elapsed = performance.now() - startTime;
    console.log(`[WorldPreloader] Preload complete in ${elapsed.toFixed(0)}ms`);
}

/**
 * Check if the world cache needs preloading
 * Returns true if essential chunks are missing
 */
export async function needsPreload(
    config: PreloadConfig
): Promise<boolean> {
    const { terrain, terrainParams, spawnX, spawnZ } = config;

    // Check if the immediate terrain chunks are cached
    const centerChunkX = Math.floor(spawnX / terrain.chunkSize);
    const centerChunkZ = Math.floor(spawnZ / terrain.chunkSize);

    const cacheKey = makeChunkKey(terrainParams.seed, centerChunkX, centerChunkZ, CACHE_VERSION);
    const existing = await getChunk('terrainChunks', cacheKey);

    return existing === null;
}
