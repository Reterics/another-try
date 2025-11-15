import type { EarthParams } from "../utils/terrain.ts";

type WorkerRequestType = 'grass-heights' | 'chunk-data';

interface WorkerRequestPayloads {
    'grass-heights': {
        seeds: Float32Array;
        patchSize: number;
        origin: { x: number; z: number };
        terrainParams: EarthParams;
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
}

type WorkerResponsePayloads = {
    'grass-heights': {
        heights: Float32Array;
    };
    'chunk-data': {
        heights: Float32Array;
        splat: Uint8Array;
        splatResolution: number;
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

    computeChunkData(params: WorkerRequestPayloads['chunk-data']) {
        const transfers: Transferable[] = [];
        if (params.positions?.buffer) {
            transfers.push(params.positions.buffer);
        }
        return this.postMessage('chunk-data', params, transfers);
    }
}

export const environmentWorkerClient = new EnvironmentWorkerClient();
