/**
 * @game/ui - Game UI package powered by Preact + Signals
 */
import { render } from 'preact';
import { EventBus, type Subscription } from '@game/shared';
import { App } from './app';
import { bindEventBusToStore } from './store/eventbus-bindings';
import { GameUIBridge } from './bridge/GameUIBridge';
import './styles/index.css';

// Re-export store for external access if needed
export * as store from './store';
export { GameUIBridge } from './bridge/GameUIBridge';
export type { SavedGameData } from './bridge/GameUIBridge';

export interface GameUI {
  /**
   * Clean up the UI and remove all listeners
   */
  destroy(): void;

  /**
   * Show the UI (make visible)
   */
  show(): void;

  /**
   * Hide the UI (make invisible)
   */
  hide(): void;

  /**
   * Get the root element
   */
  getRoot(): HTMLElement;

  /**
   * Get the bridge for HUDController integration
   */
  getBridge(): GameUIBridge;
}

/**
 * Creates and initializes the game UI
 * @param eventBus - EventBus instance for game ↔ UI communication
 * @param rootElement - DOM element to mount the UI into
 * @returns GameUI control interface
 */
export function createGameUI(eventBus: EventBus, rootElement: HTMLElement): GameUI {
  let subscriptions: Subscription[] = [];
  let isDestroyed = false;

  // Create bridge for HUDController integration
  const bridge = new GameUIBridge(eventBus);

  // Initialize UI state from game data and localStorage
  bridge.initialize();

  // Bind EventBus to store signals
  subscriptions = bindEventBusToStore(eventBus);

  // Render Preact app
  render(<App />, rootElement);

  // Create control interface
  const gameUI: GameUI = {
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;

      // Unsubscribe from all EventBus topics
      subscriptions.forEach((sub) => sub.unsubscribe());
      subscriptions = [];

      // Unmount Preact app
      render(null, rootElement);
    },

    show() {
      rootElement.style.display = '';
    },

    hide() {
      rootElement.style.display = 'none';
    },

    getRoot() {
      return rootElement;
    },

    getBridge() {
      return bridge;
    },
  };

  return gameUI;
}

// Default export
export default createGameUI;
