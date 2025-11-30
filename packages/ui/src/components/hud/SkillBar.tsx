import { activeTool } from '../../store/ui';

/**
 * SkillBar - matches HudDom.ts structure exactly
 * Active tool highlighting is driven by @preact/signals state.
 */
export function SkillBar() {
    const current = activeTool.value;

    const getClasses = (tool: typeof current) => {
        const classes = ['skill-slot', 'side-button'];
        if (tool === current) {
            classes.push('selected');
        }
        return classes.join(' ');
    };

    return (
        <div class="skill-bar side-buttons">
            <div class={getClasses('pointer')} data-active="pointer" title="Pointer">
                <span class="skill-key">1</span>
                <img src="/cursor.svg" alt="Pointer" width="22" height="22" />
                <div class="skill-cooldown"></div>
            </div>
            <div class={getClasses('far')} data-active="far" title="Far">
                <span class="skill-key">2</span>
                <img src="/binoculars.svg" alt="Far" width="22" height="22" />
                <div class="skill-cooldown" style={{ opacity: 0.55 }}></div>
            </div>
            <div class={getClasses('size')} data-active="size" title="Size">
                <span class="skill-key">3</span>
                <img src="/box.svg" alt="Size" width="22" height="22" />
                <div class="skill-cooldown"></div>
            </div>
            <div class={getClasses('precision')} data-active="precision" title="Precision">
                <span class="skill-key">4</span>
                <img src="/border-style.svg" alt="Precision" width="22" height="22" />
                <div class="skill-cooldown"></div>
            </div>
        </div>
    );
}
