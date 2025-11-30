/**
 * ResizeSystem — keeps renderer (and optional camera) in sync with container/window size.
 *
 * Responsibilities
 * - Observe size changes via ResizeObserver when a container is provided,
 *   otherwise listen to window "resize" events.
 * - Update renderer size accordingly.
 * - Update camera aspect for PerspectiveCamera (if provided).
 * - Publish Renderer.Resized via the typed EventBus (if provided).
 *
 * Non‑goals
 * - No implicit wiring to app entry; this is a standalone utility.
 */

import * as THREE from 'three';
import { Topics, type EventBus } from '@game/shared';

export interface ResizeSystemOptions {
  renderer: THREE.WebGLRenderer;
  /** Optional camera; if perspective, its aspect will be updated. */
  camera?: THREE.Camera;
  /** Container element to measure. If omitted, falls back to window size. */
  container?: HTMLElement | null;
  /** Optional typed EventBus to publish Renderer.Resized. */
  eventBus?: EventBus;
}

function isPerspectiveCamera(cam: unknown): cam is THREE.PerspectiveCamera {
  return !!cam && typeof cam === 'object' && (cam as { isPerspectiveCamera?: boolean }).isPerspectiveCamera === true;
}

export class ResizeSystem {
  private renderer: THREE.WebGLRenderer;
  private camera?: THREE.Camera;
  private container?: HTMLElement | null;
  private bus?: EventBus;

  private ro?: ResizeObserver;
  private onWinResize?: () => void;
  private running = false;

  constructor(opts: ResizeSystemOptions) {
    this.renderer = opts.renderer;
    this.camera = opts.camera;
    this.container = opts.container ?? undefined;
    this.bus = opts.eventBus;
  }

  /** Manually compute and apply size based on container/window. */
  update(): void {
    const size = this.measure();
    this.apply(size.width, size.height);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    if (this.container && typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.update());
      this.ro.observe(this.container);
      // Initial sync
      this.update();
    } else {
      const handler = () => this.update();
      this.onWinResize = handler;
      window.addEventListener('resize', handler);
      // Initial sync
      this.update();
    }
  }

  stop(): void {
    this.running = false;
    if (this.ro && this.container) {
      try { this.ro.unobserve(this.container); } catch {}
      try { this.ro.disconnect(); } catch {}
      this.ro = undefined;
    }
    if (this.onWinResize) {
      window.removeEventListener('resize', this.onWinResize);
      this.onWinResize = undefined;
    }
  }

  private measure(): { width: number; height: number } {
    let width = 1;
    let height = 1;
    if (this.container) {
      const rect = this.container.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
    } else {
      const de = document.documentElement;
      const w = Math.max(1, Math.floor(de?.clientWidth || window.innerWidth));
      const h = Math.max(1, Math.floor(de?.clientHeight || window.innerHeight));
      width = w;
      height = h;
    }
    return { width, height };
  }

  private apply(width: number, height: number): void {
    // Update renderer (also apply CSS size so canvas matches layout in CSS pixels)
    this.renderer.setSize(width, height, true);

    // Update camera aspect for perspective cameras only (safe default)
    const cam = this.camera;
    if (isPerspectiveCamera(cam)) {
      cam.aspect = width / Math.max(1, height);
      cam.updateProjectionMatrix();
    }

    // Publish event
    if (this.bus) {
      this.bus.publish(Topics.Renderer.Resized, { width, height });
    }
  }
}

export default ResizeSystem;
