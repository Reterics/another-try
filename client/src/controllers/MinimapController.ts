import {
    Euler,
    OrthographicCamera,
    Scene,
    Sprite,
    SpriteMaterial,
    Texture,
    TextureLoader,
    Vector3,
    WebGLRenderer
} from "three";
import {MinimapDimensions, MinimapInputArguments} from "../types/controller.ts";
import {
    bindMinimapControls,
    createMinimapRoot,
    MinimapDomBindingsHandle,
    snapCircleSize
} from "../features/minimap/MinimapDom.ts";
import {createFallbackTexture, prepareMapTexture} from "../features/minimap/MinimapTextureService.ts";
import {createMinimapCamera, MinimapCamera} from "../features/minimap/MinimapCamera.ts";
import ResourceTracker from "../engine/assets/ResourceTracker.ts";
import EventBus, {Subscription} from "@shared/events/EventBus.ts";
import {Topics} from "@shared/events/topics.ts";


export class MinimapController {
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
    private readonly minZoom = 0.6;
    private readonly maxZoom = 3;
    // HTML canvas reference and resize observer to keep aspect/frustum correct
    private canvas!: HTMLCanvasElement;
    private resizeObserver?: ResizeObserver;
    private mapEl?: HTMLDivElement;
    private domBindings?: MinimapDomBindingsHandle;
    // New: typed camera helper and resource tracker
    private miniCam: MinimapCamera = createMinimapCamera();
    private resources: ResourceTracker = new ResourceTracker();
    private bus?: EventBus;
    private busSubscriptions: Subscription[] = [];
    private readonly busPosition = new Vector3();
    private readonly busHeading = new Euler();
    // North label element (optional)
    private headingEl?: HTMLElement;

    constructor({boundingBox, texture, target, eventBus}: MinimapInputArguments) {
        this.bus = eventBus;
        this.outer = target || createMinimapRoot();
        // Cache the map element if present (for sizing and masking robustness)
        this.mapEl = this.outer.querySelector('.map') as HTMLDivElement | null || undefined;

        // Bind DOM controls via MinimapDom helper (extracting DOM responsibility)
        this.domBindings = bindMinimapControls({
            container: this.outer,
            onZoomChanged: (delta: number) => {
                this.zoom(delta);
                this.bus?.publish(Topics.UI.Minimap.ZoomChanged, { delta });
            },
        });
        if (this.bus) {
            this.busSubscriptions.push(
                this.bus.subscribe(Topics.Player.PositionChanged, ({ position }) => {
                    this.busPosition.set(position.x, position.y, position.z);
                    this.update(this.busPosition, undefined);
                }),
            );
            this.busSubscriptions.push(
                this.bus.subscribe(Topics.Player.HeadingChanged, ({ radians }) => {
                    this.busHeading.set(0, radians, 0);
                    this.update(undefined, this.busHeading);
                }),
            );
        }

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
            : createFallbackTexture();
        // Query optional North label inside the target container
        this.headingEl = (this.outer.querySelector('.minimap-heading') as HTMLElement) || undefined;
        if (this.headingEl) {
            // Ensure the label is centered for polar transforms; CSS may already set positions
            this.headingEl.style.left = '50%';
            this.headingEl.style.top = '50%';
            this.headingEl.style.transform = 'translate(-50%, -50%)';
            this.headingEl.style.willChange = 'transform';
            this.headingEl.style.pointerEvents = 'none';
        }
        // Create material without final texture; we'll prepare and assign after renderer is ready
        this.spriteMaterial = new SpriteMaterial({ color: 0xffffff });
        // Track material for cleanup
        this.resources.track(this.spriteMaterial);
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
        this.camera.zoom = 1;
        this.camera.position.set(0, 0, 150);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        // Render with transparent background so HTML can mask the canvas into a circle
        this.renderer.setClearColor(0x000000, 0);
        // Respect device pixel ratio for crisp texturing
        // Note: keep consistent with main app; adjust if performance is a concern
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        snapCircleSize(this.mapEl);
        this.updateRendererSize();
        this.currentSpan = this.dimensions.width || 1;
        this.applyPatchSpan(this.currentSpan);
        // Prepare and assign initial texture now that renderer is ready
        this.applyTexture(baseTexture);

        // Observe canvas size to keep frustum/renderer aspect-correct
        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(() => {
                snapCircleSize(this.mapEl);
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
            this.applyTexture(createFallbackTexture());
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
        this.updateSpriteOffset(undefined);
    }

    private applyPatchSpan(span: number) {
        // Use typed MinimapCamera to compute visible frustum based on aspect and zoom
        const w = this.canvas?.clientWidth || this.dimensions.width || 1;
        const h = this.canvas?.clientHeight || this.dimensions.height || 1;
        const aspect = h > 0 ? (w / h) : 1;
        const params = {
            worldBounds: {
                min: { x: this.dimensions.left, y: this.dimensions.bottom },
                max: { x: this.dimensions.right, y: this.dimensions.top },
            },
            playerPosition: { x: this.currentCenter.x, y: this.currentCenter.z },
            zoom: this.camera.zoom,
            aspect,
            span,
        } as const;
        const frustum = this.miniCam.computeFrustum(params);
        // Compute pre-zoom frustum planes to match previous behavior:
        // old code set planes from span*viewCoverage and relied on camera.zoom for magnification.
        const widthPreZoom = Math.max(10, frustum.span * this.camera.zoom);
        const heightPreZoom = Math.max(10, widthPreZoom / aspect);
        const halfH = widthPreZoom / 2;
        const halfV = heightPreZoom / 2;
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

        /*
        * Rotation issue, but positions are good
        *
        *
        const angle = this.lastHeading - Math.PI / 2; // swapped to +heading to correct horizontal (E/W) inversion; π still excluded for translation
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rx = dx * cos - dz * sin;
        const rz = dx * sin + dz * cos;

        // Move the map opposite to the player's world movement (player stays centered)
        // Try axis-swap variant so that screen X corresponds to world +Z and screen Y to world +X in the rotated frame.
        this.sprite.position.set(rz, -rx, 0);

        * */
        // Keep rotation pivot locked to the player: sprite stays at the origin,
        // and we scroll the texture itself to account for player offset.
        const map = this.spriteMaterial.map;
        if (map) {
            const span = this.currentSpan || this.sprite.scale.x || 1;
            // Sprite/material is rotated; keep UV scrolling independent of heading to avoid drift.
            // E/W was reported inverted, so flip only X. Keep N/S as before.
            map.offset.set(dx / span, -dz / span);
            map.needsUpdate = true;
        }
        this.sprite.position.set(0, 0, 0);
    }

    private applyTexture(srcTexture: Texture) {
        // Derive pixel size for texture preparation
        const img = (srcTexture as Texture).image as { width?: number, height?: number };
        let width = this.canvas?.width || 256;
        let height = this.canvas?.height || 256;
        if (img && typeof img === 'object') {
            if (typeof img.width === 'number' && img.width > 0) width = img.width;
            if (typeof img.height === 'number' && img.height > 0) height = img.height;
        }
        const { texture } = prepareMapTexture({
            renderer: this.renderer,
            size: { width, height },
            sourceData: srcTexture,
            // Request reasonable anisotropy; service will clamp to caps
            anisotropy: 8,
        });

        const previous = this.spriteMaterial.map;
        if (previous && previous !== texture) {
            // Untrack and dispose the old texture explicitly to avoid leaks
            this.resources.untrack(previous);
            try { previous.dispose(); } catch {}
        }

        // Track new texture and assign
        this.resources.track(texture);
        this.spriteMaterial.map = texture;
        this.spriteMaterial.needsUpdate = true;
    }

    update(position?: Vector3, rotation?: Euler) {
        if (rotation) {
            // Use provided yaw heading when movement is negligible
            this.lastHeading = rotation.y;
        }
        // Compute final visual rotation that aligns map North with world North
        this.spriteMaterial.rotation = -this.lastHeading + Math.PI;
        // Ensure camera roll is reset so it doesn't influence screen-aligned sprites
        this.camera.rotation.z = 0;


        // Update North label to orbit around the perimeter, anchored to world North
        if (this.headingEl) {
            const rect = this.outer.getBoundingClientRect();
            const size = Math.min(rect.width, rect.height);
            // Subtract borders/padding so the label sits inside the rim
            const r = Math.max(0, size * 0.5 - 10);
            // Keep label anchored to world North: rotate opposite to the map rotation
            const theta = -this.spriteMaterial.rotation;
            // Place the label on a circle at radius r. Keep text upright for readability.
            this.headingEl.style.transform = `translate(-50%, -50%) rotate(${theta}rad) translate(0, ${-r}px) rotate(${-theta}rad)`;
        }

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

    /**
     * Clean up DOM bindings and observers; can be called by the owner when disposing the minimap.
     */
    destroy() {
        // Unbind DOM events
        if (this.domBindings) {
            this.domBindings.unbind();
            this.domBindings = undefined;
        }
        if (this.busSubscriptions.length) {
            for (const sub of this.busSubscriptions) {
                try {
                    sub.unsubscribe();
                } catch {}
            }
            this.busSubscriptions = [];
        }
        // Stop observing resizes
        if (this.resizeObserver) {
            try { this.resizeObserver.disconnect(); } catch {}
            this.resizeObserver = undefined;
        }
        // Dispose tracked GPU resources (textures, materials, etc.)
        try { this.resources.disposeAll(); } catch {}
        // Explicitly dispose renderer and release its context if possible
        try { this.renderer?.dispose(); } catch {}
        // Null references to help GC in long-lived pages (optional)
        // Keep references eligible for GC by removing scene attachments
        try { this.scene.remove(this.sprite); } catch {}
        // Allow fields to be reclaimed naturally without unsafe casts
    }
}
