/**
 * MinimapTextureService contracts and implementation for preparing
 * a texture (or render target texture) suitable for the minimap.
 *
 * Responsibility: keep it renderer/data focused and avoid DOM access.
 *
 * Notes:
 * - Honor renderer capabilities (e.g., anisotropy limits).
 * - Prefer SRGBColorSpace for UI/texture content when appropriate.
 * - Support using an existing Texture or RenderTarget from params.sourceData.
 */

import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  WebGLRenderTarget,
  CanvasTexture,
} from 'three';
import type { MinimapTextureParams, MinimapTextureResult } from './types';

function isPowerOfTwo(n: number): boolean {
  return (n & (n - 1)) === 0 && n !== 0;
}

/**
 * Prepare a texture for the minimap.
 *
 * Responsibilities:
 * - choose appropriate colorSpace (e.g., SRGBColorSpace),
 * - set filtering and mipmap policy according to usage and POT/NPOT rules,
 * - clamp anisotropy to renderer capabilities,
 * - flag `needsUpdate` where applicable,
 * - optionally support render targets and raw data sources.
 */
export function prepareMapTexture(params: MinimapTextureParams): MinimapTextureResult {
  const { renderer, size } = params;

  // 1) Decide the base texture to operate on
  let texture: Texture;

  // If an existing Texture is provided, use it directly
  if (params.sourceData instanceof Texture) {
    texture = params.sourceData as Texture;
  }
  // If a render target is provided, use its texture
  else if (params.sourceData instanceof WebGLRenderTarget) {
    texture = (params.sourceData as WebGLRenderTarget).texture;
  }
  // If raw pixel data is provided, create a DataTexture
  else if (ArrayBuffer.isView(params.sourceData)) {
    const data = params.sourceData as ArrayBufferView;
    // Assume 4 channels if format not specified; this is safe for UI-like maps
    const channels = 4;
    const expected = size.width * size.height * channels;
    if (data.byteLength !== expected) {
      // Length mismatch; still construct but let Three.js handle/throw if improper
      // This branch avoids throwing here to keep service tolerant.
    }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data.buffer);
    texture = new DataTexture(bytes, size.width, size.height);
  } else {
    // Default to an empty DataTexture with RGBA8 layout
    texture = new DataTexture(new Uint8Array(size.width * size.height * 4), size.width, size.height);
  }

  // 2) Color space (Three r181 uses colorSpace)
  const colorSpace = params.colorSpace ?? SRGBColorSpace;
  (texture as Texture).colorSpace = colorSpace;

  // 3) Filters and mipmaps
  const isPOT = isPowerOfTwo(size.width) && isPowerOfTwo(size.height);

  const defaultMin = isPOT ? LinearMipmapLinearFilter : LinearFilter;
  const defaultMag = LinearFilter;

  texture.minFilter = params.minFilter ?? defaultMin;
  texture.magFilter = params.magFilter ?? defaultMag;

  // NPOT textures must use ClampToEdge and cannot use mipmaps in WebGL1; keep rules simple
  // If minFilter requests mipmaps on NPOT, downgrade to LinearFilter
  const usesMipmaps =
    texture.minFilter === LinearMipmapLinearFilter ||
    // Note: other mipmap filters exist; keep conservative to avoid extra imports
    false;
  if (!isPOT && usesMipmaps) {
    texture.minFilter = LinearFilter;
  }

  // 4) Wrap modes - Use Repeat so UV offset scrolling can pan the map continuously
  // Note: WebGL1 requires POT textures for repeat; our assets and fallback are POT by default.
  // If a NPOT texture is supplied in WebGL1, Three.js will internally clamp; scrolling will still work within bounds.
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;

  // 5) Anisotropy (only meaningful when mipmaps / minification occur)
  const caps = renderer.capabilities as { getMaxAnisotropy?: () => number };
  const maxAniso = typeof caps.getMaxAnisotropy === 'function' ? caps.getMaxAnisotropy() : 1;
  const requestedAniso = Math.max(1, Math.floor(params.anisotropy ?? 1));
  texture.anisotropy = Math.min(requestedAniso, maxAniso);

  // 6) Format if requested
  if (params.format !== undefined) {
    texture.format = params.format;
  }

  // 7) Mipmap generation flag
  const wantsMipmaps = isPOT && texture.minFilter !== NearestFilter;
  texture.generateMipmaps = wantsMipmaps;

  // 8) Finalize
  texture.needsUpdate = true;

  return { texture };
}

/** Create a simple fallback grid texture for the minimap. */
export function createFallbackTexture(size = 256): Texture {
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
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
