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
import type { Active3DMode, ObjectPositionMessage, ATMap } from '../types';

export type VideoSettingsPayload = {
  lod: 'low' | 'medium' | 'high';
  textureQuality: 'low' | 'medium' | 'high';
  postfx: 'off' | 'medium' | 'high';
  maxFps: number;
};

/**
 * Payload contracts per topic. Add new topics and their payloads here to
 * automatically get end-to-end typing across subscribers and publishers.
 */
export interface PayloadByTopic {
  'Renderer.Frame': { dt: number };
  'Renderer.Resized': { width: number; height: number };
  'UI.Minimap.ZoomChanged': { delta: number };
  'UI.HUD.MapSelected': { map: ATMap };
  'UI.SettingsApplied': { settings: VideoSettingsPayload };
  'UI.Dialog': { visible: boolean; title?: string; body?: string; bodyHtml?: string };
  'UI.SettingsChanged': { settings: Partial<VideoSettingsPayload>; changed?: keyof VideoSettingsPayload };
  'UI.MenuAction': { action: string; detail?: unknown };
  'Player.HeadingChanged': { radians: number };
  'Player.PositionChanged': { position: { x: number; y: number; z: number } };
  'Player.HealthChanged': { current: number; max: number; regenRate?: number };
  'Player.StaminaChanged': { current: number; max: number; regenRate?: number };
  'Player.NameChanged': { name: string };
  'Player.LevelChanged': { level: string };
  'Player.CurrencyChanged': { gold: number };
  'Player.InventoryUpdated': { items: unknown[] };
  'Creator.PointerClicked': { mode: Active3DMode };
  'Creator.ObjectPlaced': { message: ObjectPositionMessage };
  'Server.Connected': {};
  'Server.ObjectReceived': { message: ObjectPositionMessage };
  'Game.StateChanged': { state: 'playing' | 'paused' | 'menu' };
  'HUD.ToolChanged': { active: string };
  'HUD.DebugInfo': { lines: string[] };
  'Chat.MessageReceived': { text: string; author?: string; status?: 'pending' | 'sent'; html?: string };
  'Chat.StateChanged': { text: string; cursor: number; active: boolean };
  'Menu.MapsUpdated': { maps: ATMap[] };
  'Menu.SaveUpdated': { hasSave: boolean; saveInfo?: { name?: string; date?: string; mapId?: string; coords?: unknown } | null };
}

export type Payload<TTopic extends Topic> = PayloadByTopic[TTopic];

export type Handler<TTopic extends Topic> = (payload: Payload<TTopic>) => void;
