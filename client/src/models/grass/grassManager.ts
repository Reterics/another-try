import { Scene, Vector3 } from "three";
import { TerrainManager } from "../../lib/terrainManager.ts";
import { GrassManagerOptions } from "../../types/grass.ts";
import { AdaptiveGrassPatch } from "./adaptiveGrassPatch.ts";
import type { EarthParams } from "../../utils/terrain.ts";
import { GrassImpostorField } from "./grassImpostorField.ts";

interface PatchRecord {
    key: string;
    chunkX: number;
    chunkZ: number;
    ring: number;
    patch: AdaptiveGrassPatch;
}

export class GrassManager {
    private readonly scene: Scene;
    private terrain: TerrainManager;
    private patchRadius!: number;
    private maxPatches!: number;
    private readonly overrides: GrassManagerOptions;
    private readonly patches: Map<string, PatchRecord>;
    private readonly pool: AdaptiveGrassPatch[];
    private chunkSize!: number;
    private heightSampler!: (x: number, z: number) => number;
    private instancesPerPatch!: number;
    private lodSteps!: number[];
    private windIntensity!: number;
    private enabled!: boolean;
    private lastChunk?: { x: number; z: number };
    private terrainParams!: EarthParams;
    private impostorRadius!: number;
    private impostorDensity!: number;
    private impostorField?: GrassImpostorField;

    constructor(scene: Scene, terrain: TerrainManager, options?: GrassManagerOptions) {
        this.scene = scene;
        this.terrain = terrain;
        this.overrides = options || {};
        this.patches = new Map();
        this.pool = [];
        this.configureFromTerrain();
    }

    update(playerPosition: Vector3, cameraPosition: Vector3, timeSeconds: number) {
        if (!this.enabled) {
            return;
        }
        this.ensurePatches(playerPosition);
        for (const record of this.patches.values()) {
            record.patch.update(timeSeconds);
        }
        this.impostorField?.update(playerPosition, cameraPosition);
    }

    setTerrain(terrain: TerrainManager) {
        this.terrain = terrain;
        this.disposeAllPatches();
        this.pool.forEach(patch => patch.dispose());
        this.pool.length = 0;
        this.impostorField?.dispose();
        this.impostorField = undefined;
        this.lastChunk = undefined;
        this.configureFromTerrain();
    }

    dispose() {
        this.disposeAllPatches();
        this.pool.forEach(patch => patch.dispose());
        this.pool.length = 0;
        this.impostorField?.dispose();
        this.impostorField = undefined;
    }

    private ensurePatches(position: Vector3) {
        const chunkX = Math.floor(position.x / this.chunkSize);
        const chunkZ = Math.floor(position.z / this.chunkSize);
        const needsUpdate = !this.lastChunk ||
            this.lastChunk.x !== chunkX ||
            this.lastChunk.z !== chunkZ ||
            this.patches.size === 0;

        if (!needsUpdate) {
            return;
        }

        this.lastChunk = { x: chunkX, z: chunkZ };
        const wanted = new Map<string, number>();
        const toCreate: Array<{ key: string; cx: number; cz: number; ring: number }> = [];
        for (let dz = -this.patchRadius; dz <= this.patchRadius; dz++) {
            for (let dx = -this.patchRadius; dx <= this.patchRadius; dx++) {
                const cx = chunkX + dx;
                const cz = chunkZ + dz;
                const ring = Math.max(Math.abs(dx), Math.abs(dz));
                const key = this.chunkKey(cx, cz);
                wanted.set(key, ring);
                const existing = this.patches.get(key);
                if (existing) {
                    if (existing.ring !== ring) {
                        existing.ring = ring;
                        existing.patch.setDensity(this.lodFactor(ring));
                    }
                    continue;
                }
                toCreate.push({ key, cx, cz, ring });
            }
        }

        for (const [key, record] of this.patches) {
            if (!wanted.has(key)) {
                record.patch.setVisible(false);
                this.pool.push(record.patch);
                this.patches.delete(key);
            }
        }

        for (const entry of toCreate) {
            const record = this.createPatch(entry.key, entry.cx, entry.cz, entry.ring);
            if (record) {
                this.patches.set(entry.key, record);
            }
        }
    }

    private createPatch(key: string, chunkX: number, chunkZ: number, ring: number): PatchRecord | null {
        const patch = this.obtainPatch();
        if (!patch) {
            return null;
        }
        patch.setTerrainParams(this.terrainParams);
        patch.setChunk(chunkX, chunkZ);
        patch.setDensity(this.lodFactor(ring));
        patch.setVisible(true);
        return { key, chunkX, chunkZ, ring, patch };
    }

    private obtainPatch(): AdaptiveGrassPatch | null {
        if (this.pool.length > 0) {
            const reused = this.pool.pop() || null;
            if (reused) {
                reused.setTerrainParams(this.terrainParams);
            }
            return reused;
        }
        if (this.patches.size >= this.maxPatches) {
            console.warn('[GrassManager] Grass patch limit reached.');
            return null;
        }
        return new AdaptiveGrassPatch({
            scene: this.scene,
            patchSize: this.chunkSize,
            maxInstances: this.instancesPerPatch,
            heightSampler: this.heightSampler,
            terrainParams: this.terrainParams,
            windIntensity: this.windIntensity,
        });
    }

    private configureFromTerrain() {
        const chunkConfig = this.terrain.getChunkConfig();
        this.chunkSize = chunkConfig.size;
        this.patchRadius = Math.max(0, this.overrides.patchRadius ?? chunkConfig.radius ?? 1);
        this.instancesPerPatch = this.overrides.instancesPerPatch ?? 60000;
        this.maxPatches = this.overrides.maxPatches ?? (this.patchRadius * 2 + 1) ** 2;
        this.lodSteps = this.overrides.lodSteps && this.overrides.lodSteps.length
            ? this.overrides.lodSteps.slice()
            : [1, 0.45, 0.1];
        this.windIntensity = this.overrides.windIntensity ?? 0.25;
        this.enabled = this.overrides.enabled ?? true;
        this.heightSampler = this.terrain.getHeightSampler();
        this.terrainParams = this.terrain.getTerrainParams();
        this.impostorRadius = this.overrides.impostorRadius ?? (this.patchRadius + 2);
        this.impostorDensity = Math.max(1, this.overrides.impostorDensity ?? 4);
        if (this.impostorField) {
            this.impostorField.setSampler(this.heightSampler);
            this.impostorField.setConfig(this.patchRadius, this.impostorRadius, this.chunkSize);
            this.impostorField.setDensity(this.impostorDensity);
        } else {
            this.impostorField = new GrassImpostorField({
                scene: this.scene,
                sampler: this.heightSampler,
                chunkSize: this.chunkSize,
                patchRadius: this.patchRadius,
                impostorRadius: this.impostorRadius,
                densityPerCell: this.impostorDensity
            });
        }
    }

    private disposeAllPatches() {
        this.patches.forEach(record => {
            record.patch.dispose();
        });
        this.patches.clear();
    }

    private chunkKey(x: number, z: number) {
        return `${x}:${z}`;
    }

    private lodFactor(ring: number) {
        const index = Math.min(ring, this.lodSteps.length - 1);
        return this.lodSteps[index];
    }
}
