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
    // HTML canvas reference and resize observer to keep aspect/frustum correct
    private canvas!: HTMLCanvasElement;
    private resizeObserver?: ResizeObserver;
    private mapEl?: HTMLDivElement;

    constructor({boundingBox, texture, target}: MinimapInputArguments) {
        super();

        this.outer = target || this.renderHTML();
        // Cache the map element if present (for sizing and masking robustness)
        this.mapEl = this.outer.querySelector('.map') as HTMLDivElement | null || undefined;
        const minimapCanvas = this.outer.querySelector('canvas');
        if (!minimapCanvas) {
            throw Error('Target Element must have a canvas to render');
        }
        this.canvas = minimapCanvas as HTMLCanvasElement;
        // Ensure the canvas fills its container; the container will control aspect/shape
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';

        this.textureLoader = new TextureLoader();
        const baseTexture = texture
            ? this.textureLoader.load(texture)
            : this.buildFallbackTexture();
        const prepared = this.prepareTexture(baseTexture);
        this.spriteMaterial = new SpriteMaterial({ map: prepared, color: 0xffffff });
        this.sprite = new Sprite(this.spriteMaterial);
        this.sprite.position.set(0,0,0);
        // Ensure rotation around center of the sprite
        this.sprite.center.set(0.5, 0.5);
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
        this.camera.zoom = 2;
        this.camera.position.set(0, 0, 150);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        // Render with transparent background so HTML can mask the canvas into a circle
        this.renderer.setClearColor(0x000000, 0);
        // Respect device pixel ratio for crisp texturing
        // Note: keep consistent with main app; adjust if performance is a concern
        // @ts-ignore
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.snapCircleSize();
        this.updateRendererSize();
        this.currentSpan = this.dimensions.width || 1;
        this.applyPatchSpan(this.currentSpan);

        // Observe canvas size to keep frustum/renderer aspect-correct
        if ('ResizeObserver' in window) {
            // @ts-ignore
            this.resizeObserver = new ResizeObserver(() => {
                this.snapCircleSize();
                this.updateRendererSize();
                this.applyPatchSpan(this.currentSpan);
            });
            this.resizeObserver.observe(this.canvas);
            if (this.mapEl) this.resizeObserver.observe(this.mapEl);
        }
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
        // Match camera frustum to the canvas aspect to avoid deformation when rotating
        const w = this.canvas?.clientWidth || this.dimensions.width || 1;
        const h = this.canvas?.clientHeight || this.dimensions.height || 1;
        const aspect = h > 0 ? (w / h) : 1;
        const halfV = viewWidth / 2;
        const halfH = halfV * aspect;
        this.camera.left = -halfH;
        this.camera.right = halfH;
        this.camera.top = halfV;
        this.camera.bottom = -halfV;
        this.camera.updateProjectionMatrix();
        // Keep sprite square in world units; camera handles aspect
        this.sprite.scale.set(span, span, 1);
    }

    private updateSpriteOffset(position?: Vector3) {
        if (position) {
            this.lastPlayerPosition.copy(position);
        }
        // Offset between player and current minimap center in world space
        const dx = this.lastPlayerPosition.x - this.currentCenter.x;
        const dz = this.lastPlayerPosition.z - this.currentCenter.z;
        
        // The minimap texture is rotated by `spriteMaterial.rotation` which we set to `-heading + π`.
        // To keep the player visually centered and move the map in the correct on-screen direction,
        // translate the sprite in the same rotated space as the texture.
        // That means rotate the world offset by the same angle used for texture alignment (without the π flip).
        const angle = this.lastHeading - Math.PI / 2; // swapped to +heading to correct horizontal (E/W) inversion; π still excluded for translation
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rx = dx * cos - dz * sin;
        const rz = dx * sin + dz * cos;
        
        // Move the map opposite to the player's world movement (player stays centered)
        // Try axis-swap variant so that screen X corresponds to world +Z and screen Y to world +X in the rotated frame.
        this.sprite.position.set(rz, -rx, 0);
    }

    private applyTexture(texture: Texture) {
        this.prepareTexture(texture);
        const previous = this.spriteMaterial.map;
        if (previous && previous !== texture) {
            previous.dispose();
        }
        this.spriteMaterial.map = texture;
        // Improve texture sampling quality on rotation
        try {
            // @ts-ignore
            const maxAniso = this.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
            if (this.spriteMaterial.map && 'anisotropy' in this.spriteMaterial.map) {
                // @ts-ignore
                this.spriteMaterial.map.anisotropy = maxAniso;
                this.spriteMaterial.map.needsUpdate = true;
            }
        } catch (e) {
            // ignore capabilities errors
        }
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
            // Use provided yaw heading when movement is negligible
            this.lastHeading = rotation.y;
        }
        // Rotate sprite via material.rotation (Sprite uses material's rotation for 2D spin)
        // Add π to correct North/South inversion (texture/world alignment)
        this.spriteMaterial.rotation = -this.lastHeading + Math.PI;
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

        map.appendChild(controllers);

        outer.appendChild(map);
        this.outer = outer;
        document.body.appendChild(this.outer);
        return outer;
    }

    private snapCircleSize() {
        if (!this.mapEl) return;
        const r = this.mapEl.getBoundingClientRect();
        // Determine the target square size in CSS pixels; prefer the smaller side
        let size = Math.floor(Math.min(r.width, r.height));
        // Snap to even integer to avoid half-pixel anti-alias artifacts at some DPRs
        if (size % 2 !== 0) size -= 1;
        if (size <= 0) return;
        // Enforce exact width; height comes from aspect-ratio 1/1
        const prev = this.mapEl.style.width;
        const target = `${size}px`;
        if (prev !== target) {
            this.mapEl.style.width = target;
            // Ensure a perfect square layout
            // @ts-ignore: aspectRatio is supported in modern browsers
            this.mapEl.style.aspectRatio = '1 / 1';
        }
    }

    private updateRendererSize() {
        if (!this.canvas || !this.renderer) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = (window.devicePixelRatio || 1);
        const width = Math.max(1, Math.floor(rect.width * dpr));
        const height = Math.max(1, Math.floor(rect.height * dpr));
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.renderer.setSize(width, height, false);
            // Projection will be recalculated in applyPatchSpan(), but update here for safety
            this.camera.updateProjectionMatrix();
        }
    }
}