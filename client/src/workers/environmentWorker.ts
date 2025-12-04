/// <reference lib="webworker" />
import { EarthParams, sampleDefaultSplat, WATER_LEVEL } from "../utils/terrain.ts";
import {
    buildSplatData,
    createTerrainCache,
    hash2,
    sampleHeightsForPositions,
    toFloat32Array
} from "../utils/terrainHelpers.ts";

type WorkerRequestType = 'grass-heights' | 'grass-instances' | 'chunk-data' | 'impostor-heights';

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

interface WorkerRequest {
    id: number;
    type: WorkerRequestType;
    payload: GrassHeightPayload | GrassInstancesPayload | ChunkDataPayload | ImpostorHeightsPayload;
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

/**
 * Handle new grass instances request
 * Returns full instance data: positions (x,y,z) and instanceData (rotation, scale, variant, random)
 */
const handleGrassInstances = (
    payload: GrassInstancesPayload
) => {
    const terrain = getTerrain(payload.terrainParams);
    const originX = payload.origin.x;
    const originZ = payload.origin.z;
    const patchSize = payload.patchSize;
    const seedBase = payload.seed ?? payload.terrainParams.seed ?? 0;

    // Max instances capped at 1M for safety
    const maxInstances = Math.max(0, Math.min(payload.instanceCount, 1_000_000));

    // Temporary buffers
    const tmpPositions = new Float32Array(maxInstances * 3); // x, y, z
    const tmpInstanceData = new Float32Array(maxInstances * 4); // rotation, scale, variant, random
    let outCount = 0;

    const sampler = (x: number, z: number) => terrain.sampleHeight(x, z);

    for (let i = 0; i < maxInstances; i++) {
        // Deterministic position within patch using hash
        const sx = hash2(i + 1 + originX * 0.031, originZ * 0.017 + seedBase * 0.001, seedBase);
        const sz = hash2(i + 7 + originZ * 0.029, originX * 0.013 + seedBase * 0.002, seedBase + 13.37);

        const localX = (sx - 0.5) * patchSize;
        const localZ = (sz - 0.5) * patchSize;
        const wx = originX + localX;
        const wz = originZ + localZ;

        // Sample terrain height
        const height = terrain.sampleHeight(wx, wz);

        // Skip underwater
        if (height <= WATER_LEVEL) continue;

        // Splat-based density calculation
        // r=sand, g=grass, b=dirt, a=rock; snow = remaining
        const w = sampleDefaultSplat(sampler, wx, wz, undefined, 6);
        const snow = Math.max(0, 1 - (w.r + w.g + w.b + w.a));

        // Density: full on grass, half on dirt, none on sand/rock/snow
        let density = (w.g * 1.0 + w.b * 0.5);
        density *= (1 - w.r) * (1 - w.a) * (1 - snow);

        if (density <= 0) continue;

        // Deterministic acceptance based on world position
        const acceptRand = hash2(wx, wz, seedBase);
        if (acceptRand > density) continue;

        // Calculate per-instance data
        const rotation = hash2(wx + 100, wz + 100, seedBase) * Math.PI * 2; // 0 to 2π
        const scale = 0.8 + hash2(wx + 200, wz + 200, seedBase) * 0.4; // 0.8 to 1.2
        const random = hash2(wx + 400, wz + 400, seedBase); // 0 to 1

        // Variant selection based on biome
        // Grass-heavy: mix of all (40% short, 40% medium, 20% tall)
        // Dirt-heavy: mostly short (70% short, 30% medium)
        let variant: number;
        const variantRand = hash2(wx + 300, wz + 300, seedBase);

        if (w.g > w.b) {
            // Grass-dominant: all variants
            if (variantRand < 0.4) variant = 0;      // short
            else if (variantRand < 0.8) variant = 1; // medium
            else variant = 2;                         // tall
        } else {
            // Dirt-dominant: mostly short
            if (variantRand < 0.7) variant = 0;      // short
            else variant = 1;                         // medium (no tall)
        }

        // Store position (world coordinates)
        tmpPositions[outCount * 3] = wx;
        tmpPositions[outCount * 3 + 1] = height;
        tmpPositions[outCount * 3 + 2] = wz;

        // Store instance data
        tmpInstanceData[outCount * 4] = rotation;
        tmpInstanceData[outCount * 4 + 1] = scale;
        tmpInstanceData[outCount * 4 + 2] = variant;
        tmpInstanceData[outCount * 4 + 3] = random;

        outCount++;
    }

    // Create trimmed output arrays
    const positions = new Float32Array(outCount * 3);
    const instanceData = new Float32Array(outCount * 4);

    if (outCount > 0) {
        positions.set(tmpPositions.subarray(0, outCount * 3));
        instanceData.set(tmpInstanceData.subarray(0, outCount * 4));
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
