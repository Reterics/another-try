/**
 * HUD - main heads-up display component - matches HudDom.ts structure exactly
 */
import { showHUD, showDebug } from '../../store/ui';
import { PlayerPanel } from './PlayerPanel';
import { DebugPanel } from './DebugPanel';
import { MessagesPanel } from './MessagesPanel';
import { SkillBar } from './SkillBar';
import { FooterInfo } from './FooterInfo';

export function HUD() {
    if (!showHUD.value) {
        return null;
    }

    return (
        <div id="inGame">
            <div class="hud-layer">
                <div class="hud-top-row">
                    <div class="hud-left-stack">
                        <PlayerPanel />
                        {showDebug.value && <DebugPanel />}
                    </div>


                    <div class="hud-right-stack">
                    </div>
                </div>


                <div class="hud-bottom-row">
                    <MessagesPanel />
                    <SkillBar />
                    <FooterInfo />
                </div>
            </div>
        </div>
    );
}
