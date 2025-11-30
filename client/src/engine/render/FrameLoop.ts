/**
 * FrameLoop — central requestAnimationFrame owner.
 *
 * Responsibilities:
 * - Run a single RAF loop.
 * - Compute dt (seconds) and total elapsed time (seconds).
 * - Notify local subscribers via onFrame callbacks.
 * - Optionally publish Renderer.Frame via the typed EventBus when one is provided.
 *
 * Notes:
 * - This module is intentionally simple and synchronous.
 * - It does not wire itself into the app; external code may pass an EventBus instance
 *   via setEventBus(). Until then, it functions as a standalone loop.
 */

import { Topics, type EventBus } from '@game/shared';

export type FrameCallback = (dt: number, elapsed: number) => void;
export type Unsubscribe = () => void;

class FrameLoopImpl {
  private rafId: number | null = null;
  private running = false;

  private lastDispatchTimeMs: number | null = null; // last time we invoked callbacks
  // Track current session start time and total accumulated elapsed across sessions to preserve continuity.
  private sessionStartMs: number | null = null;
  private accumulatedElapsedMs = 0;

  private minFrameIntervalMs = 0; // 0 = no limit (native RAF)
  private subscribers: Set<FrameCallback> = new Set();

  // Optional EventBus to publish Renderer.Frame events.
  private bus: EventBus | undefined;

  setEventBus(bus?: EventBus): void {
    this.bus = bus;
  }

  setMaxFPS(fps?: number): void {
    if (!fps || fps <= 0 || !Number.isFinite(fps)) {
      this.minFrameIntervalMs = 0;
      return;
    }
    this.minFrameIntervalMs = 1000 / fps;
  }

  onFrame(cb: FrameCallback): Unsubscribe {
    this.subscribers.add(cb);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.subscribers.delete(cb);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Do NOT reset accumulatedElapsedMs here — we want continuity across resumes.
    this.lastDispatchTimeMs = null;
    // Defer sessionStartMs initialization to the first tick, using accumulated offset.
    this.sessionStartMs = null;

    const tick = (nowMs: number) => {
      if (!this.running) return;

      if (this.sessionStartMs === null) {
        // Preserve elapsed continuity across pauses by offsetting start by accumulated time
        this.sessionStartMs = nowMs - this.accumulatedElapsedMs;
      }

      // FPS limiting: only dispatch if enough time has passed since the last dispatch.
      if (
        this.minFrameIntervalMs > 0 &&
        this.lastDispatchTimeMs !== null &&
        nowMs - this.lastDispatchTimeMs < this.minFrameIntervalMs
      ) {
        this.rafId = requestAnimationFrame(tick);
        return;
      }

      const prev = this.lastDispatchTimeMs ?? nowMs;
      const dtSec = Math.max(0, (nowMs - prev) / 1000);
      // Elapsed time since first start across sessions (in seconds)
      const elapsed = this.sessionStartMs !== null ? (nowMs - this.sessionStartMs) / 1000 : this.accumulatedElapsedMs / 1000;

      this.lastDispatchTimeMs = nowMs;

      // Notify local subscribers first.
      if (this.subscribers.size > 0) {
        // Snapshot to avoid mutation during iteration
        const handlers = Array.from(this.subscribers);
        for (const h of handlers) {
          h(dtSec, elapsed);
        }
      }

      // Optionally publish Renderer.Frame via typed EventBus.
      if (this.bus) {
        this.bus.publish(Topics.Renderer.Frame, { dt: dtSec });
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    // Accumulate elapsed up to the last dispatched frame to preserve continuity
    if (this.sessionStartMs !== null) {
      const endMs = this.lastDispatchTimeMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (endMs >= this.sessionStartMs) {
        this.accumulatedElapsedMs = Math.max(0, endMs - this.sessionStartMs);
      }
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // Clear session markers; keep accumulatedElapsedMs
    this.sessionStartMs = null;
    this.lastDispatchTimeMs = null;
  }
}

export const FrameLoop = new FrameLoopImpl();

export default FrameLoop;
