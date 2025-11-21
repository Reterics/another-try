/**
 * Minimal, synchronous, typed Event Bus.
 * - Topics are defined in `topics.ts`
 * - Payload contracts are defined in `contracts.ts`
 *
 * The API is intentionally tiny: subscribe, publish, unsubscribe.
 */
import type { Topic } from './topics';
import type { Handler, Payload } from './contracts';

export interface Subscription {
  unsubscribe(): void;
}

export class EventBus {
  private listeners: Map<Topic, Set<Function>> = new Map();

  /**
   * Subscribe to a topic with a strongly-typed handler. Returns a subscription
   * handle that can be used to unsubscribe.
   */
  subscribe<TTopic extends Topic>(topic: TTopic, handler: Handler<TTopic>): Subscription {
    let set = this.listeners.get(topic);
    if (!set) {
      set = new Set();
      this.listeners.set(topic, set);
    }
    set.add(handler as unknown as Function);

    let active = true;
    return {
      unsubscribe: () => {
        if (!active) return;
        active = false;
        const s = this.listeners.get(topic);
        s?.delete(handler as unknown as Function);
        if (s && s.size === 0) {
          this.listeners.delete(topic);
        }
      },
    };
  }

  /**
   * Publish a payload for a given topic. All handlers for the topic will be
   * invoked synchronously in the order of subscription.
   */
  publish<TTopic extends Topic>(topic: TTopic, payload: Payload<TTopic>): void {
    const set = this.listeners.get(topic);
    if (!set || set.size === 0) return;

    // Snapshot to avoid issues if handlers unsubscribe during dispatch.
    const handlers = Array.from(set) as Array<Handler<TTopic>>;
    for (const h of handlers) {
      // Invoke synchronously; exceptions are not caught here by design.
      h(payload);
    }
  }

  /** Remove all listeners (useful for teardown in dev tools/hot reload). */
  clearAll(): void {
    this.listeners.clear();
  }
}

export default EventBus;
