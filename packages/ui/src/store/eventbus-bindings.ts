/**
 * EventBus bindings - wires game events to UI signals
 */
import { EventBus, Topics, type Subscription } from '@game/shared';
import * as playerStore from './player';
import * as gameStore from './game';
import * as uiStore from './ui';
import * as menuStore from './menu';
import * as messageStore from './messages';

/**
 * Sets up all EventBus listeners to update UI signals
 * Returns array of subscriptions for cleanup
 */
export function bindEventBusToStore(eventBus: EventBus): Subscription[] {
  const subscriptions: Subscription[] = [];

  // Player health updates
  subscriptions.push(
    eventBus.subscribe(Topics.Player.HealthChanged, ({ current, max, regenRate }) => {
      playerStore.healthCurrent.value = current;
      playerStore.healthMax.value = max;
      if (regenRate !== undefined) {
        playerStore.healthRegenRate.value = regenRate;
      }
    })
  );

  // Player stamina updates
  subscriptions.push(
    eventBus.subscribe(Topics.Player.StaminaChanged, ({ current, max, regenRate }) => {
      playerStore.staminaCurrent.value = current;
      playerStore.staminaMax.value = max;
      if (regenRate !== undefined) {
        playerStore.staminaRegenRate.value = regenRate;
      }
    })
  );

  // Player name and level
  subscriptions.push(
    eventBus.subscribe(Topics.Player.NameChanged, ({ name }) => {
      playerStore.playerName.value = name;
    })
  );

  subscriptions.push(
    eventBus.subscribe(Topics.Player.LevelChanged, ({ level }) => {
      playerStore.playerLevel.value = level;
    })
  );

  // Player position
  subscriptions.push(
    eventBus.subscribe(Topics.Player.PositionChanged, ({ position }) => {
      playerStore.playerPosition.value = position;
    })
  );

  // Player heading
  subscriptions.push(
    eventBus.subscribe(Topics.Player.HeadingChanged, ({ radians }) => {
      playerStore.playerHeading.value = radians;
    })
  );

  // Minimap zoom
  subscriptions.push(
    eventBus.subscribe(Topics.UI.Minimap.ZoomChanged, ({ delta }) => {
      uiStore.minimapZoom.value = Math.max(0.6, Math.min(3.0, uiStore.minimapZoom.value + delta));
    })
  );

  // Game state changes
  subscriptions.push(
    eventBus.subscribe(Topics.Game.StateChanged, ({ state }) => {
      gameStore.gameState.value = state;

      // Update HUD visibility based on game state
      if (state === 'playing') {
        uiStore.showHUD.value = true;
        uiStore.showMainMenu.value = false;
      } else if (state === 'menu') {
        uiStore.showHUD.value = false;
        uiStore.showMainMenu.value = true;
      } else if (state === 'paused') {
        uiStore.showMainMenu.value = true;
      }
    })
  );

  // Currency updates
  subscriptions.push(
    eventBus.subscribe(Topics.Player.CurrencyChanged, ({ gold }) => {
      playerStore.playerGold.value = gold;
    })
  );

  // Inventory updates
  subscriptions.push(
    eventBus.subscribe(Topics.Player.InventoryUpdated, ({ items }) => {
      playerStore.playerInventory.value = items;
    })
  );

  // Menu: Available maps
  subscriptions.push(
    eventBus.subscribe(Topics.Menu.MapsUpdated, ({ maps }) => {
      menuStore.availableMaps.value = maps || [];
    })
  );

  // Menu: Saved game info
  subscriptions.push(
    eventBus.subscribe(Topics.Menu.SaveUpdated, ({ hasSave, saveInfo }) => {
      menuStore.hasSavedGame.value = hasSave;
      // @ts-ignore
        menuStore.savedGameInfo.value = saveInfo || null;
    })
  );

  // Messages: New message received
  subscriptions.push(
    eventBus.subscribe(Topics.Chat.MessageReceived, ({ text, author, status, html }) => {
      messageStore.addMessage(text, author, status ?? 'sent', html);
    })
  );

  // Chat input state (typing/toggle)
  subscriptions.push(
    eventBus.subscribe(Topics.Chat.StateChanged, (payload) => {
      const text = typeof payload.text === 'string' ? payload.text : messageStore.messageInput.value;
      const cursor = typeof payload.cursor === 'number' ? payload.cursor : messageStore.cursorPosition.value;
      const active = typeof payload.active === 'boolean' ? payload.active : messageStore.isChatActive.value;
      messageStore.setChatState(text, cursor, active);
    })
  );

  // HUD toolbar selection
  subscriptions.push(
    eventBus.subscribe(Topics.HUD.ToolChanged, ({ active }) => {
      if (active) {
        uiStore.activeTool.value = active as uiStore.ActiveTool;
      }
    })
  );

  // Debug info (lines array)
  subscriptions.push(
    eventBus.subscribe(Topics.HUD.DebugInfo, ({ lines }) => {
      gameStore.debugLines.value = lines ?? [];
    })
  );

  // FPS updates for debug panel
  subscriptions.push(
    eventBus.subscribe(Topics.Renderer.Frame, ({ dt }) => {
      const fps = dt > 0 ? 1 / dt : 0;
      gameStore.fps.value = fps;
    })
  );

  // Generic dialog overlay (shown/hidden via EventBus)
  subscriptions.push(
    eventBus.subscribe(Topics.UI.Dialog, ({ visible, title, body, bodyHtml }) => {
      uiStore.dialogVisible.value = visible;
      if (title !== undefined) uiStore.dialogTitle.value = title;
      if (body !== undefined) uiStore.dialogBody.value = body;
      if (bodyHtml !== undefined) uiStore.dialogBodyHtml.value = bodyHtml;
      if (!visible) {
        uiStore.dialogBody.value = '';
        uiStore.dialogBodyHtml.value = '';
      }
    })
  );

  return subscriptions;
}
