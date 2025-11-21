/**
 * RendererFactory — creates and configures a Three.js WebGLRenderer.
 *
 * Responsibilities
 * - Canvas selection or creation and optional DOM attachment.
 * - Initialize pixel ratio with sane clamping.
 * - Initialize renderer size from a container or the window.
 * - Configure color space and tone mapping safely (defensive checks for API differences).
 *
 * Non‑goals
 * - No implicit wiring into main.ts or other systems. This is a utility.
 */

import * as THREE from 'three';

export interface RendererFactoryOptions {
  /** Existing canvas to use. If omitted, a canvas will be created. */
  canvas?: HTMLCanvasElement;
  /** Optional container to size from and to append the canvas into if we create it. */
  container?: HTMLElement;

  // WebGLRenderer parameters
  antialias?: boolean;
  alpha?: boolean;
  powerPreference?: WebGLPowerPreference;
  preserveDrawingBuffer?: boolean;
  failIfMajorPerformanceCaveat?: boolean;

  /**
   * Desired pixel ratio. Defaults to `window.devicePixelRatio`. Final value is clamped by `maxPixelRatio`.
   */
  pixelRatio?: number;
  /** Maximum pixel ratio to avoid excessive GPU load on hi‑DPI displays. Defaults to 2.0. */
  maxPixelRatio?: number;

  /** Explicit initial size. If omitted, derived from `container` (preferred) or `window`. */
  width?: number;
  height?: number;

  /**
   * Renderer color space. Defaults to THREE.SRGBColorSpace when available.
   * Keep customizable in case the project uses a different pipeline.
   */
  outputColorSpace?: THREE.ColorSpace;
  /** Tone mapping operator. Defaults to NoToneMapping to avoid behavior changes. */
  toneMapping?: THREE.ToneMapping;
  /** Exposure for tone mapping. Defaults to 1.0. */
  toneMappingExposure?: number;
}

export interface RendererFactoryResult {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  /** The size applied to the renderer (CSS pixels). */
  width: number;
  height: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Compute initial CSS size for the renderer.
 * - Prefer explicit width/height where provided.
 * - Otherwise derive from container, then canvas parent, then window.
 */
function computeInitialSize(
    canvas: HTMLCanvasElement,
    container: HTMLElement | undefined,
    explicitWidth: number | undefined,
    explicitHeight: number | undefined
): { width: number; height: number } {
    const inBrowser = isBrowser();

    // Helper: get fallback rect from DOM
    const getRect = (): DOMRect | undefined => {
        if (container) return container.getBoundingClientRect();
        if (canvas.parentElement) return canvas.parentElement.getBoundingClientRect();
        if (inBrowser) {
            return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
        }
        return undefined;
    };

    const rect = getRect();

    const defaultWidth = rect?.width ?? 1;
    const defaultHeight = rect?.height ?? 1;

    const width = Math.max(1, Math.floor(explicitWidth ?? defaultWidth));
    const height = Math.max(1, Math.floor(explicitHeight ?? defaultHeight));

    return { width, height };
}

export function createRenderer(options: RendererFactoryOptions = {}): RendererFactoryResult {
    const {
        canvas: providedCanvas,
        container,
        antialias,
        alpha,
        powerPreference,
        preserveDrawingBuffer,
        failIfMajorPerformanceCaveat,
        pixelRatio,
        maxPixelRatio = 2,
        width: explicitWidth,
        height: explicitHeight,
        outputColorSpace = THREE.SRGBColorSpace,
        toneMapping = THREE.NoToneMapping,
        toneMappingExposure = 1,
    } = options;

    const inBrowser = isBrowser();

    if (!inBrowser && !providedCanvas) {
        throw new Error(
            'createRenderer: DOM is not available (SSR), and no canvas was provided. ' +
            'Pass an existing canvas when calling this on the server.'
        );
    }

    // Canvas selection/creation
    const canvas =
        providedCanvas ??
        ((): HTMLCanvasElement => {
            // At this point we know we're in the browser
            const c = document.createElement('canvas');
            if (container) {
                container.appendChild(c);
            }
            return c;
        })();

    // Instantiate renderer
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias,
        alpha,
        powerPreference,
        preserveDrawingBuffer,
        failIfMajorPerformanceCaveat,
    });

    // Color space (latest Three.js API)
    renderer.outputColorSpace = outputColorSpace;

    // Tone mapping & exposure (latest Three.js API)
    renderer.toneMapping = toneMapping;
    renderer.toneMappingExposure = toneMappingExposure;

    // Pixel ratio
    const devicePixelRatio =
        (inBrowser && window.devicePixelRatio) || 1;

    const maxPR = Math.max(1, maxPixelRatio);
    const targetPixelRatio = clamp(pixelRatio ?? devicePixelRatio, 1, maxPR);
    renderer.setPixelRatio(targetPixelRatio);

    // Initial size
    const { width, height } = computeInitialSize(
        canvas,
        container,
        explicitWidth,
        explicitHeight
    );
    renderer.setSize(width, height, false);

    return { renderer, canvas, width, height };
}

export default createRenderer;
