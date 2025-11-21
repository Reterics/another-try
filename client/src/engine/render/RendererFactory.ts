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

export function createRenderer(options: RendererFactoryOptions = {}): RendererFactoryResult {
  const {
    canvas: providedCanvas,
    container,
    antialias,
    alpha,
    powerPreference,
    preserveDrawingBuffer,
    failIfMajorPerformanceCaveat,
    maxPixelRatio = 2,
    width: providedWidth,
    height: providedHeight,
    outputColorSpace,
    toneMapping = THREE.NoToneMapping,
    toneMappingExposure = 1,
  } = options;

  // Canvas selection/creation
  const canvas = providedCanvas ?? document.createElement('canvas');
  if (!providedCanvas && container) {
    // Non‑destructive: append only when container is explicitly given.
    container.appendChild(canvas);
  }

  // Instantiate renderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias,
    alpha,
    powerPreference,
    preserveDrawingBuffer,
    failIfMajorPerformanceCaveat,
  });

  // Color space (r152+). Guard at runtime for older versions.
  if ('outputColorSpace' in renderer) {
    (renderer as any).outputColorSpace = outputColorSpace ?? THREE.SRGBColorSpace;
  }

  // Tone mapping & exposure
  if ('toneMapping' in renderer) {
    renderer.toneMapping = toneMapping;
  }
  if ('toneMappingExposure' in (renderer as any)) {
    (renderer as any).toneMappingExposure = toneMappingExposure;
  } else if ('exposure' in (renderer as any)) {
    (renderer as any).exposure = toneMappingExposure;
  }

  // Pixel ratio
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const targetPR = clamp(options.pixelRatio ?? dpr, 1, Math.max(1, maxPixelRatio));
  renderer.setPixelRatio(targetPR);

  // Initial size
  let width = 0;
  let height = 0;
  if (typeof providedWidth === 'number' && typeof providedHeight === 'number') {
    width = Math.max(1, Math.floor(providedWidth));
    height = Math.max(1, Math.floor(providedHeight));
  } else if (container) {
    const rect = container.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
  } else if (canvas.parentElement) {
    const rect = canvas.parentElement.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
  } else if (typeof window !== 'undefined') {
    width = Math.max(1, Math.floor(window.innerWidth));
    height = Math.max(1, Math.floor(window.innerHeight));
  } else {
    width = 1;
    height = 1;
  }

  renderer.setSize(width, height, false);

  return { renderer, canvas, width, height };
}

export default createRenderer;
