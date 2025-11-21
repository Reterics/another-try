/**
 * Event topics used across the app. Keep these as stable string literals to enable
 * strongly-typed payload mapping in the EventBus.
 */

// Flat string literal union for simplicity and easy mapping.
export type Topic =
  | 'Renderer.Frame'
  | 'Renderer.Resized'
  | 'UI.Minimap.ZoomChanged'
  | 'UI.HUD.MapSelected'
  | 'Player.HeadingChanged'
  | 'Player.PositionChanged'
  | 'Creator.PointerClicked'
  | 'Creator.ObjectPlaced'
  | 'Server.Connected'
  | 'Server.ObjectReceived';

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
    HUD: {
      MapSelected: 'UI.HUD.MapSelected' as const,
    },
  },
  Player: {
    HeadingChanged: 'Player.HeadingChanged' as const,
    PositionChanged: 'Player.PositionChanged' as const,
  },
  Creator: {
    PointerClicked: 'Creator.PointerClicked' as const,
    ObjectPlaced: 'Creator.ObjectPlaced' as const,
  },
  Server: {
    Connected: 'Server.Connected' as const,
    ObjectReceived: 'Server.ObjectReceived' as const,
  },
} as const;
