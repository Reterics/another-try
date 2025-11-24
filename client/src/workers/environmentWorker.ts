/// <reference lib="webworker" />
import { EarthParams, EarthTerrain, sampleDefaultSplat, WATER_LEVEL } from "../utils/terrain.ts";

type WorkerRequestType = 'grass-heights' | 'chunk-data' | 'impostor-heights';

type GrassHeightPayload = {
    instanceCount: number;
    patchSize: number;
    origin: { x: number; z: number };
    terrainParams: EarthParams;
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
    payload: GrassHeightPayload | ChunkDataPayload | ImpostorHeightsPayload;
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
    };
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let cachedParamsKey = '';
let cachedTerrain: EarthTerrain | null = null;

// Deterministic hash-based pseudo-random in [0,1)
const hash2 = (x: number, z: number, seed = 0) => {
    const h = Math.sin(x * 127.1 + z * 311.7 + seed * 17.23) * 43758.5453123;
    return h - Math.floor(h);
};

const serializeParams = (params: EarthParams) => JSON.stringify(params);

const ensureTerrain = (params: EarthParams) => {
    const key = serializeParams(params);
    if (!cachedTerrain || cachedParamsKey !== key) {
        cachedTerrain = new EarthTerrain(params);
        cachedParamsKey = key;
    }
    return cachedTerrain;
};

const handleGrassHeights = (
    payload: GrassHeightPayload
) => {
    const terrain = ensureTerrain(payload.terrainParams);
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
    const positions = payload.positions instanceof Float32Array
        ? payload.positions
        : new Float32Array(payload.positions);
    const heights = new Float32Array(positions.length / 3);
    const terrain = ensureTerrain(payload.terrainParams);
    for (let i = 0, v = 0; i < positions.length; i += 3, v++) {
        const wx = positions[i];
        const wz = positions[i + 2];
        heights[v] = terrain.sampleHeight(wx, wz);
    }

    const resolution = payload.splatResolution;
    const data = new Uint8Array(resolution * resolution * 4);
    const step = payload.chunkSize / Math.max(1, resolution - 1);
    const minX = payload.chunkX * payload.chunkSize;
    const minZ = payload.chunkZ * payload.chunkSize;
    const sampler = (x: number, z: number) => terrain.sampleHeight(x, z);
    for (let j = 0; j < resolution; j++) {
        for (let i = 0; i < resolution; i++) {
            const wx = minX + i * step;
            const wz = minZ + j * step;
            const weights = sampleDefaultSplat(sampler, wx, wz, undefined, 6);
            const idx = (j * resolution + i) * 4;
            data[idx] = Math.min(255, Math.round(weights.r * 255));
            data[idx + 1] = Math.min(255, Math.round(weights.g * 255));
            data[idx + 2] = Math.min(255, Math.round(weights.b * 255));
            data[idx + 3] = Math.min(255, Math.round(weights.a * 255));
        }
    }

    return {
        heights,
        splat: data,
        splatResolution: resolution
    };
};

const handleImpostorHeights = (
    payload: ImpostorHeightsPayload
) => {
    const positions = payload.positions instanceof Float32Array
        ? payload.positions
        : new Float32Array(payload.positions);
    const terrain = ensureTerrain(payload.terrainParams);
    const count = positions.length / 2;
    const heights = new Float32Array(count);
    for (let i = 0, j = 0; i < positions.length; i += 2, j++) {
        const wx = positions[i];
        const wz = positions[i + 1];
        heights[j] = terrain.sampleHeight(wx, wz);
    }
    return { heights };
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
        ctx.postMessage(message, transfers);
    };
    try {
        if (type === 'grass-heights') {
            const payloadResult = handleGrassHeights(payload as GrassHeightPayload);
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
