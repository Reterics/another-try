/**
 * Minimap Wrapper - Mount point for THREE.js minimap rendering
 *
 * Note: The actual minimap rendering (canvas, camera, etc.) is handled by MinimapController.
 * This component just provides the DOM structure and mount point.
 */

export function MinimapWrapper() {
    return (
        <div class="minimap-wrapper">

            <div id="HUD-minimap" class="minimap map">

            </div>


            <div class="minimap-controls flex gap-2 mt-2">
                <button
                    class="minimap-zoom zoom-in px-3 py-1 bg-gray-800/80 hover:bg-gray-700 border border-white/20 rounded text-white font-bold transition-colors"
                    aria-label="Zoom in"
                    title="Zoom in (scroll up)"
                >
                    +
                </button>
                <button
                    class="minimap-zoom zoom-out px-3 py-1 bg-gray-800/80 hover:bg-gray-700 border border-white/20 rounded text-white font-bold transition-colors"
                    aria-label="Zoom out"
                    title="Zoom out (scroll down)"
                >
                    -
                </button>
            </div>
        </div>
    );
}
