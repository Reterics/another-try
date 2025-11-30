/**
 * Root Preact component for the game UI
 */
import { showMainMenu } from './store/ui';
import { HUD } from './components/hud/HUD';
import { Menu } from './components/menu/Menu';
import { dialogVisible, dialogTitle, dialogBody, dialogBodyHtml } from './store/ui';

export function App() {
  return (
    <div class="game-ui-root">

      <Menu />


      <HUD />


      {dialogVisible.value && (
        <div class="ui-modal-backdrop">
          <div class="ui-modal-card">
            <div class="ui-modal-spinner" aria-hidden="true" />
            <div class="ui-modal-body">
              {dialogTitle.value && <h2 class="ui-modal-title">{dialogTitle.value}</h2>}
              {dialogBodyHtml.value ? (
                <div class="ui-modal-text" dangerouslySetInnerHTML={{ __html: dialogBodyHtml.value }} />
              ) : (
                dialogBody.value && <p class="ui-modal-text">{dialogBody.value}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
