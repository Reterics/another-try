/**
 * StaminaBar component - matches HudDom.ts structure exactly
 */
import { staminaCurrent, staminaMax, staminaPercent, staminaRegenRate } from '../../store/player';

export function StaminaBar() {
    const percent = staminaPercent.value / 100; // Convert to 0-1 scale for scaleX
    const current = Math.round(staminaCurrent.value);
    const max = Math.round(staminaMax.value);
    const regen = staminaRegenRate.value;

    return (
        <div class="stat-row">
            <div class="stat-label">Stamina</div>
            <div class="stat-bar">
                <div
                    class="stat-bar-fill stamina"
                    id="HUD-stamina-bar"
                    style={{ transform: `scaleX(${percent})` }}
                />
            </div>
            <div class="stat-values">
                <span id="HUD-stamina-text">{current} / {max}</span>
                <span id="HUD-stamina-rate">
                    {regen !== 0 ? `${regen >= 0 ? '+' : ''}${Math.round(regen)} / s` : ''}
                </span>
            </div>
        </div>
    );
}
