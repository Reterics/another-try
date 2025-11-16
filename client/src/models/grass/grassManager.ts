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
    private patchRadius!: number; // world units (1 unit = 1 meter)
    private maxPatches!: number;
    private readonly overrides: GrassManagerOptions;
    private readonly patches: Map<string, PatchRecord>;
    private readonly pool: AdaptiveGrassPatch[];
    private chunkSize!: number;
    private heightSampler!: (x: number, z: number) => number;
    private instancesPerPatch!: number;
    private lodSteps!: number[];
    private lodRadii!: number[]; // distances in world units
    private windIntensity!: number;
    private enabled!: boolean;
    private lastChunk?: { x: number; z: number };
    private terrainParams!: EarthParams;
    private impostorRadius!: number; // world units
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

        // Determine search bounds in chunk offsets based on precise circle-square intersection
        const halfDiag = this.chunkSize * Math.SQRT1_2; // half of cell diagonal
        const maxOffset = Math.ceil((this.patchRadius + halfDiag) / this.chunkSize) + 1;

        const wanted = new Map<string, number>(); // key -> lodIndex
        const toCreate: Array<{ key: string; cx: number; cz: number; lodIndex: number }> = [];

        for (let dz = -maxOffset; dz <= maxOffset; dz++) {
            for (let dx = -maxOffset; dx <= maxOffset; dx++) {
                const cx = chunkX + dx;
                const cz = chunkZ + dz;
                if (!this.cellIntersectsCircle(cx, cz, position.x, position.z, this.patchRadius)) {
                    continue;
                }
                const cellCenterX = cx * this.chunkSize + this.chunkSize * 0.5;
                const cellCenterZ = cz * this.chunkSize + this.chunkSize * 0.5;
                const dist = Math.hypot(cellCenterX - position.x, cellCenterZ - position.z);
                const key = this.chunkKey(cx, cz);
                const lodIndex = this.lodIndexForDistance(dist);
                wanted.set(key, lodIndex);
                const existing = this.patches.get(key);
                if (existing) {
                    // Update LOD for existing patches continuously based on distance
                    const currentIndex = existing.ring; // reuse ring field as lodIndex storage
                    if (currentIndex !== lodIndex) {
                        existing.ring = lodIndex;
                        existing.patch.setDensity(this.lodFactorByIndex(lodIndex));
                    }
                    continue;
                }
                toCreate.push({ key, cx, cz, lodIndex });
            }
        }

        // Always include the player's current chunk if selection is empty (tiny radius edge case)
        if (wanted.size === 0) {
            const key = this.chunkKey(chunkX, chunkZ);
            const lodIndex = 0;
            wanted.set(key, lodIndex);
            toCreate.push({ key, cx: chunkX, cz: chunkZ, lodIndex });
        }

        // Reconcile patches every update based on wanted set (safe, minimal churn)
        for (const [key, record] of this.patches) {
            if (!wanted.has(key)) {
                record.patch.setVisible(false);
                this.pool.push(record.patch);
                this.patches.delete(key);
            }
        }
        for (const entry of toCreate) {
            const record = this.createPatch(entry.key, entry.cx, entry.cz, entry.lodIndex);
            if (record) {
                this.patches.set(entry.key, record);
            }
        }

        // Track last chunk for potential optimization elsewhere
        this.lastChunk = { x: chunkX, z: chunkZ };
    }

    // Returns true if the circle centered at (cx, cz) with radius R intersects the AABB of the chunk cell at (cellX, cellZ)
    private cellIntersectsCircle(cellX: number, cellZ: number, centerX: number, centerZ: number, radius: number): boolean {
        const minX = cellX * this.chunkSize;
        const minZ = cellZ * this.chunkSize;
        const maxX = minX + this.chunkSize;
        const maxZ = minZ + this.chunkSize;
        // Clamp circle center to the AABB to find the closest point
        const closestX = Math.max(minX, Math.min(centerX, maxX));
        const closestZ = Math.max(minZ, Math.min(centerZ, maxZ));
        const dx = closestX - centerX;
        const dz = closestZ - centerZ;
        return (dx * dx + dz * dz) <= (radius * radius);
    }

    private createPatch(key: string, chunkX: number, chunkZ: number, lodIndex: number): PatchRecord | null {
        const patch = this.obtainPatch();
        if (!patch) {
            return null;
        }
        patch.setTerrainParams(this.terrainParams);
        // Compute world-space origin for this cell center and place patch by origin, not terrain chunk
        const originX = chunkX * this.chunkSize + this.chunkSize * 0.5;
        const originZ = chunkZ * this.chunkSize + this.chunkSize * 0.5;
        patch.setOrigin(originX, originZ);
        patch.setDensity(this.lodFactorByIndex(lodIndex));
        patch.setVisible(true);
        return { key, chunkX, chunkZ, ring: lodIndex, patch };
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
        // Use override patchSize if provided; otherwise fall back to terrain chunk size as a reasonable cell size
        this.chunkSize = this.overrides.patchSize ?? chunkConfig.size;

        // World-space radii (units == meters in your coord system)
        const providedPatch = this.overrides.patchRadius;
        const providedImpostor = this.overrides.impostorRadius;
        // Sensible defaults if not provided: half a cell for blades; impostors at least one cell beyond
        this.patchRadius = Math.max(0, providedPatch ?? this.chunkSize * 0.5);
        this.impostorRadius = Math.max(this.patchRadius + this.chunkSize, providedImpostor ?? (this.patchRadius + this.chunkSize));

        this.instancesPerPatch = this.overrides.instancesPerPatch ?? 60000;
        // Estimate number of patches by circle area / cell area
        const defaultMaxPatches = Math.ceil(Math.PI * (this.patchRadius * this.patchRadius) / (this.chunkSize * this.chunkSize)) + 4;
        this.maxPatches = this.overrides.maxPatches ?? defaultMaxPatches * 10;
        this.lodSteps = this.overrides.lodSteps && this.overrides.lodSteps.length
            ? this.overrides.lodSteps.slice()
            : [1, 0.45, 0.1];
        // LOD radii in world units: must be same length as lodSteps; last band ends at patchRadius
        const requestedRadii = this.overrides.lodRadii;
        const makeDefaultRadii = (count: number) => {
            if (count <= 1) return [this.patchRadius];
            const step = this.patchRadius / count;
            const arr: number[] = [];
            for (let i = 1; i <= count; i++) arr.push(step * i);
            return arr;
        };
        const baseRadii = requestedRadii && requestedRadii.length ? requestedRadii.slice() : makeDefaultRadii(this.lodSteps.length);
        // Normalize radii: clamp, sort ascending, and ensure same length as lodSteps
        baseRadii.sort((a, b) => a - b);
        while (baseRadii.length < this.lodSteps.length) baseRadii.push(this.patchRadius);
        if (baseRadii.length > this.lodSteps.length) baseRadii.length = this.lodSteps.length;
        baseRadii[baseRadii.length - 1] = this.patchRadius; // cap last to patch radius
        this.lodRadii = baseRadii;
        this.windIntensity = this.overrides.windIntensity ?? 0.25;
        this.enabled = this.overrides.enabled ?? true;
        this.heightSampler = this.terrain.getHeightSampler();
        this.terrainParams = this.terrain.getTerrainParams();
        this.impostorDensity = Math.max(1, this.overrides.impostorDensity ?? 4);
        if (this.impostorField) {
            this.impostorField.setSampler(this.heightSampler);
            this.impostorField.setConfig(this.patchRadius, this.impostorRadius, this.chunkSize);
            this.impostorField.setDensity(this.impostorDensity);
        } else {
            this.impostorField = new GrassImpostorField({
                scene: this.scene,
                sampler: this.heightSampler,
                chunkSize: this.chunkSize * 2,
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

    private lodIndexForDistance(distMeters: number) {
        for (let i = 0; i < this.lodRadii.length; i++) {
            if (distMeters <= this.lodRadii[i]) return i;
        }
        return this.lodRadii.length - 1;
    }

    private lodFactorByIndex(index: number) {
        const clamped = Math.max(0, Math.min(index, this.lodSteps.length - 1));
        return this.lodSteps[clamped];
    }
}
