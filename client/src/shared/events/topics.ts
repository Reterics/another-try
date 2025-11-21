/**
 * Event topics used across the app. Keep these as stable string literals to enable
 * strongly-typed payload mapping in the EventBus.
 */

// Flat string literal union for simplicity and easy mapping.
export type Topic =
  | 'Renderer.Frame'
  | 'Renderer.Resized'
  | 'UI.Minimap.ZoomChanged'
  | 'Player.HeadingChanged';

// Optional grouped constants for discoverability in IDEs.
export const Topics = {
  Renderer: {
    Frame: 'Renderer.Frame' as const,
    Resized: 'Renderer.Resized' as const,
  },
  UI: {
    Minimap: {
      ZoomChanged: 'UI.Minimap.ZoomChanged' as const,
    },
  },
  Player: {
    HeadingChanged: 'Player.HeadingChanged' as const,
  },
} as const;
