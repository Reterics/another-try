/**
 * MinimapCamera contracts and minimal stubs.
 *
 * Purpose: define the public surface for minimap camera math without wiring it
 * into the app. Implementations here are intentionally simple and may be
 * replaced by the real math in a later checklist item.
 */

import type { MinimapCameraParams, MinimapFrustum, Vec2 } from './types';

/** Public API for a minimap camera helper. */
export interface MinimapCamera {
  /** Update the desired span (width in world units). */
  setSpan(span: number): void;
  /** Read the currently configured span. */
  getSpan(): number;
  /** Compute the visible frustum/viewport for given inputs. Pure operation. */
  computeFrustum(params: MinimapCameraParams): MinimapFrustum;
}

/**
 * Create a simple, stateful camera helper. The implementation here is a
 * placeholder to support typing and future integration. The math will be
 * refined in a subsequent task.
 */
export function createMinimapCamera(initialSpan = 10): MinimapCamera {
  let span = Math.max(0.000001, initialSpan);

  function computeFrustum(params: MinimapCameraParams): MinimapFrustum {
    // Match controller logic:
    // - camera frustum is derived from a fraction of desired span (viewCoverage)
    // - orthographic zoom reduces visible world extents by factor `zoom`
    // - aspect = width / height
    const EPS = 0.000001;
    const zoom = Math.max(EPS, params.zoom);
    const aspect = Math.max(EPS, params.aspect);
    const baseSpan = Math.max(EPS, params.span ?? span);
    const viewCoverage = 0.4; // must mirror MinimapController.viewCoverage

    // Visible height in world units at current zoom (vertical coverage of the camera)
    const visibleHeight = (baseSpan * viewCoverage) / zoom;
    const visibleWidth = visibleHeight * aspect;

    const center: Vec2 = params.playerPosition;

    return {
      center,
      span: visibleWidth,
      left: center.x - visibleWidth / 2,
      right: center.x + visibleWidth / 2,
      bottom: center.y - visibleHeight / 2,
      top: center.y + visibleHeight / 2,
    };
  }

  return {
    setSpan(next: number) {
      span = Math.max(0.000001, next);
    },
    getSpan() {
      return span;
    },
    computeFrustum,
  };
}
