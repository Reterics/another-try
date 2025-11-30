import * as THREE from 'three';
import {
    Box3,
    BufferGeometry,
    Camera,
    ClampToEdgeWrapping,
    DataTexture,
    Group,
    Light,
    LinearFilter,
    LinearMipmapLinearFilter,
    Mesh,
    MeshStandardMaterial,
    Object3D,
    RepeatWrapping,
    RGBAFormat,
    Scene,
    ShaderMaterial,
    Texture,
    TextureLoader,
    Vector3
} from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import {ExtendedTriangle, MeshBVH, StaticGeometryGenerator} from 'three-mesh-bvh';
import {CapsuleInfo, SceneParams} from "../types/main.ts";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls";
import {Hero} from "../models/hero.ts";
import {Object3DEventMap} from "three";
import {loadModel} from "../utils/model.ts";
import {ATMap} from "../../../types/map.ts";
import {RenderedPlane, TerrainEnvironment} from "../types/three.ts";
import {
    EarthTerrain,
    applyProceduralHeightsWorld,
    WATER_LEVEL,
    splatDebugColor,
    sampleDefaultSplat
} from "../utils/terrain.ts";
import { environmentWorkerClient } from "../workers/environmentWorkerClient.ts";
import { Water } from "three/examples/jsm/objects/Water2";
import {CreatorController} from "../controllers/CreatorController.ts";
import { buildSplatData, chunkKey } from "../utils/terrainHelpers.ts";
import { EventBus, Topics } from '@game/shared';
type TerrainTextureKey = 'sand' | 'grass' | 'dirt' | 'rock' | 'snow';

const TERRAIN_TEXTURE_PATHS: Record<TerrainTextureKey, string> = {
    sand: '/assets/textures/attributed_sand.png',
    grass: '/assets/textures/attributed_grass.png',
    dirt: '/assets/textures/attributed_dirt.png',
    rock: '/assets/textures/attributed_rock.png',
    snow: '/assets/textures/attributed_snow.png'
};

let tempVector = new THREE.Vector3();
let tempVector2 = new THREE.Vector3();
let tempBox = new THREE.Box3();
let tempMat = new THREE.Matrix4();
let tempSegment = new THREE.Line3();
// let playerVelocity = new THREE.Vector3();
const upVector = new THREE.Vector3( 0, 1, 0 );
//const direction = new THREE.Vector3();
const velocity = new THREE.Vector3();


interface toMergeType {
    [key: number]: (Mesh|Light|undefined)[]
}
interface toMergeTextureType {
    [key: number]: (MeshStandardMaterial|undefined)
}

/*function getAzimuthalAngle(controls) {
    return Math.atan2(controls.camera.rotation.x, controls.camera.rotation.z);
}*/
export class TerrainManager {
    protected collider: Mesh;
    protected environment: Group;
    protected environments: TerrainEnvironment[];

    private earthTerrain: EarthTerrain;
    params: SceneParams;
    protected scene: Scene;
    initMethod: Promise<TerrainManager>;
    private loaded = false;
    private controls: OrbitControls;
    private creatorController: CreatorController;
    playerIsOnGround = false;
    canJump = false;
    sprinting = false; // Temporary not available
    energy = 20;
    energyMax = 20;
    drainSecondsToEmpty = 10; // sprinting from full to empty takes 10s
    regenPerSecond = 1.2; // matches previous ~0.02/frame at 60 FPS
    // Grounded smoothing to avoid jitter on small terrain elevation changes
    private groundGraceTime = 0.12; // seconds of "coyote time" after leaving ground
    private groundGrace = 0; // remaining time of grace
    // Gait switching hysteresis to prevent rapid Walk↔Run animation restarts
    private gaitCurrent: 'Walk' | 'Run' | null = null;
    private gaitPending: 'Walk' | 'Run' | null = null;
    private gaitSwitchHold = 0.18; // seconds the new gait must be stable before switching
    private gaitHoldTimer = 0;
    fwdPressed = false; bkdPressed = false; lftPressed = false; rgtPressed = false;
    private lastEnergyPublished: number;
    private map: ATMap;
    private chunkEnvironment: TerrainEnvironment;
    private chunkMeshes: Map<string, Mesh>;
    private chunkRequests: Map<string, Promise<void>>;
    private chunkSize = 320;
    private chunkSegments = 64;
    private chunkRadius = 1;
    private currentChunk?: { x: number; z: number };
    private previewCenter: Vector3;
    private surfaceTextures: Record<TerrainTextureKey, Texture>;
    private textureRepeatMeters = 18;
    private chunkVersion = 0;
    private pendingColliderRefresh = false;
    private waterPlane?: Water;
    private waterBaseSize?: number;
    private minimapCenter: Vector3;
    private minimapSpan = 0;
    private readonly minimapSpanMultiplier = 3;
    private readonly minimapUpdateThreshold = 0.45;
    private minimapTextureListeners = new Set<(payload: { texture?: string; center: { x: number; z: number }; span: number }) => void>();

    constructor(model: ATMap, scene: Scene, controls:OrbitControls, callback: Function, creatorController: CreatorController, private readonly bus?: EventBus) {
        this.scene = scene;
        this.controls = controls;
        this.creatorController = creatorController;
        this.environment = new THREE.Group();
        this.environment.name = "environment";
        this.chunkEnvironment = {
            name: 'procedural-world',
            environment: new THREE.Group(),
            shaders: []
        };
        this.chunkEnvironment.environment.name = 'procedural-world-chunks';
        this.chunkMeshes = new Map();
        this.chunkRequests = new Map();
        this.environments = [this.chunkEnvironment];
        this.surfaceTextures = this.loadSurfaceTextures();
        this.collider = new THREE.Mesh();
        this.map = model;
        this.earthTerrain = new EarthTerrain();
        const spawnX = 413;
        const spawnZ = 296;
        const spawnY = this.earthTerrain.sampleHeight(spawnX, spawnZ) + 10;
        this.lastEnergyPublished = this.energy;

        this.params = {
            displayCollider: false,
            visualizeDepth: 10,
            gravity: - 30,
            playerSpeed: 10,
            physicsSteps: 5,  //5
            spawnCoordinates: [spawnX, spawnY, spawnZ] // X Y Z
        };
        this.previewCenter = new Vector3(spawnX, 0, spawnZ);
        this.minimapCenter = this.previewCenter.clone();
        this.minimapSpan = this.getProceduralPatchSize() * this.minimapSpanMultiplier;
        this.initMethod = this._loadMapItems(callback);
        return this;
    }

    static CreateMap(map: ATMap, scene: Scene, controls:OrbitControls, creatorController: CreatorController, bus?: EventBus): Promise<TerrainManager> {
        return new Promise(resolve => {
            new TerrainManager(map, scene, controls, resolve, creatorController, bus);
        })
    }
    setSpawnCoordinates (x: number, y: number, z: number, options?: { recenter?: boolean }) {
        this.params.spawnCoordinates = [x, y, z];
        // Do not re-center chunk/minimap by default when only changing spawn.
        // Allow explicit re-centering when desired (e.g., when teleporting immediately).
        if (options?.recenter) {
            this.previewCenter.set(x, 0, z);
            this.currentChunk = undefined;
            this.updateWaterPlaneTransform();
            this.minimapCenter.set(x, 0, z);
            this.minimapSpan = this.getProceduralPatchSize() * this.minimapSpanMultiplier;
        }
    }

    updateMapTexture(map: TerrainEnvironment) {
        if (map.texture) {
            return map.texture;
        }

        const plane = map.environment.children
            .find(o => o.name === 'plane') as RenderedPlane | undefined;
        if (!plane) {
            return undefined;
        }
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d') as CanvasRenderingContext2D;
        const size = 512;

        // Build a debug splat map (flat colors for now) by sampling the procedural terrain
        if (!plane.geometry.boundingBox) plane.geometry.computeBoundingBox();
        const bb = plane.geometry.boundingBox;
        if (!bb) return undefined;
        const minX = bb.min.x, maxX = bb.max.x;
        const minZ = bb.min.z, maxZ = bb.max.z;

        canvas.width = size;
        canvas.height = size;

        const sampler = (x: number, z: number) => this.earthTerrain.sampleHeight(x, z);

        const imgData = context.createImageData(size, size);
        let p = 0;

        // Estimate texel footprint in world units for slope sampling
        const texelWorldX = (maxX - minX) / size;
        const texelWorldZ = (maxZ - minZ) / size;
        const slopeDx = Math.max(0.5 * Math.min(Math.abs(texelWorldX), Math.abs(texelWorldZ)), 1); // clamp to >=1m

        // 2x2 supersampling per texel to reduce speckle and improve parity with heights
        const weightToColor = (r: number, g: number, b: number, a: number) => {
            const snow = Math.max(0, 1 - (r + g + b + a));
            const arr = [r, g, b, a, snow];
            const idx = arr.indexOf(Math.max(...arr));
            switch (idx) {
                case 0: return { r: 194, g: 178, b: 128 }; // sand
                case 1: return { r: 50, g: 160, b: 60 };   // grass
                case 2: return { r: 134, g: 96, b: 67 };   // dirt
                case 3: return { r: 110, g: 110, b: 110 }; // rock
                case 4: return { r: 250, g: 250, b: 250 }; // snow
                default: return { r: 128, g: 128, b: 128 };
            }
        };

        for (let j = 0; j < size; j++) {
            const v = (j + 0.5) / size;
            const zCenter = minZ + v * (maxZ - minZ);
            for (let i = 0; i < size; i++) {
                const u = (i + 0.5) / size;
                const xCenter = minX + u * (maxX - minX);

                // Water shortcut: single sample is stable enough
                const hCenter = sampler(xCenter, zCenter);
                if (hCenter <= WATER_LEVEL) {
                    const depth01 = Math.max(0, Math.min(1, (WATER_LEVEL - hCenter) / 20));
                    const blue = Math.round(160 + 95 * (1 - depth01));
                    imgData.data[p++] = 10;
                    imgData.data[p++] = 40;
                    imgData.data[p++] = blue;
                    imgData.data[p++] = 255;
                    continue;
                }

                // 2x2 sample pattern within the texel footprint
                const offsX = texelWorldX * 0.25;
                const offsZ = texelWorldZ * 0.25;
                let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
                const samples: [number, number][] = [
                    [xCenter - offsX, zCenter - offsZ],
                    [xCenter + offsX, zCenter - offsZ],
                    [xCenter - offsX, zCenter + offsZ],
                    [xCenter + offsX, zCenter + offsZ],
                ];
                for (const [sx, sz] of samples) {
                    const w = sampleDefaultSplat(sampler, sx, sz, undefined, slopeDx);
                    rSum += w.r; gSum += w.g; bSum += w.b; aSum += w.a;
                }
                rSum /= 4; gSum /= 4; bSum /= 4; aSum /= 4;
                const c = weightToColor(rSum, gSum, bSum, aSum);
                imgData.data[p++] = c.r;
                imgData.data[p++] = c.g;
                imgData.data[p++] = c.b;
                imgData.data[p++] = 255;
            }
        }
        context.putImageData(imgData, 0, 0);
        // Create a Three.js texture and apply it to the plane's material so the UI shows splat colors
        const tex = new THREE.CanvasTexture(canvas);
        // Ensure correct color space in modern Three.js
        if ('colorSpace' in tex) {
            // @ts-ignore - property name depends on Three.js version
            tex.colorSpace = THREE.SRGBColorSpace;
        }
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;

        // Assign to plane material if it's a standard material with a map
        if ((plane as any).material && (plane as any).material.isMeshStandardMaterial) {
            const mat = (plane as any).material as THREE.MeshStandardMaterial;
            mat.map = tex;
            mat.needsUpdate = true;
        }

        // Keep DataURL for debug/export if needed elsewhere
        map.texture = canvas.toDataURL();
        this.emitMinimapTextureUpdate();
        return map.texture;
    }

    private loadSurfaceTextures(): Record<TerrainTextureKey, Texture> {
        const loader = new TextureLoader();
        const repeatScale = this.chunkSize / this.textureRepeatMeters;
        const createTexture = (path: string) => {
            const texture = loader.load(path);
            texture.wrapS = texture.wrapT = RepeatWrapping;
            texture.repeat.set(repeatScale, repeatScale);
            texture.minFilter = LinearMipmapLinearFilter;
            texture.magFilter = LinearFilter;
            texture.anisotropy = 8;
            if ('colorSpace' in texture) {
                // @ts-ignore
                texture.colorSpace = THREE.SRGBColorSpace || texture.colorSpace;
            }
            texture.needsUpdate = true;
            return texture;
        };
        return {
            sand: createTexture(TERRAIN_TEXTURE_PATHS.sand),
            grass: createTexture(TERRAIN_TEXTURE_PATHS.grass),
            dirt: createTexture(TERRAIN_TEXTURE_PATHS.dirt),
            rock: createTexture(TERRAIN_TEXTURE_PATHS.rock),
            snow: createTexture(TERRAIN_TEXTURE_PATHS.snow),
        };
    }

    private queueChunkBuild(cx: number, cz: number) {
        const key = chunkKey(cx, cz);
        if (this.chunkRequests.has(key)) {
            return;
        }
        const request = this.buildChunkMesh(cx, cz)
            .then(mesh => {
                if (!this.isChunkWithinRadius(cx, cz) || this.chunkMeshes.has(key)) {
                    this.disposeChunkMesh(mesh);
                    return;
                }
                this.chunkEnvironment.environment.add(mesh);
                this.chunkMeshes.set(key, mesh);
                this.pendingColliderRefresh = true;
            })
            .catch(err => console.error('[TerrainManager] Failed to build chunk', err))
            .finally(() => {
                this.chunkRequests.delete(key);
            });
        this.chunkRequests.set(key, request);
    }

    private isChunkWithinRadius(cx: number, cz: number) {
        if (!this.currentChunk) {
            return true;
        }
        const dx = Math.abs(this.currentChunk.x - cx);
        const dz = Math.abs(this.currentChunk.z - cz);
        return dx <= this.chunkRadius && dz <= this.chunkRadius;
    }

    private disposeChunkMesh(mesh: Mesh) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => mat.dispose());
        } else {
            mesh.material.dispose();
        }
        const splat: DataTexture | undefined = mesh.userData?.splatTexture;
        splat?.dispose();
        mesh.geometry.dispose();
    }

    private buildSplatTexture(cx: number, cz: number, precomputed?: { data: Uint8Array; resolution: number }) {
        if (precomputed) {
            return this.createSplatTextureFromData(precomputed.data, precomputed.resolution);
        }
        const sampler = this.getHeightSampler();
        const { data, resolution } = buildSplatData({
            sampler,
            chunkX: cx,
            chunkZ: cz,
            chunkSize: this.chunkSize,
            resolution: 48
        });
        return this.createSplatTextureFromData(data, resolution);
    }

    private createSplatTextureFromData(data: Uint8Array, resolution: number) {
        const texture = new DataTexture(data, resolution, resolution, RGBAFormat);
        texture.flipY = true;
        texture.needsUpdate = true;
        texture.wrapS = ClampToEdgeWrapping;
        texture.wrapT = ClampToEdgeWrapping;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        return texture;
    }

    private updateWaterPlaneTransform() {
        if (!this.waterPlane) {
            return;
        }
        const patchSize = this.getProceduralPatchSize();
        const baseSize = (this.waterBaseSize && this.waterBaseSize > 0) ? this.waterBaseSize : patchSize || 1;
        const scale = baseSize > 0 ? patchSize / baseSize : 1;
        this.waterPlane.scale.set(scale, scale, 1);
        this.waterPlane.position.set(this.previewCenter.x, WATER_LEVEL, this.previewCenter.z);
        this.waterPlane.updateMatrixWorld();
    }

    private createChunkMaterial(splatTexture: DataTexture): MeshStandardMaterial {
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0.05,
            flatShading: false
        });
        material.shadowSide = 2;
        material.onBeforeCompile = (shader) => {
            shader.uniforms.tex0 = { value: this.surfaceTextures.sand };
            shader.uniforms.tex1 = { value: this.surfaceTextures.grass };
            shader.uniforms.tex2 = { value: this.surfaceTextures.dirt };
            shader.uniforms.tex3 = { value: this.surfaceTextures.rock };
            shader.uniforms.tex4 = { value: this.surfaceTextures.snow };
            shader.uniforms.tSplat = { value: splatTexture };
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `
#include <common>
varying vec2 vSplatUv;
varying vec2 vTileUv;
                `)
                .replace('#include <uv_vertex>', `
#include <uv_vertex>
#ifdef USE_UV
    vSplatUv = vUv;
    vTileUv = vUv;
#else
    vSplatUv = uv;
    vTileUv = uv;
#endif
                `);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `
#include <common>
varying vec2 vSplatUv;
varying vec2 vTileUv;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D tex2;
uniform sampler2D tex3;
uniform sampler2D tex4;
uniform sampler2D tSplat;
                `)
                .replace('#include <map_fragment>', `
vec4 splatSample = texture2D(tSplat, vSplatUv);
float softSum = splatSample.r + splatSample.g + splatSample.b + splatSample.a;
float snowWeight = max(0.0, 1.0 - softSum);
float totalWeight = softSum + snowWeight + 1e-5;
vec4 weights = splatSample / totalWeight;
snowWeight /= totalWeight;
vec2 tiledUv = vTileUv;
vec4 texSample0 = texture2D(tex0, tiledUv);
vec4 texSample1 = texture2D(tex1, tiledUv);
vec4 texSample2 = texture2D(tex2, tiledUv);
vec4 texSample3 = texture2D(tex3, tiledUv);
vec4 texSample4 = texture2D(tex4, tiledUv);
vec3 blended = texSample0.rgb * weights.r
    + texSample1.rgb * weights.g
    + texSample2.rgb * weights.b
    + texSample3.rgb * weights.a
    + texSample4.rgb * snowWeight;
diffuseColor = vec4(blended, 1.0);
                `);
        };
        material.customProgramCacheKey = () => 'terrain-splat';
        return material;
    }

    private async buildChunkMesh(cx: number, cz: number): Promise<Mesh> {
        const geometry = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize, this.chunkSegments, this.chunkSegments);
        const centerX = cx * this.chunkSize + this.chunkSize / 2;
        const centerZ = cz * this.chunkSize + this.chunkSize / 2;
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(centerX, 0, centerZ);

        let splatTexture: DataTexture | undefined;
        try {
            const positionArray = geometry.attributes.position.array as Float32Array;
            const positionsCopy = new Float32Array(positionArray);
            const workerResult = await environmentWorkerClient.computeChunkData({
                positions: positionsCopy,
                terrainParams: this.earthTerrain.getParams(),
                chunkX: cx,
                chunkZ: cz,
                chunkSize: this.chunkSize,
                chunkSegments: this.chunkSegments,
                splatResolution: 64
            });
            const pos = geometry.attributes.position.array as Float32Array;
            for (let i = 0, v = 0; i < pos.length; i += 3, v++) {
                pos[i + 1] = workerResult.heights[v];
            }
            geometry.attributes.position.needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            splatTexture = this.createSplatTextureFromData(workerResult.splat, workerResult.splatResolution);
        } catch (err) {
            console.warn('[TerrainManager] Worker chunk build failed, falling back to main thread', err);
            const sampler = (x: number, z: number) => this.earthTerrain.sampleHeight(x, z);
            applyProceduralHeightsWorld(geometry, sampler);
            splatTexture = this.buildSplatTexture(cx, cz);
        }

        const material = this.createChunkMaterial(splatTexture);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `chunk-${cx}-${cz}`;
        mesh.userData.splatTexture = splatTexture;
        return mesh;
    }

    private ensureChunksAround(position?: Vector3): boolean {
        if (!position) {
            return false;
        }
        const chunkX = Math.floor(position.x / this.chunkSize);
        const chunkZ = Math.floor(position.z / this.chunkSize);
        const centerChanged = !this.currentChunk || this.currentChunk.x !== chunkX || this.currentChunk.z !== chunkZ;
        if (centerChanged || !this.currentChunk) {
            this.currentChunk = { x: chunkX, z: chunkZ };
            this.previewCenter.set(
                chunkX * this.chunkSize + this.chunkSize / 2,
                0,
                chunkZ * this.chunkSize + this.chunkSize / 2
            );
            //this.updateGrassAnchor();
            this.updateWaterPlaneTransform();
        }

        let changed = false;
        const required = new Set<string>();
        for (let dz = -this.chunkRadius; dz <= this.chunkRadius; dz++) {
            for (let dx = -this.chunkRadius; dx <= this.chunkRadius; dx++) {
                const cx = chunkX + dx;
                const cz = chunkZ + dz;
        const key = chunkKey(cx, cz);
        required.add(key);
        if (!this.chunkMeshes.has(key)) {
            this.queueChunkBuild(cx, cz);
        }
    }
        }

        for (const [key, mesh] of this.chunkMeshes) {
            if (!required.has(key)) {
                this.chunkEnvironment.environment.remove(mesh);
                this.disposeChunkMesh(mesh);
                this.chunkMeshes.delete(key);
                changed = true;
            }
        }

        if (changed || centerChanged) {
            this.updateProceduralMinimapTexture(position ?? this.previewCenter);
            this.chunkVersion++;
        } else {
            this.refreshMinimapIfNeeded(position);
        }
        return changed;
    }

    private updateProceduralMinimapTexture(center: Vector3, resolution = 256, spanOverride?: number) {
        if (typeof document === 'undefined') {
            return;
        }
        const baseSpan = this.getProceduralPatchSize();
        const targetSpan = baseSpan * this.minimapSpanMultiplier;
        const span = Math.max(targetSpan, spanOverride ?? targetSpan);
        const canvas = document.createElement('canvas');
        canvas.width = resolution;
        canvas.height = resolution;
        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }
        const image = context.createImageData(resolution, resolution);
        const sampler = (x: number, z: number) => this.earthTerrain.sampleHeight(x, z);
        const startX = center.x - span / 2;
        const startZ = center.z - span / 2;
        for (let y = 0; y < resolution; y++) {
            const wz = startZ + (y / (resolution - 1)) * span;
            for (let x = 0; x < resolution; x++) {
                const wx = startX + (x / (resolution - 1)) * span;
                const color = splatDebugColor(sampler, wx, wz);
                const idx = (y * resolution + x) * 4;
                image.data[idx] = color.r;
                image.data[idx + 1] = color.g;
                image.data[idx + 2] = color.b;
                image.data[idx + 3] = 255;
            }
        }
        context.putImageData(image, 0, 0);
        this.map.texture = canvas.toDataURL();
        this.minimapCenter.copy(center);
        this.minimapSpan = span;
        this.emitMinimapTextureUpdate();
    }

    private refreshMinimapIfNeeded(center?: Vector3) {
        if (!center) {
            return;
        }
        const span = this.minimapSpan > 0 ? this.minimapSpan : this.getProceduralPatchSize() * this.minimapSpanMultiplier;
        const threshold = span * 0.5 * this.minimapUpdateThreshold;
        if (
            Math.abs(center.x - this.minimapCenter.x) > threshold ||
            Math.abs(center.z - this.minimapCenter.z) > threshold
        ) {
            this.updateProceduralMinimapTexture(center);
        }
    }

    async importEnvironment(map: ATMap): Promise<TerrainEnvironment> {
        const loadedTerrain = map.name ? this.environments.find(e => e.name === map.name) : undefined;
        if (map.name && loadedTerrain) {
            return loadedTerrain;
        }
        const terrainEnv: TerrainEnvironment = {
            name: map.name || 'unknown-position',
            environment: new THREE.Group(),
            shaders: [],
            texture: map.texture
        };

        // visual geometry setup
        const toMerge:toMergeType = {};
        const toMergeTexture:toMergeTextureType = {};

        const items = await loadModel.items(map.items);

        const processObject = (c: Object3D<Object3DEventMap>|Mesh|Light|Camera) => {
            if (c instanceof Mesh && c.isMesh) {
                if (c.material instanceof ShaderMaterial) {
                    if (c.name === "water") {
                        this.waterPlane = c as Water;
                        const geom = c.geometry as THREE.PlaneGeometry;
                        const baseSize = geom?.parameters?.width;
                        if (typeof baseSize === 'number' && baseSize > 0) {
                            this.waterBaseSize = baseSize;
                        } else if (!this.waterBaseSize) {
                            this.waterBaseSize = this.getProceduralPatchSize();
                        }
                        c.position.y = WATER_LEVEL;
                        this.updateWaterPlaneTransform();
                    }
                    terrainEnv.shaders.push(c);
                } else if (c.material instanceof MeshStandardMaterial) {
                    const material = c.material;
                    let hex = material.color ? material.color.getHex() || 0 : 0;
                    if (material.map) {
                        hex = Number(hex.toString() + '999');
                        toMergeTexture[hex] = material;
                    }

                    if (!Array.isArray(toMerge[ hex ])) {
                        toMerge[ hex ] =  [];
                    }
                    toMerge[ hex ].push( c );
                } else {
                    console.warn('Unsupported material: ', c.material);
                }
            } else if (c instanceof Light && c.isLight) {
                // We always need to clone the light, otherwise it fails
                terrainEnv.shaders.push( c.clone(true) as Object3D);
            } else if(c instanceof Camera && c.isCamera) {
                this.setSpawnCoordinates(c.position.x, c.position.y, c.position.z);
            }
        };

        for (let i = 0; i < items.length; i++){
            const item = items[i];
            item.updateMatrixWorld( true );

            if (item instanceof THREE.Group) {
                item.traverse(processObject);
            } else {
                processObject(item);
            }
        }

        for ( const hex in toMerge ) {
            // @ts-ignore
            const arr = toMerge[ hex ];
            const visualGeometries: BufferGeometry[] = [];
            arr.forEach( (element) => {
                if (element) {
                    const mesh = element as Mesh;
                    const material = mesh.material as MeshStandardMaterial;
                    if ( material.emissive &&  material.emissive.r !== 0 ) {
                        terrainEnv.environment.attach( mesh );
                    } else if(material.map) {
                        const geom = mesh.geometry.clone();
                        geom.applyMatrix4( mesh.matrixWorld );
                        if (mesh.name === "plane") {
                            const sampler = (x: number, z: number) => this.earthTerrain.sampleHeight(x, z);
                            applyProceduralHeightsWorld(geom, sampler);
                        }
                        const newMesh = new THREE.Mesh( geom, material );
                        newMesh.castShadow = true;
                        newMesh.receiveShadow = true;
                        newMesh.material.shadowSide = 2;
                        newMesh.material.side = THREE.DoubleSide;
                        newMesh.name = mesh.name;
                        terrainEnv.environment.add( newMesh );

                    } else {
                        const geom = mesh.geometry.clone();
                        geom.applyMatrix4( mesh.matrixWorld );
                        visualGeometries.push( geom );
                    }
                }

            } );

            if ( visualGeometries.length ) {
                const newGeom = BufferGeometryUtils.mergeGeometries(visualGeometries);
                // BufferGeometryUtils.mergeBufferGeometries( visualGeometries ) ;
                if (newGeom) {
                    let material;
                    if (toMergeTexture[hex]) {
                        material = toMergeTexture[hex] as MeshStandardMaterial;
                    } else {
                        material = new THREE.MeshStandardMaterial( {
                            color: parseInt( hex )
                            , shadowSide: 2 } );
                    }
                    const newMesh = new THREE.Mesh( newGeom, material );
                    newMesh.castShadow = true;
                    newMesh.receiveShadow = true;
                    newMesh.material.shadowSide = 2;
                    newMesh.material.side = THREE.DoubleSide;
                    terrainEnv.environment.add( newMesh );
                } else {
                    console.error('Merging visual geometries failed');
                }
            } else {
                console.error('No visual geometries found')
            }
        }

        this.updateMapTexture(terrainEnv);
        return terrainEnv;
    }

    refreshCollider() {
        this.environment.clear();

        // Merge environment children
        this.environments.forEach(e => {
            e.environment.children.forEach(object=> {
                this.environment.children.push(object);
            });
        });
        this.environment.updateMatrixWorld( true );

        const staticGenerator = new StaticGeometryGenerator( this.environment );
        staticGenerator.attributes = [ 'position' ];

        const mergedGeometry = staticGenerator.generate();
        mergedGeometry.boundsTree = new MeshBVH( mergedGeometry );

        this.collider.clear();
        this.collider =  new THREE.Mesh( mergedGeometry );
        this.collider.name = 'collider';
        const colliderMaterial: MeshStandardMaterial = this.collider.material as MeshStandardMaterial;
        colliderMaterial.visible = false;
        colliderMaterial.wireframe = false;
        colliderMaterial.opacity = 0.5;
        colliderMaterial.transparent = true;
        this.pendingColliderRefresh = false;
        return this.collider;
    }

    async _loadMapItems(callback: Function|undefined): Promise<TerrainManager> {
        const spawnCenter = this.getSpawnPoint();
        this.minimapCenter.copy(spawnCenter);
        this.minimapSpan = this.getProceduralPatchSize() * this.minimapSpanMultiplier;
        this.ensureChunksAround(spawnCenter);
        const terrain = await this.importEnvironment(this.map);
        if (terrain.texture && terrain.texture !== this.map.texture) {
            this.map.texture = terrain.texture;
        }
        this.environments.push(terrain);

        this.refreshCollider();

        this.loaded = true;
        if (typeof callback === 'function') {
            callback(this);
        }
        return this;
    }


    async preloadAroundSpawn(): Promise<void> {
        const spawn = this.getSpawnPoint();
        // Queue required chunks around spawn
        this.ensureChunksAround(spawn);
        // Capture the current set of pending chunk builds and wait for them
        const pending = Array.from(this.chunkRequests.values());
        if (pending.length > 0) {
            await Promise.allSettled(pending);
        }
        // Rebuild collider with newly available chunk meshes
        this.refreshCollider();
    }

    respawn(player: Mesh|Object3D) {
        const [spawnX, spawnY, spawnZ] = this.params.spawnCoordinates;
        const groundY = this.getHeightAt(spawnX, spawnZ) + 5;
        const safeY = Number.isFinite(spawnY) ? Math.max(groundY, spawnY) : groundY;
        player.position.set(
            spawnX,
            safeY,
            spawnZ);

        this.controls.object
            .position
            .sub( player.position )
            .normalize()
            .multiplyScalar( 100)
            .add( player.position );

        velocity.set(0,0,0);

        this.controls.update();
    }

    initPlayerEvents() {
        window.addEventListener( 'keydown', e => {

            switch ( e.code ) {

                case 'KeyW':
                    this.fwdPressed = true;
                    break;
                case 'KeyS': this.bkdPressed = true; break;
                case 'KeyD': this.rgtPressed = true; break;
                case 'KeyA': this.lftPressed = true; break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.sprinting = true;
                    break;
                case 'Space':
                    // this.controls.camera.position.y = 10;
                    if ( this.playerIsOnGround && this.canJump) {
                        velocity.y = 17;
                        this.playerIsOnGround = false;
                    }
                    break;

            }

        });

        window.addEventListener( 'keyup', e => {
            switch ( e.code ) {
                case 'KeyW': this.fwdPressed = false; break;
                case 'KeyS': this.bkdPressed = false; break;
                case 'KeyD': this.rgtPressed = false; break;
                case 'KeyA': this.lftPressed = false; break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.sprinting = false; break;
            }
        });
    }

    async addToScene() {
        if (!this.loaded) {
            await this.initMethod;
        }
        if (this.collider && !this.scene.children.find(c=>c===this.collider)) {
            this.scene.add( this.collider );
            this.scene.add( this.environment );
            this.environments
                .flatMap((terrain)=>terrain.shaders)
                .forEach(mesh => this.scene.add(mesh));
        }
    }

    updatePlayer(delta:number, camera: THREE.PerspectiveCamera, hero: Hero) {
        const player = hero ? hero.getObject() : null;
        let moving = false;
        if (this.collider && camera && player) {
            const chunkChanged = this.ensureChunksAround(player.position);
            if (chunkChanged || this.pendingColliderRefresh) {
                this.refreshCollider();
            }
            this.collider.visible = this.params.displayCollider || false;

            // Sprint energy handling (hold Shift to sprint)
            const anyMoveKey = this.fwdPressed || this.bkdPressed || this.lftPressed || this.rgtPressed;
            // Use grounded grace to avoid flicker on small elevation changes
            const groundedStable = this.playerIsOnGround || this.groundGrace > 0;
            const sprintingNow = this.sprinting && anyMoveKey && groundedStable && this.energy > 0;
            const drainPerSecond = this.energyMax / Math.max(0.0001, this.drainSecondsToEmpty);
            if (sprintingNow) {
                // Drain energy time-based so full bar depletes in exactly drainSecondsToEmpty seconds
                this.energy -= drainPerSecond * delta;
            } else {
                // Regenerate energy time-based when not sprinting
                this.energy += this.regenPerSecond * delta;
            }
            // Clamp and auto-stop
            if (this.energy <= 0) {
                this.energy = 0;
                this.sprinting = false; // auto-stop sprint when out of energy
            } else if (this.energy > this.energyMax) {
                this.energy = this.energyMax;
            }

            // Publish stamina updates to UI via EventBus (decouples from DOM)
            const regenRate = (this.energy - this.lastEnergyPublished) / Math.max(delta, 1e-3);
            this.lastEnergyPublished = this.energy;
            this.bus?.publish(Topics.Player.StaminaChanged, {
                current: this.energy,
                max: this.energyMax,
                regenRate,
            });

            if ( this.playerIsOnGround ) {
                velocity.y = delta * this.params.gravity;
                //velocity.y = Math.max( 0, velocity.y );
                this.canJump = true;
            } else {
                velocity.y += delta * this.params.gravity;
            }


            player.position.addScaledVector( velocity, delta );

            const angle = this.controls.getAzimuthalAngle(); // Get Azimuth for OrbitControl
            tempVector.set(0,0,0);

            if (this.fwdPressed) {
                tempVector.z = -1;
            }

            if (this.bkdPressed) {
                tempVector.z = 1;
            }

            if (this.lftPressed) {
                tempVector.x = -1;
            }

            if (this.rgtPressed) {
                tempVector.x = 1;
            }

            tempVector.normalize();
            tempVector.applyAxisAngle(upVector, angle);

            if (this.fwdPressed || this.bkdPressed || this.lftPressed || this.rgtPressed) {
                const speedMultiplier = (this.sprinting && groundedStable && this.energy > 0) ? 2.0 : 1.0;
                const moveSpeed = this.params.playerSpeed * speedMultiplier;
                player.position.addScaledVector( tempVector, moveSpeed * delta );
                player.lookAt(player.position.clone().add(tempVector));

                // Determine desired gait and apply with small hysteresis to avoid flicker
                const desiredGait: 'Walk'|'Run' = speedMultiplier > 1.0 ? 'Run' : 'Walk';
                if (this.gaitCurrent === null) {
                    // Entering locomotion: apply immediately
                    this.gaitCurrent = desiredGait;
                    this.gaitPending = null;
                    this.gaitHoldTimer = 0;
                    hero.changeAnimation(desiredGait);
                } else if (this.gaitCurrent !== desiredGait) {
                    if (this.gaitPending !== desiredGait) {
                        this.gaitPending = desiredGait;
                        this.gaitHoldTimer = 0;
                    } else {
                        this.gaitHoldTimer += delta;
                        if (this.gaitHoldTimer >= this.gaitSwitchHold) {
                            this.gaitCurrent = desiredGait;
                            this.gaitPending = null;
                            this.gaitHoldTimer = 0;
                            hero.changeAnimation(desiredGait);
                        }
                    }
                } else {
                    // Stable gait
                    this.gaitPending = null;
                    this.gaitHoldTimer = 0;
                }

                moving = true;
                // console.log(getCoordNeighbours([player.position.x, player.position.z, player.position.y], 100));
            } else {
                // Reset gait state and switch to idle/jump
                this.gaitCurrent = null;
                this.gaitPending = null;
                this.gaitHoldTimer = 0;
                hero.changeAnimation(this.playerIsOnGround ? 'Idle' : 'Jump');
            }

            player.updateMatrixWorld();

            // adjust player position based on collisions
            // @ts-ignore
            const capsuleInfo: CapsuleInfo = player["capsuleInfo"] as CapsuleInfo;
            tempBox.makeEmpty();
            tempMat.copy( this.collider.matrixWorld ).invert();
            tempSegment.copy( capsuleInfo.segment );

            // get the position of the capsule in the local space of the collider
            tempSegment.start.applyMatrix4( player.matrixWorld ).applyMatrix4( tempMat );
            tempSegment.end.applyMatrix4( player.matrixWorld ).applyMatrix4( tempMat );

            // get the axis aligned bounding box of the capsule
            tempBox.expandByPoint( tempSegment.start );
            tempBox.expandByPoint( tempSegment.end );

            tempBox.min.addScalar( - capsuleInfo.radius );
            tempBox.max.addScalar( capsuleInfo.radius );

            if (this.collider.geometry.boundsTree) {
                this.collider.geometry.boundsTree.shapecast( {

                    intersectsBounds: (box: Box3) => box.intersectsBox( tempBox ),

                    intersectsTriangle: (triangle:ExtendedTriangle) => {

                        // check if the triangle is intersecting the capsule and adjust the
                        // capsule position if it is.
                        const triPoint = tempVector;
                        const capsulePoint = tempVector2;

                        const distance = triangle.closestPointToSegment( tempSegment, triPoint, capsulePoint );
                        if ( distance < capsuleInfo.radius ) {

                            const depth = capsuleInfo.radius - distance;
                            const direction = capsulePoint.sub( triPoint ).normalize();

                            tempSegment.start.addScaledVector( direction, depth );
                            tempSegment.end.addScaledVector( direction, depth );

                        }

                    }

                } );
            }

            // get the adjusted position of the capsule collider in world space after checking
            // triangle collisions and moving it. capsuleInfo.segment.start is assumed to be
            // the origin of the player model.
            const newPosition = tempVector;
            newPosition.copy( tempSegment.start ).applyMatrix4( this.collider.matrixWorld );

            // check how much the collider was moved
            const deltaVector = tempVector2;
            deltaVector.subVectors( newPosition, player.position );

            // if the player was primarily adjusted vertically we assume it's on something we should consider ground
            this.playerIsOnGround = deltaVector.y > Math.abs( delta * velocity.y * 0.25 );
            // Update grounded grace window
            if (this.playerIsOnGround) {
                this.groundGrace = this.groundGraceTime;
            } else {
                this.groundGrace = Math.max(0, this.groundGrace - delta);
            }

            const offset = Math.max( 0.0, deltaVector.length() - 1e-5 );
            deltaVector.normalize().multiplyScalar( offset );

            // adjust the player model
            player.position.add( deltaVector );

            if ( ! this.playerIsOnGround ) {
                deltaVector.normalize();
                velocity.addScaledVector( deltaVector, - deltaVector.dot( velocity ) );
            } else {
                velocity.set( 0, 0, 0 );
            }

            // adjust the camera
            const target = this.creatorController.view === 'fps' ?
                player.position.clone().add(new Vector3(0, 7, 0)) : player.position;
            camera.position.sub( this.controls.target );
            this.controls.target.copy( target );
            camera.position.add( target );

            // if the player has fallen too far below the level reset their position to the start
            if ( player.position.y < - 500 ) {
                this.respawn(player);
                moving = false;
            }
            return moving;
        }
    }

    dispose() {
        this.environments
            .filter(env => env !== this.chunkEnvironment)
            .flatMap((terrain)=>terrain.shaders)
            .forEach(mesh => this.scene.remove(mesh));
        this.collider.clear();
        this.environment.clear();
        this.scene.remove(this.collider);
        this.scene.remove(this.environment);
        this.chunkEnvironment.environment.clear();
        this.chunkMeshes.forEach(mesh => this.disposeChunkMesh(mesh));
        this.chunkMeshes.clear();
        this.chunkRequests.clear();
        this.environments = [this.chunkEnvironment];
        this.waterPlane = undefined;
        this.waterBaseSize = undefined;
        this.minimapTextureListeners.clear();
    }

    async updateScene (selectedMap: ATMap): Promise<TerrainManager> {
        if (this.map.id !== selectedMap.id && this.collider) {
            this.dispose();

            this.map = selectedMap;
            return this._loadMapItems(undefined);
        }
        return this;
    }

    getBoundingBox() {
        return this.collider.geometry.boundingBox;
    }

    getMap() {
        return this.map;
    }

    onMinimapTextureUpdated(listener: (payload: { texture?: string; center: { x: number; z: number }; span: number }) => void) {
        this.minimapTextureListeners.add(listener);
        listener({
            texture: this.map.texture,
            center: { x: this.minimapCenter.x, z: this.minimapCenter.z },
            span: this.minimapSpan
        });
        return () => {
            this.minimapTextureListeners.delete(listener);
        };
    }

    private emitMinimapTextureUpdate() {
        const payload = {
            texture: this.map.texture,
            center: { x: this.minimapCenter.x, z: this.minimapCenter.z },
            span: this.minimapSpan
        };
        this.minimapTextureListeners.forEach(cb => cb(payload));
    }

    getHeightAt(x: number, z: number) {
        return this.earthTerrain.sampleHeight(x, z);
    }

    getHeightSampler() {
        return (x: number, z: number) => this.earthTerrain.sampleHeight(x, z);
    }

    getChunkConfig() {
        return {
            size: this.chunkSize,
            radius: this.chunkRadius,
        };
    }

    getProceduralPatchSize() {
        return this.chunkSize * (this.chunkRadius * 2 + 1);
    }

    getTerrainParams() {
        return this.earthTerrain.getParams();
    }

    getSpawnPoint() {
        const [x, y, z] = this.params.spawnCoordinates;
        return new Vector3(x, y, z);
    }
}
