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

interface GrassImpostorFieldOptions {
    scene: Scene;
    sampler: (x: number, z: number) => number;
    chunkSize: number;
    patchRadius: number;
    impostorRadius: number;
    densityPerCell?: number;
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
    private patchRadius: number;
    private impostorRadius: number;
    private mesh: InstancedMesh | null = null;
    private readonly dummy: Object3D;
    private maxInstances: number;
    private densityPerCell: number;

    constructor(options: GrassImpostorFieldOptions) {
        this.scene = options.scene;
        this.sampler = options.sampler;
        this.chunkSize = options.chunkSize;
        this.patchRadius = options.patchRadius;
        this.impostorRadius = options.impostorRadius;
        this.densityPerCell = Math.max(1, options.densityPerCell ?? 3);
        this.dummy = new Object3D();
        this.maxInstances = 0;
        this.rebuildMesh();
    }

    setSampler(sampler: (x: number, z: number) => number) {
        this.sampler = sampler;
    }

    setConfig(patchRadius: number, impostorRadius: number, chunkSize: number) {
        const instancesBefore = this.maxInstances;
        this.patchRadius = patchRadius;
        this.impostorRadius = Math.max(patchRadius + 1, impostorRadius);
        this.chunkSize = chunkSize;
        const instancesAfter = this.calculateMaxInstances();
        if (!this.mesh || instancesAfter !== instancesBefore) {
            this.rebuildMesh();
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
        const chunkX = Math.floor(playerPosition.x / this.chunkSize);
        const chunkZ = Math.floor(playerPosition.z / this.chunkSize);
        let index = 0;
        outer: for (let dz = -this.impostorRadius; dz <= this.impostorRadius; dz++) {
            for (let dx = -this.impostorRadius; dx <= this.impostorRadius; dx++) {
                const ring = Math.max(Math.abs(dx), Math.abs(dz));
                if (ring <= this.patchRadius) {
                    continue;
                }
                if (index >= this.maxInstances) {
                    break outer;
                }
                for (let sample = 0; sample < this.densityPerCell; sample++) {
                    if (index >= this.maxInstances) {
                        break outer;
                    }
                    const hashX = chunkX + dx + sample * 17.23;
                    const hashZ = chunkZ + dz + sample * 9.31;
                    const { offsetX, offsetZ, scale } = jitter(hashX, hashZ);
                    const cellCenterX = (chunkX + dx) * this.chunkSize + this.chunkSize / 2;
                    const cellCenterZ = (chunkZ + dz) * this.chunkSize + this.chunkSize / 2;
                    const worldX = cellCenterX + offsetX * this.chunkSize * 0.35;
                    const worldZ = cellCenterZ + offsetZ * this.chunkSize * 0.35;
                    const height = this.sampler(worldX, worldZ);
                    this.dummy.position.set(worldX, height, worldZ);
                    const heightScale = 0.8 + scale * 0.45;
                    const widthScale = 1.5 + scale * 0.6;
                    this.dummy.scale.set(widthScale, heightScale, widthScale);
                    this.dummy.lookAt(cameraPosition.x, height + heightScale * 0.4, cameraPosition.z);
                    this.dummy.updateMatrix();
                    this.mesh.setMatrixAt(index, this.dummy.matrix);
                    index++;
                }
            }
        }
        this.mesh.count = index;
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.visible = index > 0;
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
            gradient.addColorStop(0, '#1e7a27');
            gradient.addColorStop(0.5, color);
            gradient.addColorStop(1, '#d4f48f');
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
        const totalCells = (this.impostorRadius * 2 + 1) ** 2;
        const innerCells = (this.patchRadius * 2 + 1) ** 2;
        return Math.max(0, totalCells - innerCells) * this.densityPerCell;
    }
}
