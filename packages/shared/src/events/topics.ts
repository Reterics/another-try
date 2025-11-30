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
  | 'UI.SettingsApplied'
  | 'UI.Dialog'
  | 'Player.HeadingChanged'
  | 'Player.PositionChanged'
  | 'Player.HealthChanged'
  | 'Player.StaminaChanged'
  | 'Player.NameChanged'
  | 'Player.LevelChanged'
  | 'Player.CurrencyChanged'
  | 'Player.InventoryUpdated'
  | 'Creator.PointerClicked'
  | 'Creator.ObjectPlaced'
  | 'Server.Connected'
  | 'Server.ObjectReceived'
  | 'Game.StateChanged'
  | 'HUD.ToolChanged'
  | 'HUD.DebugInfo'
  | 'Chat.MessageReceived'
  | 'Chat.StateChanged'
  | 'Menu.MapsUpdated'
  | 'Menu.SaveUpdated'
  | 'UI.SettingsChanged'
  | 'UI.MenuAction';

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
    SettingsApplied: 'UI.SettingsApplied' as const,
    Dialog: 'UI.Dialog' as const,
    SettingsChanged: 'UI.SettingsChanged' as const,
    MenuAction: 'UI.MenuAction' as const,
  },
  Player: {
    HeadingChanged: 'Player.HeadingChanged' as const,
    PositionChanged: 'Player.PositionChanged' as const,
    HealthChanged: 'Player.HealthChanged' as const,
    StaminaChanged: 'Player.StaminaChanged' as const,
    NameChanged: 'Player.NameChanged' as const,
    LevelChanged: 'Player.LevelChanged' as const,
    CurrencyChanged: 'Player.CurrencyChanged' as const,
    InventoryUpdated: 'Player.InventoryUpdated' as const,
  },
  Creator: {
    PointerClicked: 'Creator.PointerClicked' as const,
    ObjectPlaced: 'Creator.ObjectPlaced' as const,
  },
  Server: {
    Connected: 'Server.Connected' as const,
    ObjectReceived: 'Server.ObjectReceived' as const,
  },
  Game: {
    StateChanged: 'Game.StateChanged' as const,
  },
  HUD: {
    ToolChanged: 'HUD.ToolChanged' as const,
    DebugInfo: 'HUD.DebugInfo' as const,
  },
  Chat: {
    MessageReceived: 'Chat.MessageReceived' as const,
    StateChanged: 'Chat.StateChanged' as const,
  },
  Menu: {
    MapsUpdated: 'Menu.MapsUpdated' as const,
    SaveUpdated: 'Menu.SaveUpdated' as const,
  },
} as const;
