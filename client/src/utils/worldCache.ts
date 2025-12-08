/**
 * WorldCache - IndexedDB-based persistent cache for world chunks
 *
 * Provides minimal async helpers for caching grass, tree, and terrain chunk data.
 * Key format: `seed=${seed}:cx=${cx}:cy=${cy}:v=${version}`
 * Store values as ArrayBuffer (typed array buffers only).
 *
 * Features size-based LRU eviction with 1GB budget.
 */

const DB_NAME = 'WorldCacheDB';
const DB_VERSION = 1;
const STORES = ['grassChunks', 'treeChunks', 'terrainChunks'] as const;

export type ChunkStore = typeof STORES[number];

// ========================================
// LRU Cache Configuration
// ========================================

/** Total cache budget in bytes (1GB) */
const CACHE_BUDGET = 1024 * 1024 * 1024;

/** Eviction triggers at 110% of budget */
const EVICTION_TRIGGER = 1.1;

/** Eviction reduces to 90% of budget */
const EVICTION_TARGET = 0.9;

// ========================================
// In-Memory Metadata for LRU
// ========================================

interface ChunkMeta {
    store: ChunkStore;
    key: string;
    size: number;
    lastAccessed: number;
}

/** In-memory metadata map: compositeKey -> ChunkMeta */
const metadataMap = new Map<string, ChunkMeta>();

/** Current total size of all cached chunks */
let totalCacheSize = 0;

/** Whether metadata has been initialized from IndexedDB */
let metadataInitialized = false;

/** Promise for metadata initialization (to avoid multiple inits) */
let metadataInitPromise: Promise<void> | null = null;

/** Whether eviction is currently running */
let evictionInProgress = false;

/**
 * Create composite key for metadata map
 */
function compositeKey(store: ChunkStore, key: string): string {
    return `${store}:${key}`;
}

// ========================================
// Database Connection
// ========================================

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open the IndexedDB database, creating object stores if needed
 */
function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            dbPromise = null;
            reject(request.error);
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            for (const storeName of STORES) {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            }
        };
    });

    return dbPromise;
}

// ========================================
// Metadata Initialization (Lazy, One-Time)
// ========================================

/**
 * Initialize metadata by scanning all stores once
 * Called lazily on first get/put operation
 */
async function initMetadata(): Promise<void> {
    if (metadataInitialized) return;
    if (metadataInitPromise) return metadataInitPromise;

    metadataInitPromise = (async () => {
        const startTime = performance.now();
        const db = await openDB();

        // Scan all stores in a single transaction
        const transaction = db.transaction(STORES, 'readonly');

        const scanPromises = STORES.map((storeName) => {
            return new Promise<void>((resolve) => {
                const store = transaction.objectStore(storeName);
                const request = store.openCursor();

                request.onsuccess = () => {
                    const cursor = request.result;
                    if (cursor) {
                        const key = cursor.key as string;
                        const value = cursor.value;
                        if (value instanceof ArrayBuffer) {
                            const size = value.byteLength;
                            const compKey = compositeKey(storeName, key);
                            metadataMap.set(compKey, {
                                store: storeName,
                                key,
                                size,
                                lastAccessed: Date.now(), // Assume all existing entries are recently used
                            });
                            totalCacheSize += size;
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };

                request.onerror = () => resolve(); // Ignore errors, continue
            });
        });

        await Promise.all(scanPromises);
        metadataInitialized = true;

        const elapsed = performance.now() - startTime;
        console.log(`[WorldCache] Metadata initialized: ${metadataMap.size} entries, ${(totalCacheSize / 1024 / 1024).toFixed(1)}MB in ${elapsed.toFixed(0)}ms`);
    })();

    return metadataInitPromise;
}

// ========================================
// LRU Eviction
// ========================================

/**
 * Trigger eviction if over budget
 * Runs asynchronously, non-blocking
 */
function maybeEvict(): void {
    const threshold = CACHE_BUDGET * EVICTION_TRIGGER;
    if (totalCacheSize <= threshold || evictionInProgress) {
        return;
    }

    evictionInProgress = true;

    // Run eviction async to not block the hot path
    (async () => {
        try {
            await runEviction();
        } catch (err) {
            console.warn('[WorldCache] Eviction failed:', err);
        } finally {
            evictionInProgress = false;
        }
    })();
}

/**
 * Run the actual eviction process
 */
async function runEviction(): Promise<void> {
    const targetSize = CACHE_BUDGET * EVICTION_TARGET;
    const bytesToFree = totalCacheSize - targetSize;

    if (bytesToFree <= 0) return;

    console.log(`[WorldCache] Evicting ${(bytesToFree / 1024 / 1024).toFixed(1)}MB to reach ${(targetSize / 1024 / 1024).toFixed(0)}MB target`);

    // Sort entries by lastAccessed (oldest first)
    const entries = Array.from(metadataMap.values());
    entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

    // Collect entries to delete
    const toDelete: ChunkMeta[] = [];
    let freedSize = 0;

    for (const entry of entries) {
        if (freedSize >= bytesToFree) break;
        toDelete.push(entry);
        freedSize += entry.size;
    }

    if (toDelete.length === 0) return;

    // Group by store for batch deletion
    const byStore = new Map<ChunkStore, string[]>();
    for (const entry of toDelete) {
        let keys = byStore.get(entry.store);
        if (!keys) {
            keys = [];
            byStore.set(entry.store, keys);
        }
        keys.push(entry.key);
    }

    // Delete from IndexedDB
    const db = await openDB();

    for (const [storeName, keys] of byStore) {
        // Use single transaction per store for efficiency
        await new Promise<void>((resolve) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);

            for (const key of keys) {
                store.delete(key);
            }

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve(); // Continue even on error
        });
    }

    // Update metadata
    for (const entry of toDelete) {
        const compKey = compositeKey(entry.store, entry.key);
        metadataMap.delete(compKey);
        totalCacheSize -= entry.size;
    }

    console.log(`[WorldCache] Evicted ${toDelete.length} entries, freed ${(freedSize / 1024 / 1024).toFixed(1)}MB`);
}

// ========================================
// Public API
// ========================================

/**
 * Generate a cache key for a chunk
 * @param seed - World generation seed
 * @param cx - Chunk X coordinate
 * @param cy - Chunk Y/Z coordinate (renamed cy for consistency)
 * @param version - Cache version for invalidation
 */
export function makeChunkKey(seed: number, cx: number, cy: number, version: number): string {
    return `seed=${seed}:cx=${cx}:cy=${cy}:v=${version}`;
}

/**
 * Retrieve a chunk from the cache
 * @param store - Object store name ('grassChunks', 'treeChunks', 'terrainChunks')
 * @param key - Chunk key (use makeChunkKey to generate)
 * @returns ArrayBuffer if found, null if not found
 */
export async function getChunk(store: ChunkStore, key: string): Promise<ArrayBuffer | null> {
    try {
        // Lazy init metadata
        await initMetadata();

        const db = await openDB();
        const result = await new Promise<ArrayBuffer | null>((resolve, reject) => {
            const transaction = db.transaction(store, 'readonly');
            const objectStore = transaction.objectStore(store);
            const request = objectStore.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const value = request.result;
                if (value instanceof ArrayBuffer) {
                    resolve(value);
                } else {
                    resolve(null);
                }
            };
        });

        // Update lastAccessed on cache hit
        if (result) {
            const compKey = compositeKey(store, key);
            const meta = metadataMap.get(compKey);
            if (meta) {
                meta.lastAccessed = Date.now();
            }
        }

        return result;
    } catch (error) {
        console.warn('[WorldCache] getChunk failed:', error);
        return null;
    }
}

/**
 * Store a chunk in the cache
 * @param store - Object store name ('grassChunks', 'treeChunks', 'terrainChunks')
 * @param key - Chunk key (use makeChunkKey to generate)
 * @param buffer - ArrayBuffer to store
 */
export async function putChunk(store: ChunkStore, key: string, buffer: ArrayBuffer): Promise<void> {
    try {
        // Lazy init metadata
        await initMetadata();

        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(store, 'readwrite');
            const objectStore = transaction.objectStore(store);
            const request = objectStore.put(buffer, key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });

        // Update metadata
        const compKey = compositeKey(store, key);
        const existingMeta = metadataMap.get(compKey);

        if (existingMeta) {
            // Update existing entry
            totalCacheSize -= existingMeta.size;
            existingMeta.size = buffer.byteLength;
            existingMeta.lastAccessed = Date.now();
            totalCacheSize += buffer.byteLength;
        } else {
            // New entry
            metadataMap.set(compKey, {
                store,
                key,
                size: buffer.byteLength,
                lastAccessed: Date.now(),
            });
            totalCacheSize += buffer.byteLength;
        }

        // Check if eviction needed (async, non-blocking)
        maybeEvict();

    } catch (error) {
        console.warn('[WorldCache] putChunk failed:', error);
    }
}

/**
 * Clear all data from a specific store
 * @param store - Object store name to clear
 */
export async function clearStore(store: ChunkStore): Promise<void> {
    try {
        await initMetadata();

        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(store, 'readwrite');
            const objectStore = transaction.objectStore(store);
            const request = objectStore.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });

        // Update metadata
        for (const [compKey, meta] of metadataMap) {
            if (meta.store === store) {
                totalCacheSize -= meta.size;
                metadataMap.delete(compKey);
            }
        }

    } catch (error) {
        console.warn('[WorldCache] clearStore failed:', error);
    }
}

/**
 * Clear all cached data
 */
export async function clearAllStores(): Promise<void> {
    for (const store of STORES) {
        await clearStore(store);
    }
}

/**
 * Get current cache statistics
 */
export function getCacheStats(): { totalSize: number; entryCount: number; budget: number } {
    return {
        totalSize: totalCacheSize,
        entryCount: metadataMap.size,
        budget: CACHE_BUDGET,
    };
}

// ========================================
// Serialization helpers for chunk data
// ========================================

/**
 * Grass chunk data structure
 */
export interface GrassChunkData {
    positions: Float32Array;
    instanceData: Float32Array;
    count: number;
}

/**
 * Serialize grass chunk data to ArrayBuffer
 * Layout: [count:4][positions:count*3*4][instanceData:count*4*4]
 */
export function serializeGrassChunk(data: GrassChunkData): ArrayBuffer {
    const headerSize = 4; // count as uint32
    const positionsSize = data.count * 3 * 4; // 3 floats per instance
    const instanceDataSize = data.count * 4 * 4; // 4 floats per instance
    const totalSize = headerSize + positionsSize + instanceDataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // Write count
    view.setUint32(0, data.count, true);

    // Write positions
    const positionsArray = new Float32Array(buffer, headerSize, data.count * 3);
    positionsArray.set(data.positions.subarray(0, data.count * 3));

    // Write instance data
    const instanceDataArray = new Float32Array(buffer, headerSize + positionsSize, data.count * 4);
    instanceDataArray.set(data.instanceData.subarray(0, data.count * 4));

    return buffer;
}

/**
 * Deserialize grass chunk data from ArrayBuffer
 */
export function deserializeGrassChunk(buffer: ArrayBuffer): GrassChunkData {
    const view = new DataView(buffer);
    const count = view.getUint32(0, true);

    const headerSize = 4;
    const positionsSize = count * 3 * 4;

    const positions = new Float32Array(buffer, headerSize, count * 3);
    const instanceData = new Float32Array(buffer, headerSize + positionsSize, count * 4);

    return { positions, instanceData, count };
}

/**
 * Tree chunk data structure
 */
export interface TreeChunkData {
    positions: Float32Array;
    instanceData: Float32Array;
    count: number;
}

/**
 * Serialize tree chunk data to ArrayBuffer
 * Layout: [count:4][positions:count*3*4][instanceData:count*3*4]
 */
export function serializeTreeChunk(data: TreeChunkData): ArrayBuffer {
    const headerSize = 4; // count as uint32
    const positionsSize = data.count * 3 * 4; // 3 floats per instance
    const instanceDataSize = data.count * 3 * 4; // 3 floats per instance (rotation, scale, variant)
    const totalSize = headerSize + positionsSize + instanceDataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // Write count
    view.setUint32(0, data.count, true);

    // Write positions
    const positionsArray = new Float32Array(buffer, headerSize, data.count * 3);
    positionsArray.set(data.positions.subarray(0, data.count * 3));

    // Write instance data
    const instanceDataArray = new Float32Array(buffer, headerSize + positionsSize, data.count * 3);
    instanceDataArray.set(data.instanceData.subarray(0, data.count * 3));

    return buffer;
}

/**
 * Deserialize tree chunk data from ArrayBuffer
 */
export function deserializeTreeChunk(buffer: ArrayBuffer): TreeChunkData {
    const view = new DataView(buffer);
    const count = view.getUint32(0, true);

    const headerSize = 4;
    const positionsSize = count * 3 * 4;

    const positions = new Float32Array(buffer, headerSize, count * 3);
    const instanceData = new Float32Array(buffer, headerSize + positionsSize, count * 3);

    return { positions, instanceData, count };
}

/**
 * Terrain chunk data structure
 */
export interface TerrainChunkData {
    heights: Float32Array;
    splat: Uint8Array;
    splatResolution: number;
}

/**
 * Serialize terrain chunk data to ArrayBuffer
 * Layout: [heightCount:4][splatResolution:4][heights:heightCount*4][splat:splatResolution^2*4]
 */
export function serializeTerrainChunk(data: TerrainChunkData): ArrayBuffer {
    const headerSize = 8; // heightCount + splatResolution as uint32
    const heightsSize = data.heights.length * 4;
    const splatSize = data.splat.length;
    const totalSize = headerSize + heightsSize + splatSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // Write header
    view.setUint32(0, data.heights.length, true);
    view.setUint32(4, data.splatResolution, true);

    // Write heights
    const heightsArray = new Float32Array(buffer, headerSize, data.heights.length);
    heightsArray.set(data.heights);

    // Write splat
    const splatArray = new Uint8Array(buffer, headerSize + heightsSize, data.splat.length);
    splatArray.set(data.splat);

    return buffer;
}

/**
 * Deserialize terrain chunk data from ArrayBuffer
 */
export function deserializeTerrainChunk(buffer: ArrayBuffer): TerrainChunkData {
    const view = new DataView(buffer);
    const heightCount = view.getUint32(0, true);
    const splatResolution = view.getUint32(4, true);

    const headerSize = 8;
    const heightsSize = heightCount * 4;

    const heights = new Float32Array(buffer, headerSize, heightCount);
    const splat = new Uint8Array(buffer, headerSize + heightsSize, splatResolution * splatResolution * 4);

    return { heights, splat, splatResolution };
}

// Cache version constant - increment when data format changes
export const CACHE_VERSION = 1;
