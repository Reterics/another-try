import {CanvasTexture, Euler, OrthographicCamera, Scene, Sprite, SpriteMaterial, SRGBColorSpace, Texture, TextureLoader, Vector3, WebGLRenderer} from "three";
import {MinimapDimensions, MinimapInputArguments} from "../types/controller.ts";
import {EventManager} from "../lib/EventManager.ts";


export class MinimapController extends EventManager{
    private readonly scene: Scene;
    private readonly camera: OrthographicCamera;
    private renderer: WebGLRenderer;
    private dimensions: MinimapDimensions;
    private outer: HTMLDivElement;
    private sprite: Sprite;
    private spriteMaterial: SpriteMaterial;
    private textureLoader: TextureLoader;
    private currentTextureUrl?: string;
    private pendingTextureUrl?: string;
    private currentCenter = new Vector3();
    private currentSpan = 1;
    private lastPlayerPosition = new Vector3();
    private lastHeading = 0;
    private readonly viewCoverage = 0.4;
    private readonly minZoom = 0.6;
    private readonly maxZoom = 3;

    constructor({boundingBox, texture, target}: MinimapInputArguments) {
        super();

        this.outer = target || this.renderHTML();
        const minimapCanvas = this.outer.querySelector('canvas');
        if (!minimapCanvas) {
            throw Error('Target Element must have a canvas to render');
        }

        this.textureLoader = new TextureLoader();
        const baseTexture = texture
            ? this.textureLoader.load(texture)
            : this.buildFallbackTexture();
        const prepared = this.prepareTexture(baseTexture);
        this.spriteMaterial = new SpriteMaterial({ map: prepared, color: 0xffffff });
        this.sprite = new Sprite(this.spriteMaterial);
        this.sprite.position.set(0,0,0);
        this.scene = new Scene();
        this.scene.add(this.sprite);
        this.currentTextureUrl = texture || undefined;

        this.dimensions = {
            left: boundingBox ? boundingBox.min.x : minimapCanvas.width / -2,
            right: boundingBox ? boundingBox.max.x : minimapCanvas.width / 2,
            top: boundingBox ? boundingBox.max.z : minimapCanvas.height / 2,
            bottom: boundingBox ? boundingBox.min.z : minimapCanvas.height / -2,
            width: boundingBox ? boundingBox.max.x - boundingBox.min.x : minimapCanvas.width,
            height: boundingBox ? boundingBox.max.z - boundingBox.min.z : minimapCanvas.height
        };

        this.camera = new OrthographicCamera(
            -this.dimensions.width / 2,
            this.dimensions.width / 2,
            this.dimensions.height / 2,
            -this.dimensions.height / 2,
            1,
            2000
        );
        this.camera.zoom = 1;
        this.camera.position.set(0, 0, 150);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new WebGLRenderer({ canvas: minimapCanvas });
        this.currentSpan = this.dimensions.width || 1;
        this.applyPatchSpan(this.currentSpan);
    }
    
    setTexture(texture?: string) {
        if (!texture) {
            this.pendingTextureUrl = undefined;
            this.currentTextureUrl = undefined;
            this.applyTexture(this.buildFallbackTexture());
            return;
        }
        if (texture === this.currentTextureUrl) {
            return;
        }
        const requestUrl = texture;
        this.pendingTextureUrl = requestUrl;
        this.textureLoader.load(
            texture,
            (tex) => {
                if (this.pendingTextureUrl !== requestUrl) {
                    tex.dispose();
                    return;
                }
                this.pendingTextureUrl = undefined;
                this.currentTextureUrl = requestUrl;
                this.applyTexture(tex);
            },
            undefined,
            (err) => {
                if (this.pendingTextureUrl === requestUrl) {
                    this.pendingTextureUrl = undefined;
                }
                console.warn('[Minimap] Failed to update texture', err);
            }
        );
    }

    setPatch(center: { x: number; z: number }, span: number) {
        this.currentCenter.set(center.x, 0, center.z);
        if (!this.lastPlayerPosition.lengthSq()) {
            this.lastPlayerPosition.copy(this.currentCenter);
        }
        const safeSpan = Math.max(10, span || 10);
        if (Math.abs(safeSpan - this.currentSpan) > 1e-3) {
            this.currentSpan = safeSpan;
            this.applyPatchSpan(this.currentSpan);
        }
        this.updateSpriteOffset();
    }

    private applyPatchSpan(span: number) {
        const viewWidth = Math.max(10, span * this.viewCoverage);
        const halfView = viewWidth / 2;
        this.camera.left = -halfView;
        this.camera.right = halfView;
        this.camera.top = halfView;
        this.camera.bottom = -halfView;
        this.camera.updateProjectionMatrix();
        this.sprite.scale.set(span, span, 1);
    }

    private updateSpriteOffset(position?: Vector3) {
        if (position) {
            this.lastPlayerPosition.copy(position);
        }
        const dx = this.lastPlayerPosition.x - this.currentCenter.x;
        const dz = this.lastPlayerPosition.z - this.currentCenter.z;
        this.sprite.position.set(-dx, -dz, 0);
    }

    private applyTexture(texture: Texture) {
        this.prepareTexture(texture);
        const previous = this.spriteMaterial.map;
        if (previous && previous !== texture) {
            previous.dispose();
        }
        this.spriteMaterial.map = texture;
        this.spriteMaterial.needsUpdate = true;
    }

    private prepareTexture(texture: Texture) {
        if ('colorSpace' in texture) {
            // @ts-ignore
            texture.colorSpace = SRGBColorSpace;
        }
        texture.needsUpdate = true;
        return texture;
    }

    update(position?: Vector3, rotation?: Euler) {
        if (rotation) {
            this.lastHeading = rotation.y;
        }
        this.sprite.rotation.z = -this.lastHeading;
        this.updateSpriteOffset(position);
        this.renderer.render(this.scene, this.camera);
    }

    zoom (delta: number) {
        const step = delta > 0 ? 0.2 : -0.2;
        const nextZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.camera.zoom + step));
        if (nextZoom !== this.camera.zoom) {
            this.camera.zoom = nextZoom;
            this.camera.updateProjectionMatrix();
        }
    }

    private buildFallbackTexture(size = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#0b2139';
            ctx.fillRect(0, 0, size, size);
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            const step = size / 16;
            for (let i = 0; i <= size; i += step) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i, size);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, i);
                ctx.lineTo(size, i);
                ctx.stroke();
            }
        }
        const texture = new CanvasTexture(canvas);
        return this.prepareTexture(texture);
    }

    protected renderHTML() {
        if(this.outer) {
            return this.outer;
        }
        const outer = document.createElement('div');
        outer.classList.add('minimap-outer');

        const map = document.createElement('div');
        map.classList.add('map');
        const canvas = document.createElement('canvas');
        canvas.classList.add('minimap');

        const controllers = document.createElement('div');
        controllers.classList.add('controllers');

        const zoomIn = document.createElement('button');
        zoomIn.innerHTML = '+';
        zoomIn.classList.add('zoom');
        zoomIn.classList.add('zoom-in');
        zoomIn.onclick = () => {
            this.zoom(1);
            this.emit('zoom', 1);
        };
        const zoomOut = document.createElement('button');
        zoomOut.innerHTML = '-';
        zoomOut.classList.add('zoom');
        zoomOut.classList.add('zoom-out');
        zoomOut.onclick = () => {
            this.zoom(-1);
            this.emit('zoom', -1);
        };

        map.appendChild(canvas);
        controllers.appendChild(zoomIn);
        controllers.appendChild(zoomOut);


        outer.appendChild(map);
        outer.appendChild(controllers);
        this.outer = outer;
        document.body.appendChild(this.outer);
        return outer;
    }
}
