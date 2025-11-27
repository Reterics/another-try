import { EarthParams, EarthTerrain, sampleDefaultSplat } from "./terrain.ts";

export type HeightSampler = (x: number, z: number) => number;

export const toFloat32Array = (positions: ArrayLike<number> | Float32Array) =>
    positions instanceof Float32Array ? positions : new Float32Array(positions);

// Deterministic hash-based pseudo-random in [0,1)
export const hash2 = (x: number, z: number, seed = 0) => {
    const h = Math.sin(x * 127.1 + z * 311.7 + seed * 17.23) * 43758.5453123;
    return h - Math.floor(h);
};

// Stable serializer for EarthParams to use as cache keys
export const serializeEarthParams = (params: EarthParams) => {
    // Keep ordering deterministic to avoid mismatched cache hits
    const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
    const sorted: Record<string, unknown> = {};
    for (const [k, v] of entries) sorted[k] = v;
    return JSON.stringify(sorted);
};

export const createTerrainCache = () => {
    let cachedParamsKey = '';
    let cachedTerrain: EarthTerrain | null = null;
    return (params: EarthParams) => {
        const key = serializeEarthParams(params);
        if (!cachedTerrain || cachedParamsKey !== key) {
            cachedTerrain = new EarthTerrain(params);
            cachedParamsKey = key;
        }
        return cachedTerrain;
    };
};

export const sampleHeightsForPositions = (
    positions: ArrayLike<number> | Float32Array,
    sampler: HeightSampler,
    stride = 3,
    xIndex = 0,
    zIndex = 2
) => {
    const src = toFloat32Array(positions);
    const count = Math.floor(src.length / Math.max(1, stride));
    const heights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const base = i * stride;
        const x = src[base + xIndex];
        const z = src[base + zIndex];
        heights[i] = sampler(x, z);
    }
    return heights;
};

export const buildSplatData = (params: {
    sampler: HeightSampler;
    chunkX: number;
    chunkZ: number;
    chunkSize: number;
    resolution: number;
    slopeDx?: number;
}) => {
    const { sampler, chunkX, chunkZ, chunkSize, resolution, slopeDx = 6 } = params;
    const data = new Uint8Array(resolution * resolution * 4);
    const step = chunkSize / Math.max(1, resolution - 1);
    const minX = chunkX * chunkSize;
    const minZ = chunkZ * chunkSize;
    for (let j = 0; j < resolution; j++) {
        for (let i = 0; i < resolution; i++) {
            const wx = minX + i * step;
            const wz = minZ + j * step;
            const weights = sampleDefaultSplat(sampler, wx, wz, undefined, slopeDx);
            const idx = (j * resolution + i) * 4;
            data[idx] = Math.min(255, Math.round(weights.r * 255));
            data[idx + 1] = Math.min(255, Math.round(weights.g * 255));
            data[idx + 2] = Math.min(255, Math.round(weights.b * 255));
            data[idx + 3] = Math.min(255, Math.round(weights.a * 255));
        }
    }
    return { data, resolution };
};

export const chunkKey = (x: number, z: number) => `${x}:${z}`;

export const chunkCenter = (chunkX: number, chunkZ: number, chunkSize: number) => ({
    x: chunkX * chunkSize + chunkSize * 0.5,
    z: chunkZ * chunkSize + chunkSize * 0.5
});
