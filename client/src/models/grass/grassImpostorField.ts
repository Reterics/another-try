import {
    CanvasTexture,
    Color,
    InstancedMesh,
    MeshBasicMaterial,
    MeshBasicMaterialParameters,
    Object3D,
    PlaneGeometry,
    Scene,
    SRGBColorSpace,
    Vector3
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { EarthParams } from "../../utils/terrain.ts";
import { environmentWorkerClient } from "../../workers/environmentWorkerClient.ts";

interface GrassImpostorFieldOptions {
    scene: Scene;
    sampler: (x: number, z: number) => number;
    chunkSize: number;
    patchRadius: number;
    impostorRadius: number;
    terrainParams: EarthParams;
    densityPerCell?: number;
}

interface ImpostorInstance {
    worldX: number;
    worldZ: number;
    widthScale: number;
    heightScale: number;
}

const jitter = (dx: number, dz: number) => {
    const seed = Math.sin(dx * 157.31 + dz * 313.7) * 43758.5453;
    const frac = seed - Math.floor(seed);
    const second = Math.sin((dx + 13.7) * 97.53 + (dz - 3.1) * 231.79) * 12345.6789;
    const frac2 = second - Math.floor(second);
    return {
        offsetX: frac * 2.0 - 1.0,
        offsetZ: frac2 * 2.0 - 1.0,
        scale: 0.65 + (frac * 0.5),
    };
};

export class GrassImpostorField {
    private readonly scene: Scene;
    private sampler: (x: number, z: number) => number;
    private chunkSize: number;
    // Radii are in world units (same as your coordinate system; 1 unit = 1 meter)
    private patchRadius: number;
    private impostorRadius: number;
    private mesh: InstancedMesh | null = null;
    private readonly dummy: Object3D;
    private maxInstances: number;
    private densityPerCell: number;
    private terrainParams: EarthParams;
    private readonly cachedPlayerPosition: Vector3;
    private readonly cachedCameraPosition: Vector3;
    private layoutCenter?: Vector3;
    private rebuildDistance: number;
    private layoutDirty = true;
    private currentInstances: ImpostorInstance[];
    private currentHeights?: Float32Array;
    private pendingInstances?: ImpostorInstance[];
    private pendingGeneration = 0;
    private layoutGeneration = 0;

    constructor(options: GrassImpostorFieldOptions) {
        this.scene = options.scene;
        this.sampler = options.sampler;
        this.chunkSize = options.chunkSize;
        this.patchRadius = options.patchRadius;
        this.impostorRadius = options.impostorRadius;
        this.densityPerCell = Math.max(1, options.densityPerCell ?? 3);
        this.terrainParams = options.terrainParams;
        this.dummy = new Object3D();
        this.maxInstances = 0;
        this.cachedPlayerPosition = new Vector3();
        this.cachedCameraPosition = new Vector3();
        this.currentInstances = [];
        this.rebuildDistance = Math.max(this.chunkSize * 0.35, 1);
        this.rebuildMesh();
    }

    private updateRebuildDistance() {
        this.rebuildDistance = Math.max(this.chunkSize * 0.35, 1);
    }

    setSampler(sampler: (x: number, z: number) => number) {
        this.sampler = sampler;
    }

    setTerrainParams(params: EarthParams) {
        this.terrainParams = params;
        this.layoutDirty = true;
    }

    setConfig(patchRadius: number, impostorRadius: number, chunkSize: number) {
        const instancesBefore = this.maxInstances;
        this.patchRadius = patchRadius; // meters
        this.chunkSize = chunkSize;
        // ensure impostor radius is at least one cell beyond patch radius
        this.impostorRadius = Math.max(patchRadius + this.chunkSize, impostorRadius);
        this.updateRebuildDistance();
        const instancesAfter = this.calculateMaxInstances();
        if (!this.mesh || instancesAfter !== instancesBefore) {
            this.rebuildMesh();
        } else {
            this.layoutDirty = true;
        }
    }

    setDensity(density: number) {
        const normalized = Math.max(1, density);
        if (normalized === this.densityPerCell) {
            return;
        }
        this.densityPerCell = normalized;
        this.rebuildMesh();
    }

    update(playerPosition: Vector3, cameraPosition: Vector3) {
        if (!this.mesh) {
            return;
        }
        this.cachedPlayerPosition.copy(playerPosition);
        this.cachedCameraPosition.copy(cameraPosition);

        if (this.shouldRebuildLayout(playerPosition)) {
            const layout = this.buildCandidateLayout(playerPosition);
            this.requestImpostorHeights(layout);
        }

        if (this.currentInstances.length && this.currentHeights && this.currentHeights.length >= this.currentInstances.length) {
            this.populateInstances(this.currentInstances, this.currentHeights, cameraPosition);
        } else {
            this.mesh.visible = false;
        }
    }

    private shouldRebuildLayout(position: Vector3) {
        if (this.layoutDirty || !this.layoutCenter) {
            return true;
        }
        const dx = position.x - this.layoutCenter.x;
        const dz = position.z - this.layoutCenter.z;
        return (dx * dx + dz * dz) >= (this.rebuildDistance * this.rebuildDistance);
    }

    private buildCandidateLayout(position: Vector3): ImpostorInstance[] {
        const chunkX = Math.floor(position.x / this.chunkSize);
        const chunkZ = Math.floor(position.z / this.chunkSize);
        const maxOffset = Math.ceil(this.impostorRadius / this.chunkSize) + 1;
        const innerExclusion = this.patchRadius + this.chunkSize * Math.SQRT1_2;
        const instances: ImpostorInstance[] = [];
        outer: for (let dz = -maxOffset; dz <= maxOffset; dz++) {
            for (let dx = -maxOffset; dx <= maxOffset; dx++) {
                if (instances.length >= this.maxInstances) {
                    break outer;
                }
                const cx = chunkX + dx;
                const cz = chunkZ + dz;
                const cellCenterX = cx * this.chunkSize + this.chunkSize / 2;
                const cellCenterZ = cz * this.chunkSize + this.chunkSize / 2;
                const centerDist = Math.hypot(cellCenterX - position.x, cellCenterZ - position.z);
                if (centerDist > this.impostorRadius + this.chunkSize * Math.SQRT1_2) {
                    continue;
                }
                for (let sample = 0; sample < this.densityPerCell; sample++) {
                    if (instances.length >= this.maxInstances) {
                        break outer;
                    }
                    const hashX = cx + sample * 17.23;
                    const hashZ = cz + sample * 9.31;
                    const { offsetX, offsetZ, scale } = jitter(hashX, hashZ);
                    const worldX = cellCenterX + offsetX * this.chunkSize * 0.35;
                    const worldZ = cellCenterZ + offsetZ * this.chunkSize * 0.35;
                    const radial = Math.hypot(worldX - position.x, worldZ - position.z);
                    if (radial <= innerExclusion || radial > this.impostorRadius) {
                        continue;
                    }
                    const heightScale = 0.8 + scale * 0.10;
                    const widthScale = 1.5 + scale * 0.6;
                    instances.push({ worldX, worldZ, widthScale, heightScale });
                }
            }
        }
        if (!this.layoutCenter) {
            this.layoutCenter = new Vector3();
        }
        this.layoutCenter.copy(position);
        this.layoutDirty = false;
        return instances;
    }

    private requestImpostorHeights(instances: ImpostorInstance[]) {
        if (!instances.length) {
            this.currentInstances = [];
            this.currentHeights = undefined;
            this.pendingInstances = undefined;
            if (this.mesh) {
                this.mesh.count = 0;
                this.mesh.visible = false;
            }
            return;
        }
        this.pendingInstances = instances;
        const generation = ++this.layoutGeneration;
        this.pendingGeneration = generation;
        const positions = new Float32Array(instances.length * 2);
        for (let i = 0; i < instances.length; i++) {
            positions[i * 2] = instances[i].worldX;
            positions[i * 2 + 1] = instances[i].worldZ;
        }
        environmentWorkerClient.computeImpostorHeights({
            positions,
            terrainParams: this.terrainParams
        }).then(({ heights }) => {
            if (this.pendingGeneration !== generation) {
                return;
            }
            this.currentInstances = this.pendingInstances ? [...this.pendingInstances] : [];
            this.currentHeights = heights;
            this.pendingInstances = undefined;
            this.populateInstances(this.currentInstances, heights, this.cachedCameraPosition);
        }).catch((err) => {
            console.error('[GrassImpostorField] Worker impostor heights failed', err);
            if (this.pendingGeneration !== generation || !this.pendingInstances) {
                return;
            }
            const fallback = this.computeFallbackHeights(this.pendingInstances);
            this.currentInstances = [...this.pendingInstances];
            this.currentHeights = fallback;
            this.pendingInstances = undefined;
            this.populateInstances(this.currentInstances, fallback, this.cachedCameraPosition);
        });
    }

    private computeFallbackHeights(instances: ImpostorInstance[]) {
        const heights = new Float32Array(instances.length);
        for (let i = 0; i < instances.length; i++) {
            const inst = instances[i];
            heights[i] = this.sampler(inst.worldX, inst.worldZ);
        }
        return heights;
    }

    private populateInstances(instances: ImpostorInstance[], heights: Float32Array, cameraPosition: Vector3) {
        if (!this.mesh) {
            return;
        }
        const count = Math.min(instances.length, heights.length, this.maxInstances);
        for (let i = 0; i < count; i++) {
            const inst = instances[i];
            const height = heights[i];
            this.dummy.position.set(inst.worldX, height, inst.worldZ);
            this.dummy.scale.set(inst.widthScale, inst.heightScale, inst.widthScale);
            this.dummy.lookAt(cameraPosition.x, height + inst.heightScale * 0.4, cameraPosition.z);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.mesh.count = count;
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.visible = count > 0;
    }

    private resetLayout() {
        this.layoutDirty = true;
        this.layoutCenter = undefined;
        this.pendingInstances = undefined;
        this.currentInstances = [];
        this.currentHeights = undefined;
        this.layoutGeneration++;
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            if (Array.isArray(this.mesh.material)) {
                this.mesh.material.forEach(material => material.dispose());
            } else {
                this.mesh.material.dispose();
            }
            this.mesh = null;
        }
        this.resetLayout();
    }

    private rebuildMesh() {
        this.dispose();
        this.maxInstances = this.calculateMaxInstances();
        if (this.maxInstances <= 0) {
            return;
        }
        const planes = [];
        const basePlane = new PlaneGeometry(18, 14, 1, 1);
        basePlane.translate(0, 7, 0);
        planes.push(basePlane);
        const second = basePlane.clone();
        second.rotateY(Math.PI / 3);
        planes.push(second);
        const third = basePlane.clone();
        third.rotateY(-Math.PI / 3);
        planes.push(third);
        const geometry = mergeGeometries(planes, false);
        const textures = this.createProceduralTextures();
        const materialParams = {
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            alphaTest: 0.5,
        } as MeshBasicMaterialParameters;
        if (textures) {
            materialParams.map = textures.diffuse;
            materialParams.alphaMap = textures.alpha;
        } else {
            materialParams.color = new Color(0x6ab04c);
        }
        const material = new MeshBasicMaterial(materialParams);
        this.mesh = new InstancedMesh(geometry, material, this.maxInstances);
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);
        this.layoutDirty = true;
    }

    private createProceduralTextures(): { diffuse: CanvasTexture; alpha: CanvasTexture } | undefined {
        if (typeof document === 'undefined') {
            return undefined;
        }
        const size = 256;
        const diffuseCanvas = document.createElement('canvas');
        diffuseCanvas.width = size;
        diffuseCanvas.height = size;
        const alphaCanvas = document.createElement('canvas');
        alphaCanvas.width = size;
        alphaCanvas.height = size;
        const diffuseCtx = diffuseCanvas.getContext('2d');
        const alphaCtx = alphaCanvas.getContext('2d');
        if (!diffuseCtx || !alphaCtx) {
            return undefined;
        }
        diffuseCtx.clearRect(0, 0, size, size);
        alphaCtx.clearRect(0, 0, size, size);
        const drawBlade = (x: number, width: number, height: number, color: string, tilt: number) => {
            const baseY = size;
            const topY = size - height;
            diffuseCtx.beginPath();
            diffuseCtx.moveTo(x, baseY);
            const cpX = x + tilt * width * 0.5;
            diffuseCtx.quadraticCurveTo(cpX, (baseY + topY) / 2, x + width * 0.1, topY);
            diffuseCtx.lineTo(x - width * 0.1, topY);
            diffuseCtx.quadraticCurveTo(cpX - tilt * width * 0.5, (baseY + topY) / 2, x - width * 0.4, baseY);
            diffuseCtx.closePath();
            const gradient = diffuseCtx.createLinearGradient(x, baseY, x, topY);
            gradient.addColorStop(0, '#0A1E01');
            gradient.addColorStop(0.5, color);
            gradient.addColorStop(1, '#1D4D03');
            diffuseCtx.fillStyle = gradient;
            diffuseCtx.fill();

            alphaCtx.beginPath();
            alphaCtx.moveTo(x, baseY);
            alphaCtx.quadraticCurveTo(cpX, (baseY + topY) / 2, x + width * 0.05, topY);
            alphaCtx.lineTo(x - width * 0.05, topY);
            alphaCtx.quadraticCurveTo(cpX - tilt * width * 0.5, (baseY + topY) / 2, x - width * 0.4, baseY);
            alphaCtx.closePath();
            alphaCtx.fillStyle = 'rgba(255,255,255,1)';
            alphaCtx.fill();
        };

        for (let i = 0; i < 48; i++) {
            const bladeWidth = 6 + Math.random() * 9;
            const bladeHeight = size * (0.35 + Math.random() * 0.35);
            const posX = 30 + Math.random() * (size - 60);
            const tilt = Math.random() * 0.8 - 0.4;
            const hue = 80 + Math.random() * 12;
            const color = `hsl(${hue}, 50%, 28%)`;
            drawBlade(posX, bladeWidth, bladeHeight, color, tilt);
        }

        const diffuseTexture = new CanvasTexture(diffuseCanvas);
        diffuseTexture.colorSpace = SRGBColorSpace;
        diffuseTexture.needsUpdate = true;
        const alphaTexture = new CanvasTexture(alphaCanvas);
        alphaTexture.needsUpdate = true;
        return { diffuse: diffuseTexture, alpha: alphaTexture };
    }

    private calculateMaxInstances() {
        // Approximate number of chunk cells in the circular annulus
        const cellArea = this.chunkSize * this.chunkSize;
        const annulusArea = Math.max(0, Math.PI * (this.impostorRadius * this.impostorRadius - this.patchRadius * this.patchRadius));
        const cells = Math.max(0, Math.floor(annulusArea / cellArea));
        return Math.max(0, cells) * this.densityPerCell;
    }
}
