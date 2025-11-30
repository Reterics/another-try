/**
 * PlayerPanel - matches HudDom.ts structure exactly
 */
import { playerName, playerLevel } from '../../store/player';
import { HealthBar } from './HealthBar';
import { StaminaBar } from './StaminaBar';

export function PlayerPanel() {
    return (
        <div class="player-panel">
            <div class="player-header">
                <div class="player-name" id="HUD-player-name">{playerName.value}</div>
                <div class="player-level" id="HUD-player-level">{playerLevel.value}</div>
            </div>
            <HealthBar />
            <StaminaBar />
            <div id="HUD-information"></div>
            <div style={{ display: 'none' }}>
                <progress id="HUD-energy" value="0" max="20">0%</progress>
            </div>
        </div>
    );
}
