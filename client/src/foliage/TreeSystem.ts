/**
 * TreeSystem - Procedural tree placement system
 *
 * Places trees procedurally on grass splat areas with:
 * - Configurable density
 * - Height range 3-5 meters (configurable)
 * - Always upright (Y-up) regardless of terrain
 * - Collision cylinders for player blocking
 * - LOD-based culling with billboard/impostor system
 *   - LOD 0 (closest): Full 3D models
 *   - LOD 1-2 (distant): Billboard impostors for performance
 */

import {
    Scene,
    Vector3,
    Group,
    Object3D,
    CylinderGeometry,
    MeshBasicMaterial,
    Mesh,
    Box3,
    Sprite,
    SpriteMaterial,
    Camera,
    OrthographicCamera,
    WebGLRenderer,
    WebGLRenderTarget,
    Texture,
    CanvasTexture,
    LinearFilter,
    RGBAFormat,
    AmbientLight,
    DirectionalLight,
} from 'three';
import {
    type TreeParams,
    type TreeStats,
    type TreeWorkerResponse,
    type TerrainSampler,
    DEFAULT_TREE_PARAMS,
    TREE_CONSTANTS,
    TREE_VARIANTS,
} from './types';
import { environmentWorkerClient } from '../workers/environmentWorkerClient';
import type { EarthParams } from '../utils/terrain';
import { loadModel } from '../utils/model';
import { hash2 } from '../utils/terrainHelpers';

/**
 * Tree instance record for a patch
 */
interface TreeInstance {
    x: number;
    y: number;
    z: number;
    rotation: number;
    scale: number;
    variant: number;
}

/**
 * Patch record for internal tracking
 */
interface TreePatchRecord {
    key: string;
    chunkX: number;
    chunkZ: number;
    instances: TreeInstance[];
    meshes: Object3D[];
    colliders: Mesh[];
    lodTier: number;
    activeLodTier: number; // The LOD tier for which meshes are currently loaded
    distanceToPlayer: number;
    pendingWorker: boolean;
    workerGeneration: number;
    visible: boolean;
}

/**
 * Worker queue item
 */
interface WorkerQueueItem {
    key: string;
    chunkX: number;
    chunkZ: number;
    priority: number;
    generation: number;
}

/**
 * TreeSystem - Procedural tree placement on grass areas
 *
 * Usage:
 * ```ts
 * const trees = new TreeSystem({ densityPerSqM: 0.01, maxDistance: 150 });
 * await trees.loadModels(); // Also generates billboard textures
 * trees.setTerrainSampler(terrain.getHeightSampler());
 * trees.setCamera(camera); // For billboard orientation
 * trees.attach(scene);
 *
 * // In render loop:
 * trees.update(deltaTime, playerPosition);
 *
 * // Get collision meshes for BVH:
 * const colliders = trees.getColliderMeshes();
 * ```
 */
export class TreeSystem {
    // ========================================
    // Core State
    // ========================================

    private scene: Scene | null = null;
    private params: TreeParams;
    private enabled: boolean = true;

    // ========================================
    // Model Assets
    // ========================================

    private treeModels: Group[] = [];
    private treeModelScales: number[] = []; // Scale factor to normalize each model to 1m height
    private modelsLoaded: boolean = false;

    // ========================================
    // Billboard/Impostor System
    // ========================================

    private billboardTextures: Texture[] = []; // One texture per tree variant
    private billboardFrustumSize: number = 1.2; // Orthographic frustum size used for rendering
    private _camera: Camera | null = null; // Reserved for future billboard enhancements (Sprites auto-face camera)

    // ========================================
    // Patch Management
    // ========================================

    private patches: Map<string, TreePatchRecord> = new Map();
    private treeGroup: Group;
    private colliderGroup: Group;

    // ========================================
    // Worker Queue
    // ========================================

    private workerQueue: WorkerQueueItem[] = [];
    private activeWorkerRequests: number = 0;
    private maxConcurrentWorkers: number = 2;
    private workerGeneration: number = 0;

    // ========================================
    // Terrain Integration
    // ========================================

    private terrainSampler: TerrainSampler | null = null;
    private terrainParams: EarthParams | null = null;

    // ========================================
    // Performance Tracking
    // ========================================

    private lastPlayerChunk: { x: number; z: number } | null = null;
    private framesSinceFullUpdate: number = 0;
    private readonly fullUpdateInterval: number = 60;
    private readonly maxLODSwitchesPerFrame: number = 5; // Limit LOD transitions to prevent frame drops

    // ========================================
    // Collision callback
    // ========================================

    private onCollidersChanged: (() => void) | null = null;

    constructor(params: Partial<TreeParams> = {}) {
        this.params = { ...DEFAULT_TREE_PARAMS, ...params };
        this.enabled = this.params.enabled;


        const lastLodDistance = this.params.lodDistances[this.params.lodDistances.length - 1];
        if (lastLodDistance !== this.params.maxDistance) {
            this.params.maxDistance = lastLodDistance;
        }

        this.treeGroup = new Group();
        this.treeGroup.name = 'tree-system';

        this.colliderGroup = new Group();
        this.colliderGroup.name = 'tree-colliders';
    }

    // ========================================
    // Lifecycle Methods
    // ========================================

    /**
     * Load tree model assets - must be called before attach()
     * Calculates normalization scale to convert each model to 1 meter height
     */
    async loadModels(): Promise<void> {
        if (this.modelsLoaded) return;

        const loadPromises = TREE_VARIANTS.map(async (variant) => {
            const gltf = await loadModel.gltf(variant.modelPath);
            if (gltf) {
                const model = gltf.scene;
                model.name = variant.name;

                // Measure the model's natural height
                model.updateMatrixWorld(true);
                const bounds = new Box3().setFromObject(model);
                const size = new Vector3();
                bounds.getSize(size);
                const modelHeight = size.y;

                // Calculate scale to normalize to 1 meter
                const normalizeScale = modelHeight > 0 ? 1.0 / modelHeight : 1.0;

                return { model, normalizeScale };
            }
            console.warn(`[TreeSystem] Failed to load model: ${variant.modelPath}`);
            return null;
        });

        const results = await Promise.all(loadPromises);

        this.treeModels = [];
        this.treeModelScales = [];

        for (const result of results) {
            if (result) {
                this.treeModels.push(result.model);
                this.treeModelScales.push(result.normalizeScale);
            }
        }

        if (this.treeModels.length === 0) {
            console.error('[TreeSystem] No tree models loaded!');
        }

        this.modelsLoaded = true;
        this.generateBillboardTextures();
    }

    /**
     * Generate billboard textures from tree models for LOD 1 and 2
     * Renders actual 3D models to textures using WebGL for production quality
     */
    private generateBillboardTextures(): void {
        if (this.treeModels.length === 0) {
            console.warn('[TreeSystem] No tree models loaded for billboard generation');
            return;
        }

        const billboardSize = 512; // Texture resolution
        let renderer: WebGLRenderer | null = null;
        let renderTarget: WebGLRenderTarget | null = null;
        let tempScene: Scene | null = null;

        try {
            // Create temporary renderer for billboard generation
            const canvas = document.createElement('canvas');
            renderer = new WebGLRenderer({
                canvas,
                alpha: true,
                antialias: true,
                preserveDrawingBuffer: true,
                premultipliedAlpha: false // Better alpha handling
            });
            renderer.setSize(billboardSize, billboardSize);
            renderer.setClearColor(0x000000, 0); // Transparent clear color (alpha = 0)

            // Create render target
            renderTarget = new WebGLRenderTarget(billboardSize, billboardSize, {
                minFilter: LinearFilter,
                magFilter: LinearFilter,
                format: RGBAFormat,
            });

            // Create temporary scene and camera for rendering
            tempScene = new Scene();
            tempScene.background = null; // Transparent background for billboards

            // Add lighting - CRITICAL for visible rendering
            const ambientLight = new AmbientLight(0xffffff, 0.6);
            tempScene.add(ambientLight);
            const directionalLight = new DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(1, 2, 1);
            tempScene.add(directionalLight);

            // Use ORTHOGRAPHIC camera for exact 1:1 scaling
            // Tree is 1m tall after normalization (y: 0 to 1)
            // Set frustum to exactly match: 0.6m wide, 1.2m tall (to include some margin)
            const frustumSize = 1.2;
            const aspect = 1; // Square texture
            const orthoCamera = new OrthographicCamera(
                -frustumSize * aspect / 2,  // left
                frustumSize * aspect / 2,   // right
                frustumSize / 2,             // top
                -frustumSize / 2,            // bottom
                0.1,                         // near
                100                          // far
            );

            for (let i = 0; i < this.treeModels.length; i++) {
                try {
                    const model = this.treeModels[i].clone(true);
                    const normalizeScale = this.treeModelScales[i] || 1.0;

                    // Normalize and position model for rendering
                    // Scale to 1m height, position base at y=0
                    model.scale.set(normalizeScale, normalizeScale, normalizeScale);
                    model.position.set(0, 0, 0);
                    model.rotation.set(0, 0, 0);

                    // Add to temp scene
                    tempScene.add(model);

                    // Position orthographic camera
                    // Tree is at y: 0 to 1, look at center (0.5)
                    orthoCamera.position.set(0, 0.5, 5);
                    orthoCamera.lookAt(0, 0.5, 0);
                    orthoCamera.updateProjectionMatrix();

                    console.log(`[TreeSystem] Rendering billboard ${i} with orthographic camera (frustum=${frustumSize}m)`);

                    // Render to canvas
                    renderer.setRenderTarget(null);
                    renderer.clear();
                    renderer.render(tempScene, orthoCamera);

                    // Create texture from canvas
                    const canvas = renderer.domElement;
                    const canvasCopy = document.createElement('canvas');
                    canvasCopy.width = billboardSize;
                    canvasCopy.height = billboardSize;
                    const ctx = canvasCopy.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(canvas, 0, 0);
                    }

                    const texture = new CanvasTexture(canvasCopy);
                    texture.minFilter = LinearFilter;
                    texture.magFilter = LinearFilter;
                    texture.needsUpdate = true;

                    this.billboardTextures.push(texture);

                    console.log(`[TreeSystem] Generated billboard ${i} - size: ${billboardSize}x${billboardSize}`);

                    // Clean up temp scene
                    tempScene.remove(model);
                    this.disposeObject3D(model);

                } catch (error) {
                    console.error(`[TreeSystem] Failed to generate billboard for variant ${i}:`, error);
                    // Create fallback texture on error
                    this.billboardTextures.push(this.createFallbackBillboardTexture(billboardSize));
                }
            }

            console.log(`[TreeSystem] Generated ${this.billboardTextures.length} billboard textures`);

        } catch (error) {
            console.error('[TreeSystem] Billboard generation failed:', error);
            // Fallback: create simple placeholder textures
            for (let i = 0; i < this.treeModels.length; i++) {
                this.billboardTextures.push(this.createFallbackBillboardTexture(billboardSize));
            }
        } finally {
            // Clean up temporary resources
            if (renderTarget) {
                renderTarget.dispose();
            }
            if (renderer) {
                renderer.dispose();
            }
            tempScene = null;
        }
    }

    /**
     * Create a fallback billboard texture when rendering fails
     */
    private createFallbackBillboardTexture(size: number): Texture {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        if (ctx) {
            // Simple tree-like gradient
            const gradient = ctx.createRadialGradient(
                size / 2, size / 2, 0,
                size / 2, size / 2, size / 2
            );
            gradient.addColorStop(0, 'rgba(60, 120, 40, 0.9)');
            gradient.addColorStop(0.7, 'rgba(40, 80, 30, 0.7)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, size, size);

            // Trunk
            ctx.fillStyle = 'rgba(101, 67, 33, 0.8)';
            ctx.fillRect(size / 2 - 10, size * 0.6, 20, size * 0.4);
        }

        const texture = new CanvasTexture(canvas);
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.format = RGBAFormat;
        texture.needsUpdate = true;

        return texture;
    }

    /**
     * Recursively dispose of Object3D and its resources
     */
    private disposeObject3D(obj: Object3D): void {
        if ('geometry' in obj) {
            const mesh = obj as Mesh;
            if (mesh.geometry) {
                mesh.geometry.dispose();
            }
        }

        if ('material' in obj) {
            const mesh = obj as Mesh;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) {
                if (material && 'dispose' in material) {
                    material.dispose();
                }
            }
        }

        // Recurse through children
        for (const child of obj.children) {
            this.disposeObject3D(child);
        }
    }

    /**
     * Attach the tree system to a scene
     */
    attach(scene: Scene): void {
        if (!this.modelsLoaded) {
            console.warn('[TreeSystem] Models not loaded. Call loadModels() first.');
        }
        this.scene = scene;
        scene.add(this.treeGroup);
        // Colliders are not added to scene - they're used for BVH only
    }

    /**
     * Detach from scene and clean up
     */
    detach(): void {
        if (!this.scene) return;

        // Remove all patches
        for (const record of this.patches.values()) {
            this.removePatchMeshes(record);
        }
        this.patches.clear();

        this.scene.remove(this.treeGroup);
        this.scene = null;
    }

    /**
     * Main update loop - call every frame
     */
    update(_deltaTime: number, playerPosition: Vector3): void {
        if (!this.enabled || !this.scene || !this.modelsLoaded) return;

        const playerChunkX = Math.floor(playerPosition.x / this.params.patchSize);
        const playerChunkZ = Math.floor(playerPosition.z / this.params.patchSize);

        const chunkChanged = !this.lastPlayerChunk ||
            this.lastPlayerChunk.x !== playerChunkX ||
            this.lastPlayerChunk.z !== playerChunkZ;

        this.framesSinceFullUpdate++;
        if (chunkChanged || this.framesSinceFullUpdate >= this.fullUpdateInterval) {
            this.updatePatches(playerPosition);
            this.lastPlayerChunk = { x: playerChunkX, z: playerChunkZ };
            this.framesSinceFullUpdate = 0;
        }

        this.updateLOD(playerPosition);
        this.processWorkerQueue();
    }

    /**
     * Dispose of all resources
     */
    dispose(): void {
        this.detach();
        this.treeModels = [];
        this.treeModelScales = [];
        this.modelsLoaded = false;
        this.workerQueue = [];
        this.workerGeneration++;

        // Dispose billboard textures
        for (const texture of this.billboardTextures) {
            texture.dispose();
        }
        this.billboardTextures = [];
    }

    // ========================================
    // Configuration Methods
    // ========================================

    /**
     * Enable or disable the tree system
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;

        if (!enabled) {
            for (const record of this.patches.values()) {
                this.setPatchVisible(record, false);
            }
        }
    }

    /**
     * Check if system is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Set tree density (requires patch regeneration)
     */
    setDensity(densityPerSqM: number): void {
        this.params.densityPerSqM = Math.max(
            TREE_CONSTANTS.DENSITY_MIN,
            Math.min(TREE_CONSTANTS.DENSITY_MAX, densityPerSqM)
        );
        this.invalidateAllPatches();
    }

    /**
     * Set maximum render distance
     */
    setMaxDistance(distance: number): void {
        this.params.maxDistance = distance;
        this.params.lodDistances = [
            Math.min(50, distance * 0.25),
            Math.min(100, distance * 0.5),
            distance,
        ];
        this.invalidateAllPatches();
    }

    /**
     * Set callback for when colliders change (for BVH rebuild)
     */
    setCollidersChangedCallback(callback: () => void): void {
        this.onCollidersChanged = callback;
    }

    /**
     * Set the camera for billboard orientation
     * Billboards (Sprites) automatically face the camera in Three.js
     */
    setCamera(camera: Camera): void {
        this._camera = camera;
    }

    /**
     * Get current camera reference
     */
    getCamera(): Camera | null {
        return this._camera;
    }

    // ========================================
    // Terrain Integration
    // ========================================

    /**
     * Set the terrain height sampler function
     */
    setTerrainSampler(sampler: TerrainSampler): void {
        this.terrainSampler = sampler;
    }

    /**
     * Set terrain parameters (passed to worker)
     */
    setTerrainParams(params: EarthParams): void {
        this.terrainParams = params;
        this.invalidateAllPatches();
    }

    // ========================================
    // Collision Access
    // ========================================

    /**
     * Get all tree collider meshes for BVH integration
     * These are cylinder meshes positioned at each tree location
     */
    getColliderMeshes(): Mesh[] {
        const colliders: Mesh[] = [];
        for (const record of this.patches.values()) {
            if (record.visible) {
                colliders.push(...record.colliders);
            }
        }
        return colliders;
    }

    /**
     * Get the collider group (for adding to environment before BVH build)
     */
    getColliderGroup(): Group {
        return this.colliderGroup;
    }

    // ========================================
    // Debug Methods
    // ========================================

    /**
     * Get current stats for debugging
     */
    getStats(): TreeStats {
        let instanceCount = 0;
        const instancesByLod: [number, number, number] = [0, 0, 0];

        for (const record of this.patches.values()) {
            if (record.visible) {
                const count = record.instances.length;
                instanceCount += count;
                if (record.lodTier >= 0 && record.lodTier <= 2) {
                    instancesByLod[record.lodTier] += count;
                }
            }
        }

        return {
            instanceCount,
            patchCount: this.patches.size,
            drawCalls: this.patches.size * 2, // ~2 variants per patch
            instancesByLod,
        };
    }

    // ========================================
    // Private: Patch Management
    // ========================================

    /**
     * Generate chunk key
     */
    private chunkKey(chunkX: number, chunkZ: number): string {
        return `tree_${chunkX},${chunkZ}`;
    }

    /**
     * Get chunk center in world coordinates
     */
    private chunkCenter(chunkX: number, chunkZ: number): { x: number; z: number } {
        return {
            x: (chunkX + 0.5) * this.params.patchSize,
            z: (chunkZ + 0.5) * this.params.patchSize,
        };
    }

    /**
     * Update visible patches based on player position
     */
    private updatePatches(playerPosition: Vector3): void {
        if (!this.scene) return;

        const playerChunkX = Math.floor(playerPosition.x / this.params.patchSize);
        const playerChunkZ = Math.floor(playerPosition.z / this.params.patchSize);

        const chunkRadius = Math.ceil(this.params.maxDistance / this.params.patchSize) + 1;

        const wantedChunks = new Set<string>();

        for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
            for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const center = this.chunkCenter(chunkX, chunkZ);

                const dist = Math.hypot(
                    center.x - playerPosition.x,
                    center.z - playerPosition.z
                );

                if (dist <= this.params.maxDistance + this.params.patchSize * 0.707) {
                    const key = this.chunkKey(chunkX, chunkZ);
                    wantedChunks.add(key);

                    if (!this.patches.has(key)) {
                        this.createPatchRecord(key, chunkX, chunkZ, dist);
                    }
                }
            }
        }

        // Remove patches that are no longer needed
        for (const [key, record] of this.patches) {
            if (!wantedChunks.has(key)) {
                this.removePatchRecord(key, record);
            }
        }
    }

    /**
     * Create a new patch record
     */
    private createPatchRecord(key: string, chunkX: number, chunkZ: number, distance: number): void {
        const lodTier = this.getLODTier(distance);

        const record: TreePatchRecord = {
            key,
            chunkX,
            chunkZ,
            instances: [],
            meshes: [],
            colliders: [],
            lodTier,
            activeLodTier: -1, // No meshes loaded yet
            distanceToPlayer: distance,
            pendingWorker: false,
            workerGeneration: 0,
            visible: true,
        };

        this.patches.set(key, record);
        this.queueWorkerRequest(record);
    }

    /**
     * Remove a patch record
     */
    private removePatchRecord(key: string, record: TreePatchRecord): void {
        this.removePatchMeshes(record);
        this.patches.delete(key);
    }

    /**
     * Remove meshes from a patch with proper resource disposal
     */
    private removePatchMeshes(record: TreePatchRecord): void {
        // Dispose tree meshes
        for (const mesh of record.meshes) {
            this.treeGroup.remove(mesh);

            // Dispose sprites (billboards)
            if (mesh instanceof Sprite) {
                const sprite = mesh as Sprite;
                if (sprite.material) {
                    // Don't dispose the shared billboard texture, only the material
                    sprite.material.map = null;
                    sprite.material.dispose();
                }
            } else {
                // Dispose 3D models
                this.disposeObject3D(mesh);
            }
        }

        // Dispose colliders
        for (const collider of record.colliders) {
            this.colliderGroup.remove(collider);
            if (collider.geometry) {
                collider.geometry.dispose();
            }
            if (collider.material) {
                const materials = Array.isArray(collider.material) ? collider.material : [collider.material];
                for (const material of materials) {
                    material.dispose();
                }
            }
        }

        record.meshes = [];
        record.colliders = [];
    }

    /**
     * Set patch visibility
     */
    private setPatchVisible(record: TreePatchRecord, visible: boolean): void {
        record.visible = visible;
        for (const mesh of record.meshes) {
            mesh.visible = visible;
        }
    }

    /**
     * Update LOD for all patches with performance throttling
     */
    private updateLOD(playerPosition: Vector3): void {
        let lodSwitchesThisFrame = 0;
        const patchesNeedingLODSwitch: TreePatchRecord[] = [];

        // First pass: calculate distances and identify patches needing LOD switch
        for (const record of this.patches.values()) {
            const center = this.chunkCenter(record.chunkX, record.chunkZ);
            const dist = Math.hypot(
                center.x - playerPosition.x,
                center.z - playerPosition.z
            );

            record.distanceToPlayer = dist;
            const newLodTier = this.getLODTier(dist);

            if (newLodTier !== record.lodTier) {
                record.lodTier = newLodTier;

                // Check if this patch needs mesh switching
                if (record.instances.length > 0 && newLodTier !== record.activeLodTier) {
                    patchesNeedingLODSwitch.push(record);
                }
            }

            // Hide patches beyond max distance
            const shouldBeVisible = dist <= this.params.maxDistance;
            if (record.visible !== shouldBeVisible) {
                this.setPatchVisible(record, shouldBeVisible);
            }
        }

        // Second pass: perform LOD switches with throttling
        // Prioritize closest patches first
        patchesNeedingLODSwitch.sort((a, b) => a.distanceToPlayer - b.distanceToPlayer);

        for (const record of patchesNeedingLODSwitch) {
            if (lodSwitchesThisFrame >= this.maxLODSwitchesPerFrame) {
                // Defer remaining switches to next frame
                break;
            }

            try {
                const oldTier = record.activeLodTier;
                const newTier = record.lodTier;
                console.log(`[TreeSystem] LOD switch: ${record.key} from tier ${oldTier} to ${newTier} (${newTier >= 1 ? 'BILLBOARD' : 'MODEL'})`);
                this.createTreeMeshesForLOD(record, record.lodTier);
                lodSwitchesThisFrame++;
            } catch (error) {
                console.error('[TreeSystem] LOD switch failed:', error);
            }
        }

        // Notify colliders changed if any switches occurred
        if (lodSwitchesThisFrame > 0) {
            this.notifyCollidersChanged();
        }
    }

    /**
     * Get LOD tier based on distance
     */
    private getLODTier(distance: number): number {
        const [lod0, lod1] = this.params.lodDistances;

        if (distance <= lod0) return 0;
        if (distance <= lod1) return 1;
        return 2;
    }

    /**
     * Invalidate all patches (forces regeneration)
     */
    private invalidateAllPatches(): void {
        this.workerGeneration++;
        this.workerQueue = [];

        for (const record of this.patches.values()) {
            this.removePatchMeshes(record);
            record.instances = [];
            record.pendingWorker = false;
            this.queueWorkerRequest(record);
        }

        this.notifyCollidersChanged();
    }

    // ========================================
    // Private: Worker Integration
    // ========================================

    /**
     * Queue a worker request for a patch
     */
    private queueWorkerRequest(record: TreePatchRecord): void {
        if (record.pendingWorker) return;

        record.pendingWorker = true;
        record.workerGeneration = this.workerGeneration;

        this.workerQueue.push({
            key: record.key,
            chunkX: record.chunkX,
            chunkZ: record.chunkZ,
            priority: record.distanceToPlayer,
            generation: this.workerGeneration,
        });

        this.workerQueue.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Process queued worker requests
     */
    private processWorkerQueue(): void {
        while (
            this.workerQueue.length > 0 &&
            this.activeWorkerRequests < this.maxConcurrentWorkers
        ) {
            const item = this.workerQueue.shift()!;

            if (item.generation !== this.workerGeneration) {
                continue;
            }

            const record = this.patches.get(item.key);
            if (!record || record.workerGeneration !== item.generation) {
                continue;
            }

            this.executeWorkerRequest(record);
        }
    }

    /**
     * Execute a worker request
     */
    private async executeWorkerRequest(record: TreePatchRecord): Promise<void> {
        this.activeWorkerRequests++;

        const generation = record.workerGeneration;
        const center = this.chunkCenter(record.chunkX, record.chunkZ);

        try {
            const result = await this.generateTreeData(
                center.x,
                center.z,
                this.params.patchSize
            );

            if (
                record.workerGeneration !== generation ||
                !this.patches.has(record.key)
            ) {
                return;
            }

            // Apply data to patch
            this.applyTreeData(record, result);
            this.notifyCollidersChanged();

        } catch (error) {
            console.error('[TreeSystem] Worker request failed:', error);
        } finally {
            record.pendingWorker = false;
            this.activeWorkerRequests--;
        }
    }

    /**
     * Generate tree instance data via web worker
     */
    private async generateTreeData(
        originX: number,
        originZ: number,
        patchSize: number
    ): Promise<TreeWorkerResponse> {
        const targetCount = Math.min(
            Math.ceil(patchSize * patchSize * this.params.densityPerSqM),
            TREE_CONSTANTS.MAX_INSTANCES_PER_PATCH
        );

        if (!this.terrainParams) {
            return this.generateTreeDataLocal(originX, originZ, patchSize, targetCount);
        }

        const result = await environmentWorkerClient.computeTreeInstances({
            instanceCount: targetCount,
            patchSize,
            origin: { x: originX, z: originZ },
            terrainParams: this.terrainParams,
            seed: this.params.seed,
            grassThreshold: this.params.grassThreshold,
            minHeight: this.params.minHeight,
            maxHeight: this.params.maxHeight,
        });

        return {
            positions: result.positions,
            instanceData: result.instanceData,
            count: result.count,
        };
    }

    /**
     * Fallback local tree generation
     */
    private generateTreeDataLocal(
        originX: number,
        originZ: number,
        patchSize: number,
        targetCount: number
    ): TreeWorkerResponse {
        const positions: number[] = [];
        const instanceData: number[] = [];
        const seed = this.params.seed;

        let count = 0;
        for (let i = 0; i < targetCount * 3 && count < targetCount; i++) {
            const sx = hash2(i + 1 + originX * 0.031, originZ * 0.017 + seed * 0.001, seed);
            const sz = hash2(i + 7 + originZ * 0.029, originX * 0.013 + seed * 0.002, seed + 13.37);
            const localX = (sx - 0.5) * patchSize;
            const localZ = (sz - 0.5) * patchSize;
            const wx = originX + localX;
            const wz = originZ + localZ;

            let height = 0;
            if (this.terrainSampler) {
                height = this.terrainSampler(wx, wz);
                if (height <= 0) continue;
            }

            // Random acceptance for spacing
            const acceptRand = hash2(wx * 0.1, wz * 0.1, seed + 100);
            if (acceptRand > 0.3) continue;

            positions.push(wx, height, wz);

            const rotation = hash2(wx + 100, wz + 100, seed) * Math.PI * 2;
            const scaleRand = hash2(wx + 200, wz + 200, seed);
            const scale = this.params.minHeight + scaleRand * (this.params.maxHeight - this.params.minHeight);
            const variantRand = hash2(wx + 300, wz + 300, seed);
            const variant = variantRand < 0.5 ? 0 : 1;

            instanceData.push(rotation, scale, variant);
            count++;
        }

        return {
            positions: new Float32Array(positions),
            instanceData: new Float32Array(instanceData),
            count,
        };
    }

    /**
     * Apply tree data from worker to patch
     */
    private applyTreeData(record: TreePatchRecord, data: TreeWorkerResponse): void {
        // Clear existing meshes
        this.removePatchMeshes(record);

        // Parse instance data
        const instances: TreeInstance[] = [];
        for (let i = 0; i < data.count; i++) {
            instances.push({
                x: data.positions[i * 3],
                y: data.positions[i * 3 + 1],
                z: data.positions[i * 3 + 2],
                rotation: data.instanceData[i * 3],
                scale: data.instanceData[i * 3 + 1],
                variant: Math.floor(data.instanceData[i * 3 + 2]),
            });
        }
        record.instances = instances;

        // Create meshes for the current LOD tier
        this.createTreeMeshesForLOD(record, record.lodTier);
    }

    /**
     * Create tree meshes for a specific LOD tier
     * LOD 0: Full 3D models
     * LOD 1-2: Billboards/Impostors
     */
    private createTreeMeshesForLOD(record: TreePatchRecord, lodTier: number): void {
        // Validation
        if (!record || !record.instances) {
            console.error('[TreeSystem] Invalid record in createTreeMeshesForLOD');
            return;
        }

        if (this.treeModels.length === 0) {
            console.warn('[TreeSystem] No tree models loaded, skipping mesh creation');
            return;
        }

        // Clear existing meshes
        this.removePatchMeshes(record);

        const useBillboards = lodTier >= 1; // LOD 1 and 2 use billboards

        for (const instance of record.instances) {
            try {
                const variantIndex = Math.min(instance.variant, this.treeModels.length - 1);
                if (variantIndex < 0 || this.treeModels.length === 0) continue;

                let treeMesh: Object3D;

                if (useBillboards && this.billboardTextures.length > variantIndex) {
                    // CRITICAL: Re-sample terrain height for billboards
                    // Ensures billboards don't float if terrain changed or wasn't loaded when tree was generated
                    if (this.terrainSampler) {
                        const currentHeight = this.terrainSampler(instance.x, instance.z);

                        // Skip billboard if terrain isn't loaded (height <= 0)
                        if (currentHeight <= 0) {
                            console.warn(
                                `[TreeSystem] Skipping billboard at (${instance.x.toFixed(1)}, ${instance.z.toFixed(1)}) - ` +
                                `terrain not loaded (height=${currentHeight.toFixed(1)}m)`
                            );
                            continue;
                        }

                        // Update height if terrain has changed significantly
                        if (Math.abs(currentHeight - instance.y) > 0.5) {
                            if (Math.random() < 0.1) { // Log 10% of updates
                                console.log(
                                    `[TreeSystem] Updating billboard height at (${instance.x.toFixed(1)}, ${instance.z.toFixed(1)}): ` +
                                    `${instance.y.toFixed(1)}m → ${currentHeight.toFixed(1)}m`
                                );
                            }
                            instance.y = currentHeight;
                        }
                    }

                    // Create billboard sprite for LOD 1 and 2
                    treeMesh = this.createBillboardSprite(instance, variantIndex);
                    if (record.meshes.length === 0) {
                        console.log(`[TreeSystem] Creating billboards for patch ${record.key} (LOD ${lodTier})`);
                    }
                } else {
                    // Create full 3D model for LOD 0 (or fallback if billboards unavailable)
                    const model = this.treeModels[variantIndex];
                    if (!model) {
                        console.warn(`[TreeSystem] Missing model for variant ${variantIndex}`);
                        continue;
                    }
                    if (useBillboards) {
                        console.warn(`[TreeSystem] Billboard texture missing for variant ${variantIndex}, using full model`);
                    }

                    const normalizeScale = this.treeModelScales[variantIndex] || 1.0;
                    const tree = model.clone(true); // Deep clone

                    // Position at terrain height
                    tree.position.set(instance.x, instance.y, instance.z);

                    // Always upright - only Y rotation
                    tree.rotation.set(0, instance.rotation, 0);

                    // Scale = normalization factor * desired height in meters
                    // normalizeScale converts model to 1m, instance.scale is desired height (3-5m)
                    const finalScale = normalizeScale * instance.scale;
                    tree.scale.set(finalScale, finalScale, finalScale);

                    tree.updateMatrixWorld(true);
                    treeMesh = tree;
                }

                record.meshes.push(treeMesh);
                this.treeGroup.add(treeMesh);

                // Create collision cylinder (same for all LOD levels)
                const collider = this.createCollider(instance);
                record.colliders.push(collider);
                this.colliderGroup.add(collider);

            } catch (error) {
                console.error('[TreeSystem] Failed to create tree mesh:', error);
                // Continue with next instance instead of failing completely
                continue;
            }
        }

        record.activeLodTier = lodTier;
    }

    /**
     * Create a billboard sprite for an impostor tree
     */
    private createBillboardSprite(instance: TreeInstance, variantIndex: number): Sprite {
        // Validation
        if (!this.billboardTextures[variantIndex]) {
            throw new Error(`[TreeSystem] Billboard texture missing for variant ${variantIndex}`);
        }

        const texture = this.billboardTextures[variantIndex];
        const material = new SpriteMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.5, // Higher alpha test to remove black edges
            depthWrite: true,
            opacity: 1.0,
            sizeAttenuation: true, // Scale with distance
        });

        const sprite = new Sprite(material);
        sprite.name = 'tree-billboard';

        // CRITICAL FIX: Anchor sprite at BOTTOM instead of center
        // By default sprites are centered at (0.5, 0.5)
        // Setting center to (0.5, 0) anchors at bottom-center
        // This makes the sprite base align with ground level
        sprite.center.set(0.5, 0);

        // Calculate sprite scale to match 3D model size
        // Billboard texture was rendered with orthographic frustum of billboardFrustumSize
        // Tree (1m after normalization) fills (1 / frustumSize) of the texture
        // To display tree at correct size (instance.scale), sprite must be:
        // sprite.scale = instance.scale * frustumSize

        const treeHeight = instance.scale; // Desired tree height (6-10m)
        const spriteScale = treeHeight * this.billboardFrustumSize;

        // Position sprite base at terrain height
        // Since sprite is anchored at bottom, position.y = base height
        sprite.position.set(instance.x, instance.y, instance.z);

        // Scale sprite to compensate for frustum size
        sprite.scale.set(spriteScale, spriteScale, 1);

        // Debug logging - sample 5% of billboards
        if (Math.random() < 0.05) {
            console.log(
                `[TreeSystem] Billboard: pos=(${instance.x.toFixed(1)}, ${instance.y.toFixed(1)}, ${instance.z.toFixed(1)}) ` +
                `treeHeight=${treeHeight.toFixed(1)}m spriteScale=${spriteScale.toFixed(2)} ` +
                `frustum=${this.billboardFrustumSize}m anchor=bottom`
            );
        }

        return sprite;
    }

    /**
     * Create a collision cylinder for a tree
     */
    private createCollider(instance: TreeInstance): Mesh {
        const radius = this.params.collisionRadius;
        const height = instance.scale * 0.6; // Collision height is 60% of visual height

        const geometry = new CylinderGeometry(radius, radius, height, 8);
        const material = new MeshBasicMaterial({
            visible: false,
            transparent: true,
            opacity: 0,
        });

        const collider = new Mesh(geometry, material);
        collider.position.set(
            instance.x,
            instance.y + height / 2,  // Center cylinder at half height
            instance.z
        );
        collider.name = 'tree-collider';

        return collider;
    }

    /**
     * Notify that colliders have changed
     */
    private notifyCollidersChanged(): void {
        if (this.onCollidersChanged) {
            this.onCollidersChanged();
        }
    }
}
