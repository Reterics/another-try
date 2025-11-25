import {
    Box3,
    Color,
    FrontSide,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    Mesh,
    PlaneGeometry,
    RawShaderMaterial,
    Scene,
    TextureLoader,
    Vector2,
    Vector3
} from "three";
import type { EarthParams } from "../../utils/terrain.ts";
import { environmentWorkerClient } from "../../workers/environmentWorkerClient.ts";
import vertexShader from "./shaders/field.vert?raw";
import fragmentShader from "./shaders/field.frag?raw";

const createCurvedBladeGeometry = () => {
    const bladeWidth = 0.12;
    const bladeHeight = 1;
    const heightSegments = 6;
    const geometry = new PlaneGeometry(bladeWidth, bladeHeight, 1, heightSegments);
    geometry.translate(0, bladeHeight / 2, 0);

    const p0 = new Vector3(0, 0, 0);
    const p1 = new Vector3(bladeWidth * 0.25, bladeHeight * 0.4, bladeWidth * 0.4);
    const p2 = new Vector3(-bladeWidth * 0.35, bladeHeight * 0.8, bladeWidth * 0.15);
    const p3 = new Vector3(0, bladeHeight, 0);
    const curvePoint = new Vector3();

    const sampleBezier = (t: number, target: Vector3) => {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;

        target.set(0, 0, 0);
        target.addScaledVector(p0, uuu);
        target.addScaledVector(p1, 3 * uu * t);
        target.addScaledVector(p2, 3 * u * tt);
        target.addScaledVector(p3, ttt);
        return target;
    };

    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
        const localX = positions[i];
        const y = positions[i + 1];
        const t = Math.max(0, Math.min(1, y / bladeHeight));
        sampleBezier(t, curvePoint);
        curvePoint.x += localX;
        positions[i] = curvePoint.x;
        positions[i + 1] = curvePoint.y;
        positions[i + 2] = curvePoint.z;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
};

const BASE_GEOMETRY = createCurvedBladeGeometry();

export interface AdaptiveGrassPatchOptions {
    scene: Scene;
    patchSize: number;
    maxInstances: number;
    terrainParams: EarthParams;
    windIntensity?: number;
}

export class AdaptiveGrassPatch {
    private readonly scene: Scene;
    private readonly patchSize: number;
    private readonly maxInstances: number;
    private readonly geometry: InstancedBufferGeometry;
    private readonly material: RawShaderMaterial;
    private readonly mesh: Mesh;
    private readonly heightData: Float32Array;
    private readonly heightAttribute: InstancedBufferAttribute;
    private readonly seedAttribute: InstancedBufferAttribute;
    private readonly seeds: Float32Array;
    private terrainParams: EarthParams;
    private chunkX = 0;
    private chunkZ = 0;
    private pendingJob = 0;
    private heightsReady = false;
    private targetInstanceCount: number;
    private requestedInstanceCount = 0;
    private origin = new Vector2();
    private lastRequestOrigin = new Vector2();

    constructor(options: AdaptiveGrassPatchOptions) {
        this.scene = options.scene;
        this.patchSize = options.patchSize;
        this.maxInstances = options.maxInstances;
        this.terrainParams = options.terrainParams;
        this.geometry = new InstancedBufferGeometry();
        this.geometry.instanceCount = this.maxInstances;
        this.geometry.index = BASE_GEOMETRY.index;
        this.geometry.attributes.position = BASE_GEOMETRY.attributes.position;
        this.geometry.attributes.uv = BASE_GEOMETRY.attributes.uv;
        this.geometry.attributes.normal = BASE_GEOMETRY.attributes.normal;

        this.seeds = new Float32Array(this.maxInstances * 2);
        this.seedAttribute = new InstancedBufferAttribute(this.seeds, 2);
        this.geometry.setAttribute('seed', this.seedAttribute);
        this.heightData = new Float32Array(this.maxInstances);
        this.heightAttribute = new InstancedBufferAttribute(this.heightData, 1);
        this.geometry.setAttribute('terrainHeight', this.heightAttribute);
        this.targetInstanceCount = this.maxInstances;

        const loader = new TextureLoader();
        const bladeMap = loader.load('/assets/grass/blade_diffuse.jpg');
        const alphaMap = loader.load('/assets/grass/blade_alpha.jpg');

        this.material = new RawShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                time: { value: 0 },
                patchOrigin: { value: new Vector2() },
                patchSize: { value: this.patchSize },
                bladeHeightRange: { value: new Vector2(0.9, 2.7) },
                windIntensity: { value: options.windIntensity ?? 0.2 },
                windDirection: { value: new Vector2(0.75, 0.5) },
                gustFrequency: { value: 0.35 },
                gustIntensity: { value: 0.4 },
                tipBendStrength: { value: 1.6 },
                map: { value: bladeMap },
                alphaMap: { value: alphaMap },
                colorTop: { value: new Color('#a7f06d') },
                colorBottom: { value: new Color('#2f5f1f') },
            },
            side: FrontSide,
            transparent: false,
            depthWrite: true,
            depthTest: true,
            alphaTest: 0.5
        });

        this.mesh = new Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false;
        const bounding = new Box3();
        bounding.setFromCenterAndSize(new Vector3(0, 0, 0), new Vector3(this.patchSize, 50, this.patchSize));
        this.geometry.boundingBox = bounding;
        this.scene.add(this.mesh);
    }

    setChunk(chunkX: number, chunkZ: number) {
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        const origin = this.computeOrigin();
        this.setOrigin(origin.x, origin.y);
    }

    // New: allow placing the patch at any world-space origin (decoupled from terrain chunks)
    setOrigin(x: number, z: number) {
        // Update uniform directly with provided origin
        this.origin.set(x, z);
        (this.material.uniforms.patchOrigin.value as Vector2).copy(this.origin);
        this.mesh.visible = false;
        this.heightsReady = false;
        this.rebuildHeights(this.origin);
    }

    setDensity(factor: number) {
        const normalized = Math.max(0, Math.min(1, factor));
        const clamped = Math.max(0, Math.floor(this.maxInstances * normalized));
        this.targetInstanceCount = clamped;
        this.requestedInstanceCount = Math.min(this.requestedInstanceCount, clamped);
        this.geometry.instanceCount = clamped;
        // If we need more instances than the last request produced, refresh worker sampling
        if (this.heightsReady && clamped > this.requestedInstanceCount) {
            this.rebuildHeights(this.origin);
        } else {
            this.mesh.visible = clamped > 0 && this.heightsReady;
        }
    }

    update(timeSeconds: number) {
        this.material.uniforms.time.value = timeSeconds;
    }

    setVisible(visible: boolean) {
        if (!visible) {
            this.mesh.visible = false;
            // Invalidate any in-flight worker job so late responses are ignored
            this.pendingJob++;
            return;
        }
        this.mesh.visible = this.heightsReady && this.geometry.instanceCount > 0;
    }

    setWindIntensity(intensity: number) {
        this.material.uniforms.windIntensity.value = intensity;
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.geometry.dispose();
        this.material.dispose();
    }

    setTerrainParams(params: EarthParams) {
        this.terrainParams = params;
    }

    private computeOrigin() {
        const x = this.chunkX * this.patchSize + this.patchSize / 2;
        const z = this.chunkZ * this.patchSize + this.patchSize / 2;
        return new Vector2(x, z);
    }

    private rebuildHeights(origin: Vector2) {
        // Send only as many seeds as currently requested (allows external LOD density control)
        const requested = Math.max(0, Math.min(this.maxInstances, this.targetInstanceCount));
        this.requestedInstanceCount = requested;
        if (requested === 0) {
            this.geometry.instanceCount = 0;
            this.heightsReady = true;
            this.mesh.visible = false;
            return;
        }
        const taskId = ++this.pendingJob;
        this.lastRequestOrigin.copy(origin);
        environmentWorkerClient.computeGrassHeights({
            instanceCount: requested,
            patchSize: this.patchSize,
            origin: { x: origin.x, z: origin.y },
            terrainParams: this.terrainParams
        }).then(({ heights, seeds }) => {
            if (taskId !== this.pendingJob) {
                return;
            }
            // Drop if origin changed while worker was running
            if (this.lastRequestOrigin.x !== this.origin.x || this.lastRequestOrigin.y !== this.origin.y) {
                return;
            }

            this.geometry.instanceCount = Math.max(0, Math.min(heights.length, (seeds?.length || 0) / 2, this.maxInstances));
            if (this.geometry.instanceCount) {
                this.heightData.set(heights);
                this.seeds.set(seeds);
                this.mesh.visible = true;
                this.heightsReady = true;
                this.heightAttribute.needsUpdate = true;
                this.seedAttribute.needsUpdate = true;
            } else {
                this.heightsReady = false;
                this.mesh.visible = false;
            }
        }).catch((err) => {
            console.error('[AdaptiveGrassPatch] Worker heights failed', err);
            // On failure, avoid CPU fallback to keep work off the main thread
            this.geometry.instanceCount = 0;
            this.heightsReady = false;
            this.mesh.visible = false;
        });
    }
}
