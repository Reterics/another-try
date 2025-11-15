/// <reference lib="webworker" />
import { EarthParams, EarthTerrain, sampleDefaultSplat } from "../utils/terrain.ts";

type WorkerRequestType = 'grass-heights' | 'chunk-data';

type GrassHeightPayload = {
    seeds: Float32Array;
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

interface WorkerRequest {
    id: number;
    type: WorkerRequestType;
    payload: GrassHeightPayload | ChunkDataPayload;
}

interface WorkerResponse {
    id: number;
    type: WorkerRequestType;
    success: boolean;
    error?: string;
    payload?: {
        heights?: Float32Array;
        splat?: Uint8Array;
        splatResolution?: number;
    };
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let cachedParamsKey = '';
let cachedTerrain: EarthTerrain | null = null;

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
    const seeds = payload.seeds instanceof Float32Array ? payload.seeds : new Float32Array(payload.seeds);
    const heights = new Float32Array(seeds.length / 2);
    const terrain = ensureTerrain(payload.terrainParams);
    const originX = payload.origin.x;
    const originZ = payload.origin.z;
    for (let i = 0; i < heights.length; i++) {
        const sx = seeds[i * 2];
        const sz = seeds[i * 2 + 1];
        const localX = (sx - 0.5) * payload.patchSize;
        const localZ = (sz - 0.5) * payload.patchSize;
        const wx = originX + localX;
        const wz = originZ + localZ;
        heights[i] = terrain.sampleHeight(wx, wz);
    }
    return { heights };
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

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const { id, type, payload } = event.data;
    const sendResponse = (message: WorkerResponse) => {
        const transfers: Transferable[] = [];
        if (message.payload?.heights) {
            transfers.push(message.payload.heights.buffer);
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
