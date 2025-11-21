/**
 * Minimap feature contracts (types only; no behavior).
 *
 * These types describe the data exchanged between the minimap camera math,
 * texture preparation utilities, and DOM bindings. No implementation logic
 * should be added here.
 */

import type { WebGLRenderer, Texture, ColorSpace, PixelFormat, MinificationTextureFilter, MagnificationTextureFilter } from 'three';

export type Vec2 = { x: number; y: number };

/** Axis-aligned world bounds (in world units). */
export interface WorldAABB {
  min: Vec2;
  max: Vec2;
}

/**
 * Parameters required to compute the minimap camera frustum/viewport.
 */
export interface MinimapCameraParams {
  worldBounds: WorldAABB;
  /** Player or focal point position in world space. */
  playerPosition: Vec2;
  /** Zoom level where higher means a more zoomed-in view (project-specific). */
  zoom: number;
  /** Output aspect ratio (width / height). */
  aspect: number;
  /** Optional span in world units to target a fixed width/height depending on aspect. */
  span?: number;
}

/**
 * Minimal description of a computed viewport/frustum for the minimap.
 * The numeric values are expressed in world units.
 */
export interface MinimapFrustum {
  /** Center of the visible patch in world coordinates. */
  center: Vec2;
  /** Width of the visible area in world units (height is width / aspect). */
  span: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Parameters for preparing a texture (or render target) used by the minimap.
 * The function should remain renderer-focused and must not touch DOM.
 */
export interface MinimapTextureParams {
  renderer: WebGLRenderer;
  /** Target texture resolution in pixels. */
  size: { width: number; height: number };
  /** Preferred color space (e.g., SRGBColorSpace). */
  colorSpace?: ColorSpace;
  /** Optional texture filters. */
  minFilter?: MinificationTextureFilter;
  magFilter?: MagnificationTextureFilter;
  /** Optional pixel format (depends on three.js version/capabilities). */
  format?: PixelFormat;
  /** Desired anisotropy; final value should be clamped to renderer.capabilities. */
  anisotropy?: number;
  /** Optional backing data source or render target handle. */
  sourceData?: unknown;
}

/**
 * Result of texture preparation. Typically a three.js Texture instance.
 */
export interface MinimapTextureResult {
  texture: Texture;
}
