/**
 * New Game Section - matches MenuDom.ts structure exactly
 */
import { playerNameInput } from '../../store/menu';

export function NewGameSection() {
    const handleStartNew = () => {
        const name = playerNameInput.value.trim() || 'Traveler';
        try {
            localStorage.setItem('player:name', name);
        } catch (_) { /* ignore */ }

        // Dispatch event for HUDController to handle
        document.dispatchEvent(new CustomEvent('menu:start-new-game', {
            detail: { name }
        }));
    };

    const handleNameChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        playerNameInput.value = target.value;
    };

    return (
        <div class="menu-section" id="new-game-section">
            <div class="section-title">New Game</div>
            <div class="field">
                <label for="menu-player-name">Player Name</label>
                <input
                    type="text"
                    id="menu-player-name"
                    name="menu-player-name"
                    placeholder="Enter your name"
                    maxLength={24}
                    value={playerNameInput.value}
                    onInput={handleNameChange}
                />
            </div>
            <button class="cta" id="menu-start-new" onClick={handleStartNew}>
                Start New Game
            </button>
        </div>
    );
}
