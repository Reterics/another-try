/**
 * ResourceTracker
 *
 * Minimal utility to track and dispose Three.js-like resources.
 * - Tracks by broad categories (geometries, materials, textures) when identifiable.
 * - Falls back to a generic disposables set for any object exposing a dispose(): void method.
 * - Does not auto-wire anywhere; intended to be instantiated and used by systems that create resources.
 *
 * Notes:
 * - We avoid importing Three.js types to keep this utility version-agnostic and not tied to a specific three build.
 * - Detection relies on the common `is*` flags used by Three.js objects (e.g., isTexture, isMaterial, isBufferGeometry)
 *   and presence of a callable `dispose` method.
 */

export type Disposable = { dispose: () => void };

function hasFlag(obj: unknown, flag: string): boolean {
  return !!obj && typeof obj === 'object' && (obj as Record<string, unknown>)[flag] === true;
}

function hasDispose(obj: unknown): obj is Disposable {
  return !!obj && typeof (obj as Record<string, unknown>).dispose === 'function';
}

export class ResourceTracker {
  private geometries = new Set<object>();
  private materials = new Set<object>();
  private textures = new Set<object>();
  private disposables = new Set<Disposable>();

  /**
   * Track a resource and return it for convenient chaining.
   */
  track<T extends object>(resource: T): T {
    if (!resource) return resource;

    // Category detection (non-exclusive; an item may land in multiple sets).
    if (hasFlag(resource, 'isBufferGeometry') || hasFlag(resource, 'isGeometry')) {
      this.geometries.add(resource);
    }
    if (hasFlag(resource, 'isMaterial')) {
      this.materials.add(resource);
    }
    if (hasFlag(resource, 'isTexture')) {
      this.textures.add(resource);
    }
    if (hasDispose(resource)) {
      this.disposables.add(resource);
    }

    // Some render targets expose different flags depending on three.js version
    if (
      hasFlag(resource, 'isWebGLRenderTarget') ||
      hasFlag(resource, 'isRenderTarget') ||
      hasFlag(resource, 'isFramebufferTexture')
    ) {
      // Treat render targets as textures + generic disposables for safety
      this.textures.add(resource);
      if (hasDispose(resource)) this.disposables.add(resource);
    }

    return resource;
  }

  /**
   * Remove a resource from tracking sets.
   */
  untrack<T extends object>(resource: T): void {
    if (!resource) return;
    this.geometries.delete(resource);
    this.materials.delete(resource);
    this.textures.delete(resource);
    if (hasDispose(resource)) {
      this.disposables.delete(resource);
    }
  }

  /**
   * Dispose all tracked resources and clear the tracker.
   * Ensures each resource's dispose is invoked at most once.
   */
  disposeAll(): void {
    const uniqueToDispose = new Set<Disposable>();

    // Gather disposables from known categories
    for (const g of this.geometries) if (hasDispose(g)) uniqueToDispose.add(g);
    for (const m of this.materials) if (hasDispose(m)) uniqueToDispose.add(m);
    for (const t of this.textures) if (hasDispose(t)) uniqueToDispose.add(t);

    // Plus any explicitly tracked disposables
    for (const d of this.disposables) uniqueToDispose.add(d);

    // Dispose safely
    for (const item of uniqueToDispose) {
      try {
        item.dispose();
      } catch (err) {
        // Swallow errors to avoid cascading failures during teardown
        // Consider logging if a logging system is available in the host app
      }
    }

    // Clear all sets
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
    this.disposables.clear();
  }
}

export default ResourceTracker;
