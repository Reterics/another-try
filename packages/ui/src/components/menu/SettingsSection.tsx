/**
 * Settings Section - matches MenuDom.ts structure exactly
 */
import {
    settingsLOD,
    settingsTextureQuality,
    settingsPostFX,
    settingsMaxFPS,
} from '../../store/menu';

export function SettingsSection() {
    const handleLODChange = (e: Event) => {
        const value = (e.target as HTMLSelectElement).value as 'low' | 'medium' | 'high';
        settingsLOD.value = value;
    };

    const handleTextureQualityChange = (e: Event) => {
        const value = (e.target as HTMLSelectElement).value as 'low' | 'medium' | 'high';
        settingsTextureQuality.value = value;
    };

    const handlePostFXChange = (e: Event) => {
        const value = (e.target as HTMLSelectElement).value as 'off' | 'medium' | 'high';
        settingsPostFX.value = value;
    };

    const handleMaxFPSChange = (e: Event) => {
        const value = parseInt((e.target as HTMLSelectElement).value, 10);
        settingsMaxFPS.value = value;
    };

    const handleApplySettings = () => {
        const settings = {
            lod: settingsLOD.value,
            textureQuality: settingsTextureQuality.value,
            postfx: settingsPostFX.value,
            maxFps: settingsMaxFPS.value,
        };

        try {
            localStorage.setItem('video:settings', JSON.stringify(settings));
        } catch (_) { /* ignore */ }

        // Dispatch event for HUDController to handle
        document.dispatchEvent(new CustomEvent('menu:apply-settings', {
            detail: { settings }
        }));
    };

    return (
        <div class="menu-section" id="settings-section">
            <div class="section-title">Graphics Settings</div>
            <div class="field">
                <label for="menu-lod">Level of Detail</label>
                <select
                    id="menu-lod"
                    name="menu-lod"
                    value={settingsLOD.value}
                    onChange={handleLODChange}
                >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                </select>
            </div>
            <div class="field">
                <label for="menu-texture-quality">Texture Quality</label>
                <select
                    id="menu-texture-quality"
                    name="menu-texture-quality"
                    value={settingsTextureQuality.value}
                    onChange={handleTextureQualityChange}
                >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                </select>
            </div>
            <div class="field">
                <label for="menu-postfx">Post FX</label>
                <select
                    id="menu-postfx"
                    name="menu-postfx"
                    value={settingsPostFX.value}
                    onChange={handlePostFXChange}
                >
                    <option value="off">Off</option>
                    <option value="medium">Balanced</option>
                    <option value="high">Cinematic</option>
                </select>
            </div>
            <div class="field">
                <label for="menu-max-fps">Max FPS</label>
                <select
                    id="menu-max-fps"
                    name="menu-max-fps"
                    value={settingsMaxFPS.value}
                    onChange={handleMaxFPSChange}
                >
                    <option value="0">Uncapped (Native)</option>
                    <option value="30">30 FPS</option>
                    <option value="60">60 FPS</option>
                    <option value="90">90 FPS</option>
                    <option value="120">120 FPS</option>
                </select>
            </div>
            <button class="cta" id="menu-apply-settings" onClick={handleApplySettings}>
                Apply Settings
            </button>
        </div>
    );
}
