/// <reference lib="webworker" />
import { EarthParams, sampleDefaultSplat, WATER_LEVEL } from "../utils/terrain.ts";
import {
    buildSplatData,
    createTerrainCache,
    hash2,
    sampleHeightsForPositions,
    toFloat32Array
} from "../utils/terrainHelpers.ts";
// DO not refactor this to @app/foliage
import { GRASS_CONSTANTS, TREE_CONSTANTS } from "../foliage/types.ts";

type WorkerRequestType = 'grass-heights' | 'grass-instances' | 'chunk-data' | 'impostor-heights' | 'tree-instances';

type GrassHeightPayload = {
    instanceCount: number;
    patchSize: number;
    origin: { x: number; z: number };
    terrainParams: EarthParams;
};

type GrassInstancesPayload = {
    instanceCount: number;
    patchSize: number;
    origin: { x: number; z: number };
    terrainParams: EarthParams;
    seed: number;
};

type ChunkDataPayload = {
    positions: Float32Array;
    terrainParams: EarthParams;
    chunkX: number;
    chunkZ: number;
    chunkSize: number;
    chunkSegments: number;
    splatResolution: number;
};

type ImpostorHeightsPayload = {
    positions: Float32Array;
    terrainParams: EarthParams;
};

type TreeInstancesPayload = {
    instanceCount: number;
    patchSize: number;
    origin: { x: number; z: number };
    terrainParams: EarthParams;
    seed: number;
    grassThreshold: number;
    minHeight: number;
    maxHeight: number;
};

interface WorkerRequest {
    id: number;
    type: WorkerRequestType;
    payload: GrassHeightPayload | GrassInstancesPayload | ChunkDataPayload | ImpostorHeightsPayload | TreeInstancesPayload;
}

interface WorkerResponse {
    id: number;
    type: WorkerRequestType;
    success: boolean;
    error?: string;
    payload?: {
        heights?: Float32Array;
        seeds?: Float32Array;
        splat?: Uint8Array;
        splatResolution?: number;
        // New grass instance data
        positions?: Float32Array;
        instanceData?: Float32Array;
        count?: number;
    };
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const getTerrain = createTerrainCache();

const handleGrassHeights = (
    payload: GrassHeightPayload
) => {
    const terrain = getTerrain(payload.terrainParams);
    const originX = payload.origin.x;
    const originZ = payload.origin.z;

    // Temporary buffers (max possible size)
    const maxInstances = Math.max(0, Math.min(payload.instanceCount, 1_000_000));
    const tmpHeights = new Float32Array(maxInstances);
    const tmpSeeds = new Float32Array(maxInstances * 2);
    let outCount = 0;

    const sampler = (x: number, z: number) => terrain.sampleHeight(x, z);
    const seedBase = payload.terrainParams.seed ?? 0;

    for (let i = 0; i < maxInstances; i++) {
        // Deterministic seed per candidate
        const sx = hash2(i + 1 + originX * 0.031, originZ * 0.017 + seedBase * 0.001, seedBase);
        const sz = hash2(i + 7 + originZ * 0.029, originX * 0.013 + seedBase * 0.002, seedBase + 13.37);
        const localX = (sx - 0.5) * payload.patchSize;
        const localZ = (sz - 0.5) * payload.patchSize;
        const wx = originX + localX;
        const wz = originZ + localZ;
        const h = terrain.sampleHeight(wx, wz);
        // Exclude underwater instantly
        if (h <= WATER_LEVEL) continue;
        // Splat-based density: r=sand, g=grass, b=dirt, a=rock; snow = leftover
        const w = sampleDefaultSplat(sampler, wx, wz, undefined, 6);
        const snow = Math.max(0, 1 - (w.r + w.g + w.b + w.a));
        let density = (w.g * 1.0 + w.b * 0.5);
        density *= (1 - w.r) * (1 - w.a) * (1 - snow);
        if (density <= 0) {
            continue;
        }
        // Deterministic acceptance to avoid visual popping
        const rand = hash2(wx, wz, seedBase);
        if (rand > density) {
            continue;
        }
        // Accept: pack seed and height
        tmpSeeds[outCount * 2] = sx;
        tmpSeeds[outCount * 2 + 1] = sz;
        tmpHeights[outCount] = h;
        outCount++;
    }

    const heights = new Float32Array(outCount);
    const seeds = new Float32Array(outCount * 2);
    if (outCount > 0) {
        heights.set(tmpHeights.subarray(0, outCount));
        seeds.set(tmpSeeds.subarray(0, outCount * 2));
    }
    return { heights, seeds };
};

const handleChunkData = (
    payload: ChunkDataPayload
) => {
    const positions = toFloat32Array(payload.positions);
    const terrain = getTerrain(payload.terrainParams);
    const sampler = (x: number, z: number) => terrain.sampleHeight(x, z);
    const heights = sampleHeightsForPositions(positions, sampler);
    const { data, resolution } = buildSplatData({
        sampler,
        chunkX: payload.chunkX,
        chunkZ: payload.chunkZ,
        chunkSize: payload.chunkSize,
        resolution: payload.splatResolution
    });

    return {
        heights,
        splat: data,
        splatResolution: resolution
    };
};

const handleImpostorHeights = (
    payload: ImpostorHeightsPayload
) => {
    const positions = toFloat32Array(payload.positions);
    const terrain = getTerrain(payload.terrainParams);
    const sampler = (x: number, z: number) => terrain.sampleHeight(x, z);
    const heights = sampleHeightsForPositions(positions, sampler, 2, 0, 1);
    return { heights };
};

// Note: instanceCount from GrassSystem is now TUFT count, not blade count
// Each tuft contains 5 blades, so we generate fewer instances for same visual density
const TUFTS_PER_CLUSTER = { min: 3, max: 8 }; // Tufts per cluster (not blades)
const CLUSTER_OVERSAMPLE = 1.1;
const CLUSTER_RADIUS_MIN = GRASS_CONSTANTS.CLUMP_RADIUS_MIN;
const CLUSTER_RADIUS_MAX = GRASS_CONSTANTS.CLUMP_RADIUS_MAX * 1.5;

const computeDensityWeight = (weights: { r: number; g: number; b: number; a: number }) => {
    const snow = Math.max(0, 1 - (weights.r + weights.g + weights.b + weights.a));
    const biome = weights.g * 1.0 + weights.b * 0.5;
    const blockers = (1 - weights.r) * (1 - weights.a) * (1 - snow);
    const boosted = biome * blockers * 1.35;
    return Math.min(1, Math.max(0, boosted));
};

const pickVariant = (weights: { r: number; g: number; b: number; a: number }, variantRand: number) => {
    if (weights.g > weights.b) {
        if (variantRand < 0.4) return 0;
        if (variantRand < 0.8) return 1;
        return 2;
    }
    if (variantRand < 0.7) return 0;
    return 1;
};

/**
 * Handle grass instances request
 *
 * Generates TUFT positions (not individual blades).
 * Each tuft is a single instance containing 5 blades in the geometry.
 * This creates natural grass clumps and is more efficient (5x fewer instances).
 *
 * Returns: positions (x,y,z) and instanceData (rotation, scale, variant, random) per TUFT
 */
const handleGrassInstances = (
    payload: GrassInstancesPayload
) => {
    const terrain = getTerrain(payload.terrainParams);
    const originX = payload.origin.x;
    const originZ = payload.origin.z;
    const patchSize = payload.patchSize;
    const seedBase = payload.seed ?? payload.terrainParams.seed ?? 0;

    // instanceCount is now TUFT count (GrassSystem divides blade density by 5)
    const requestedCount = Math.max(0, Math.min(payload.instanceCount, GRASS_CONSTANTS.MAX_INSTANCES_PER_PATCH));
    const maxTufts = Math.max(
        0,
        Math.min(
            Math.floor(requestedCount * CLUSTER_OVERSAMPLE),
            GRASS_CONSTANTS.MAX_INSTANCES_PER_PATCH,
            1_000_000
        )
    );

    const tmpPositions = new Float32Array(maxTufts * 3);
    const tmpInstanceData = new Float32Array(maxTufts * 4);
    let outCount = 0;

    const sampler = (x: number, z: number) => terrain.sampleHeight(x, z);

    // Calculate cluster distribution for tufts
    const avgTuftsPerCluster = (TUFTS_PER_CLUSTER.min + TUFTS_PER_CLUSTER.max) * 0.5;
    const clusterCount = Math.max(1, Math.ceil(maxTufts / avgTuftsPerCluster));
    const maxClusterAttempts = Math.max(clusterCount * 2, Math.ceil(maxTufts / TUFTS_PER_CLUSTER.min));

    for (let clusterIndex = 0; clusterIndex < maxClusterAttempts && outCount < maxTufts; clusterIndex++) {
        // Deterministic cluster center position
        const centerNoiseX = hash2(
            originX * 0.013 + clusterIndex * 19.17,
            originZ * 0.071 + clusterIndex * 23.71,
            seedBase
        );
        const centerNoiseZ = hash2(
            originZ * 0.017 + clusterIndex * 21.37,
            originX * 0.067 + clusterIndex * 27.19,
            seedBase + 7.13
        );
        const clusterCenterX = originX + (centerNoiseX - 0.5) * patchSize;
        const clusterCenterZ = originZ + (centerNoiseZ - 0.5) * patchSize;

        // Check if cluster center is in a valid grass area
        const centerWeights = sampleDefaultSplat(sampler, clusterCenterX, clusterCenterZ, undefined, 6);
        const centerDensity = computeDensityWeight(centerWeights);
        if (centerDensity <= 0.05) {
            continue;
        }

        // How many tufts in this cluster
        const clusterSizeNoise = hash2(clusterIndex * 3.11, clusterIndex * 5.19, seedBase);
        let tuftsInCluster = Math.floor(
            TUFTS_PER_CLUSTER.min + clusterSizeNoise * (TUFTS_PER_CLUSTER.max - TUFTS_PER_CLUSTER.min + 1)
        );
        tuftsInCluster = Math.min(tuftsInCluster, maxTufts - outCount);
        if (tuftsInCluster <= 0) {
            break;
        }

        // Cluster radius
        const radiusNoise = hash2(clusterIndex * 7.13, clusterIndex * 11.17, seedBase);
        const clusterRadius = CLUSTER_RADIUS_MIN + radiusNoise * (CLUSTER_RADIUS_MAX - CLUSTER_RADIUS_MIN);

        // Place tufts within this cluster
        for (let i = 0; i < tuftsInCluster && outCount < maxTufts; i++) {
            // Distribute tufts using polar coordinates with some randomness
            const angle = hash2(clusterIndex * 13.37 + i * 0.37, clusterIndex * 17.23 + i * 0.71, seedBase) * Math.PI * 2;
            const radiusRand = Math.sqrt(hash2(clusterIndex * 19.97 + i * 0.53, clusterIndex * 23.11 + i * 0.91, seedBase));
            const anisotropy = 0.7 + hash2(clusterIndex * 29.71 + i * 0.21, clusterIndex * 31.19 + i * 0.33, seedBase) * 0.5;
            const offsetR = radiusRand * clusterRadius;
            const wx = clusterCenterX + Math.cos(angle) * offsetR * anisotropy;
            const wz = clusterCenterZ + Math.sin(angle) * offsetR / anisotropy;

            // Sample terrain height at tuft position
            const height = sampler(wx, wz);
            if (height <= WATER_LEVEL) {
                continue;
            }

            // Check splat-based density at this position
            const weights = sampleDefaultSplat(sampler, wx, wz, undefined, 6);
            const density = computeDensityWeight(weights) * (0.8 + centerDensity * 0.2);
            if (density <= 0.05) {
                continue;
            }

            // Probabilistic acceptance based on density
            const acceptRand = hash2(wx, wz, seedBase);
            if (acceptRand > density) {
                continue;
            }

            // Tuft instance data
            const rotation = hash2(wx + 100, wz + 100, seedBase) * Math.PI * 2;
            const scaleRand = hash2(wx + 200, wz + 200, seedBase);
            const scale = 0.75 + Math.pow(scaleRand, 0.6) * 0.5;
            const random = hash2(wx + 400, wz + 400, seedBase);
            const variantRand = hash2(wx + 300, wz + 300, seedBase);
            const variant = pickVariant(weights, variantRand);

            tmpPositions[outCount * 3] = wx;
            tmpPositions[outCount * 3 + 1] = height;
            tmpPositions[outCount * 3 + 2] = wz;

            tmpInstanceData[outCount * 4] = rotation;
            tmpInstanceData[outCount * 4 + 1] = scale;
            tmpInstanceData[outCount * 4 + 2] = variant;
            tmpInstanceData[outCount * 4 + 3] = random;

            outCount++;
        }
    }

    const finalCount = Math.min(outCount, requestedCount);
    const positions = new Float32Array(finalCount * 3);
    const instanceData = new Float32Array(finalCount * 4);

    if (finalCount > 0) {
        positions.set(tmpPositions.subarray(0, finalCount * 3));
        instanceData.set(tmpInstanceData.subarray(0, finalCount * 4));
    }

    return { positions, instanceData, count: finalCount };
};

/**
 * Handle tree instances request
 * Returns tree positions and instance data (rotation, scale, variant)
 * Only places trees in grass areas (green splat channel >= threshold)
 */
const handleTreeInstances = (
    payload: TreeInstancesPayload
) => {
    const terrain = getTerrain(payload.terrainParams);
    const originX = payload.origin.x;
    const originZ = payload.origin.z;
    const patchSize = payload.patchSize;
    const seedBase = payload.seed ?? payload.terrainParams.seed ?? 0;
    const grassThreshold = payload.grassThreshold ?? 0.3;
    const minHeight = payload.minHeight ?? 3;
    const maxHeight = payload.maxHeight ?? 5;

    const requestedCount = Math.max(0, Math.min(payload.instanceCount, TREE_CONSTANTS.MAX_INSTANCES_PER_PATCH));
    const maxAttempts = requestedCount * 5; // More attempts since trees are sparser

    const tmpPositions = new Float32Array(requestedCount * 3);
    const tmpInstanceData = new Float32Array(requestedCount * 3); // rotation, scale, variant
    let outCount = 0;

    const sampler = (x: number, z: number) => terrain.sampleHeight(x, z);

    // Use Poisson-disk-like distribution with minimum spacing
    const minSpacing = 4.0; // Minimum 4m between trees
    const placedPositions: { x: number; z: number }[] = [];

    for (let attempt = 0; attempt < maxAttempts && outCount < requestedCount; attempt++) {
        // Deterministic position within patch
        const sx = hash2(
            attempt + 1 + originX * 0.023,
            originZ * 0.019 + seedBase * 0.003,
            seedBase + 1000
        );
        const sz = hash2(
            attempt + 7 + originZ * 0.031,
            originX * 0.027 + seedBase * 0.005,
            seedBase + 2000
        );
        const localX = (sx - 0.5) * patchSize;
        const localZ = (sz - 0.5) * patchSize;
        const wx = originX + localX;
        const wz = originZ + localZ;

        // Sample terrain height
        const height = sampler(wx, wz);
        if (height <= WATER_LEVEL) {
            continue; // Skip underwater
        }

        // Check splat weights - only place in grass areas
        const weights = sampleDefaultSplat(sampler, wx, wz, undefined, 6);
        const snow = Math.max(0, 1 - (weights.r + weights.g + weights.b + weights.a));

        // Trees only on grass (green channel)
        if (weights.g < grassThreshold) {
            continue; // Not enough grass
        }

        // Avoid rocky, sandy, and snowy areas
        if (weights.r > 0.3 || weights.a > 0.3 || snow > 0.2) {
            continue;
        }

        // Check minimum spacing from other trees
        let tooClose = false;
        for (const placed of placedPositions) {
            const dx = wx - placed.x;
            const dz = wz - placed.z;
            if (dx * dx + dz * dz < minSpacing * minSpacing) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) {
            continue;
        }

        // Additional density modulation based on grass amount
        const densityFactor = (weights.g - grassThreshold) / (1 - grassThreshold);
        const acceptRand = hash2(wx * 0.07, wz * 0.11, seedBase + 3000);
        if (acceptRand > densityFactor * 0.5 + 0.2) {
            continue;
        }

        // Accept tree at this position
        placedPositions.push({ x: wx, z: wz });

        tmpPositions[outCount * 3] = wx;
        tmpPositions[outCount * 3 + 1] = height;
        tmpPositions[outCount * 3 + 2] = wz;

        // Random Y rotation
        const rotation = hash2(wx + 500, wz + 500, seedBase) * Math.PI * 2;

        // Scale based on height range (3-5m)
        const scaleRand = hash2(wx + 600, wz + 600, seedBase);
        const scale = minHeight + scaleRand * (maxHeight - minHeight);

        // Variant (0 or 1)
        const variantRand = hash2(wx + 700, wz + 700, seedBase);
        const variant = variantRand < 0.5 ? 0 : 1;

        tmpInstanceData[outCount * 3] = rotation;
        tmpInstanceData[outCount * 3 + 1] = scale;
        tmpInstanceData[outCount * 3 + 2] = variant;

        outCount++;
    }

    const positions = new Float32Array(outCount * 3);
    const instanceData = new Float32Array(outCount * 3);

    if (outCount > 0) {
        positions.set(tmpPositions.subarray(0, outCount * 3));
        instanceData.set(tmpInstanceData.subarray(0, outCount * 3));
    }

    return { positions, instanceData, count: outCount };
};

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const { id, type, payload } = event.data;
    const sendResponse = (message: WorkerResponse) => {
        const transfers: Transferable[] = [];
        if (message.payload?.heights) {
            transfers.push(message.payload.heights.buffer);
        }
        if (message.payload?.seeds) {
            transfers.push(message.payload.seeds.buffer);
        }
        if (message.payload?.splat) {
            transfers.push(message.payload.splat.buffer);
        }
        if (message.payload?.positions) {
            transfers.push(message.payload.positions.buffer);
        }
        if (message.payload?.instanceData) {
            transfers.push(message.payload.instanceData.buffer);
        }
        ctx.postMessage(message, transfers);
    };
    try {
        if (type === 'grass-heights') {
            const payloadResult = handleGrassHeights(payload as GrassHeightPayload);
            sendResponse({ id, type, success: true, payload: payloadResult });
        } else if (type === 'grass-instances') {
            const payloadResult = handleGrassInstances(payload as GrassInstancesPayload);
            sendResponse({ id, type, success: true, payload: payloadResult });
        } else if (type === 'chunk-data') {
            const payloadResult = handleChunkData(payload as ChunkDataPayload);
            sendResponse({ id, type, success: true, payload: payloadResult });
        } else if (type === 'impostor-heights') {
            const payloadResult = handleImpostorHeights(payload as ImpostorHeightsPayload);
            sendResponse({ id, type, success: true, payload: payloadResult });
        } else if (type === 'tree-instances') {
            const payloadResult = handleTreeInstances(payload as TreeInstancesPayload);
            sendResponse({ id, type, success: true, payload: payloadResult });
        } else {
            sendResponse({ id, type, success: false, error: `Unknown worker task: ${type}` });
        }
    } catch (err) {
        sendResponse({
            id,
            type,
            success: false,
            error: err instanceof Error ? err.message : String(err)
        });
    }
};

