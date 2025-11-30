/**
 * HealthBar component - matches HudDom.ts structure exactly
 */
import { healthCurrent, healthMax, healthPercent, healthRegenRate } from '../../store/player';

export function HealthBar() {
    const percent = healthPercent.value / 100; // Convert to 0-1 scale for scaleX
    const current = Math.round(healthCurrent.value);
    const max = Math.round(healthMax.value);
    const regen = healthRegenRate.value;

    return (
        <div class="stat-row">
            <div class="stat-label">Health</div>
            <div class="stat-bar">
                <div
                    class="stat-bar-fill health"
                    id="HUD-health-bar"
                    style={{ transform: `scaleX(${percent})` }}
                />
            </div>
            <div class="stat-values">
                <span id="HUD-health-text">{current} / {max}</span>
                <span id="HUD-health-rate">
                    {regen !== 0 ? `${regen > 0 ? '+' : ''}${Math.round(regen)} / s` : ''}
                </span>
            </div>
        </div>
    );
}
