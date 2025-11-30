import { debugLines } from '../../store/game';

/**
 * DebugPanel - shows live debug lines driven by EventBus/Signals.
 */
export function DebugPanel() {
    const lines = debugLines.value;
    return (
        <div id="HUD-stats" class="debug-panel">
            {lines.length === 0 ? (
                <div class="text-sm text-gray-400">No debug data</div>
            ) : (
                lines.map((line) => (
                    <div class="text-sm leading-tight" key={line}>{line}</div>
                ))
            )}
        </div>
    );
}
