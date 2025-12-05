import type { EarthParams } from "../utils/terrain.ts";

type WorkerRequestType = 'grass-heights' | 'grass-instances' | 'chunk-data' | 'impostor-heights' | 'tree-instances';

interface WorkerRequestPayloads {
    'grass-heights': {
        instanceCount: number;
        patchSize: number;
        origin: { x: number; z: number };
        terrainParams: EarthParams;
    };
    'grass-instances': {
        instanceCount: number;
        patchSize: number;
        origin: { x: number; z: number };
        terrainParams: EarthParams;
        seed: number;
    };
    'chunk-data': {
        positions: Float32Array;
        terrainParams: EarthParams;
        chunkX: number;
        chunkZ: number;
        chunkSize: number;
        chunkSegments: number;
        splatResolution: number;
    };
    'impostor-heights': {
        positions: Float32Array;
        terrainParams: EarthParams;
    };
    'tree-instances': {
        instanceCount: number;
        patchSize: number;
        origin: { x: number; z: number };
        terrainParams: EarthParams;
        seed: number;
        grassThreshold: number;
        minHeight: number;
        maxHeight: number;
    };
}

type WorkerResponsePayloads = {
    'grass-heights': {
        heights: Float32Array;
        seeds: Float32Array;
    };
    'grass-instances': {
        positions: Float32Array;
        instanceData: Float32Array;
        count: number;
    };
    'chunk-data': {
        heights: Float32Array;
        splat: Uint8Array;
        splatResolution: number;
    };
    'impostor-heights': {
        heights: Float32Array;
    };
    'tree-instances': {
        positions: Float32Array;
        instanceData: Float32Array;
        count: number;
    };
}

interface WorkerMessage<T extends WorkerRequestType> {
    id: number;
    type: T;
    payload: WorkerRequestPayloads[T];
}

interface WorkerResponse<T extends WorkerRequestType> {
    id: number;
    type: T;
    success: boolean;
    error?: string;
    payload?: WorkerResponsePayloads[T];
}

class EnvironmentWorkerClient {
    private worker: Worker;
    private seq = 0;
    private pending = new Map<number, {
        resolve: (value: any) => void;
        reject: (error: unknown) => void;
        type: WorkerRequestType;
    }>();

    constructor() {
        this.worker = new Worker(new URL('./environmentWorker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (event: MessageEvent<WorkerResponse<WorkerRequestType>>) => {
            const message = event.data;
            const record = this.pending.get(message.id);
            if (!record) {
                return;
            }
            this.pending.delete(message.id);
            if (!message.success || !message.payload) {
                record.reject(message.error || 'Unknown worker error');
                return;
            }
            record.resolve(message.payload);
        };
        this.worker.onerror = (err) => {
            console.error('[EnvironmentWorker] Unhandled worker error', err);
        };
    }

    private postMessage<T extends WorkerRequestType>(type: T, payload: WorkerRequestPayloads[T], transferables?: Transferable[]) {
        const id = ++this.seq;
        const message: WorkerMessage<T> = { id, type, payload };
        return new Promise<WorkerResponsePayloads[T]>((resolve, reject) => {
            this.pending.set(id, { resolve, reject, type });
            this.worker.postMessage(message, transferables || []);
        });
    }

    computeGrassHeights(params: WorkerRequestPayloads['grass-heights']) {
        return this.postMessage('grass-heights', params);
    }

    /**
     * Compute grass instance data for the new foliage system
     * Returns positions and per-instance data (rotation, scale, variant, random)
     */
    computeGrassInstances(params: WorkerRequestPayloads['grass-instances']) {
        return this.postMessage('grass-instances', params);
    }

    computeChunkData(params: WorkerRequestPayloads['chunk-data']) {
        const transfers: Transferable[] = [];
        if (params.positions?.buffer) {
            transfers.push(params.positions.buffer);
        }
        return this.postMessage('chunk-data', params, transfers);
    }

    computeImpostorHeights(params: WorkerRequestPayloads['impostor-heights']) {
        const transfers: Transferable[] = [];
        if (params.positions?.buffer) {
            transfers.push(params.positions.buffer);
        }
        return this.postMessage('impostor-heights', params, transfers);
    }

    /**
     * Compute tree instance data for the tree system
     * Returns positions and per-instance data (rotation, scale, variant)
     */
    computeTreeInstances(params: WorkerRequestPayloads['tree-instances']) {
        return this.postMessage('tree-instances', params);
    }
}

export const environmentWorkerClient = new EnvironmentWorkerClient();
