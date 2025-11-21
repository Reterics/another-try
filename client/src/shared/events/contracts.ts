/**
 * Event payload contracts for the typed EventBus.
 *
 * Purpose:
 * - Provide a single mapping from topic string literals to payload shapes.
 * - Enable end-to-end typing for `publish` and `subscribe` without `any` leaks.
 *
 * Key dependencies:
 * - Relies on topic names defined in `topics.ts`.
 */
import type { Topic } from './topics';

/**
 * Payload contracts per topic. Add new topics and their payloads here to
 * automatically get end-to-end typing across subscribers and publishers.
 */
export interface PayloadByTopic {
  'Renderer.Frame': { dt: number };
  'Renderer.Resized': { width: number; height: number };
  'UI.Minimap.ZoomChanged': { delta: number };
  'Player.HeadingChanged': { radians: number };
}

export type Payload<TTopic extends Topic> = PayloadByTopic[TTopic];

export type Handler<TTopic extends Topic> = (payload: Payload<TTopic>) => void;
