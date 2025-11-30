/**
 * Map Selector - matches MenuDom.ts structure exactly
 */
import { availableMaps } from '../../store/menu';

export function MapSelector() {
    const maps = availableMaps.value;

    // Default hidden, shown when maps are available
    const shouldShow = maps.length > 0;

    const handleMapClick = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target && target.id) {
            // Dispatch event for HUDController to handle
            document.dispatchEvent(new CustomEvent('menu:map-selected', {
                detail: { mapId: target.id }
            }));
        }
    };

    return (
        <div
            id="maps"
            class={shouldShow ? '' : 'hidden'}
            aria-hidden={!shouldShow}
            style={{ display: shouldShow ? 'block' : 'none' }}
            onClick={handleMapClick}
        >
            {maps.map((map) => (
                <a key={map.id} id={map.id}>
                    {map.name || 'Play'}
                </a>
            ))}
        </div>
    );
}
