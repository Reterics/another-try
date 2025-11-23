/**
 * MinimapDom utilities and bindings.
 *
 * Responsibility: DOM creation and UI event bindings for minimap controls.
 */

export interface MinimapDomBindOptions {
  /** Optional root to resolve selectors; defaults to `document`. */
  container?: Document | HTMLElement;
  /** CSS selector for the zoom-in button. */
  zoomInSelector?: string;
  /** CSS selector for the zoom-out button. */
  zoomOutSelector?: string;
  /** Optional selector for a visibility toggle control. */
  toggleSelector?: string;
  /** Callback invoked on zoom changes; positive for zoom in, negative for out. */
  onZoomChanged(delta: number): void;
  /** Optional callback when minimap UI is toggled. */
  onToggle?(visible: boolean): void;
}

export interface MinimapDomBindingsHandle {
  /** Remove all event listeners and bindings created by `bindMinimapControls`. */
  unbind(): void;
}

/** Create and attach the minimap DOM tree. Returns the outer container. */
export function createMinimapRoot(): HTMLDivElement {
  // Match the ingame HUD markup so CSS continues to apply.
  // Structure:
  // .minimap-wrapper
  //   .minimap#HUD-minimap (also tagged as .map for compatibility)
  //     canvas.minimap-canvas
  //     .minimap-heading
  //     .minimap-inner-border
  //     .minimap-indicator
  //   .minimap-controls
  //     button.minimap-zoom.zoom-in
  //     button.minimap-zoom.zoom-out
  const wrapper = document.createElement('div');
  wrapper.classList.add('minimap-wrapper');

  const map = document.createElement('div');
  map.classList.add('minimap', 'map');
  map.id = 'HUD-minimap';

  const canvas = document.createElement('canvas');
  canvas.classList.add('minimap-canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const heading = document.createElement('div');
  heading.classList.add('minimap-heading');
  heading.textContent = 'N';

  const innerBorder = document.createElement('div');
  innerBorder.classList.add('minimap-inner-border');

  const indicator = document.createElement('div');
  indicator.classList.add('minimap-indicator');

  map.appendChild(canvas);
  map.appendChild(heading);
  map.appendChild(innerBorder);
  map.appendChild(indicator);

  const controls = document.createElement('div');
  controls.classList.add('minimap-controls');

  const zoomIn = document.createElement('button');
  zoomIn.classList.add('minimap-zoom', 'zoom-in', 'zoom');
  zoomIn.setAttribute('aria-label', 'Zoom in');
  zoomIn.textContent = '+';

  const zoomOut = document.createElement('button');
  zoomOut.classList.add('minimap-zoom', 'zoom-out', 'zoom');
  zoomOut.setAttribute('aria-label', 'Zoom out');
  zoomOut.textContent = '-';

  controls.appendChild(zoomIn);
  controls.appendChild(zoomOut);

  wrapper.appendChild(map);
  wrapper.appendChild(controls);

  const host = document.querySelector('#inGame .hud-right-stack') || document.body;
  host.appendChild(wrapper);
  return wrapper;
}

/** Snap the `.map` element to a perfect square size based on its rect. */
export function snapCircleSize(mapEl?: HTMLElement | null): void {
  if (!mapEl) return;
  const r = mapEl.getBoundingClientRect();
  let size = Math.floor(Math.min(r.width, r.height));
  if (size % 2 !== 0) size -= 1;
  if (size <= 0) return;
  const target = `${size}px`;
  if (mapEl.style.width !== target) {
    mapEl.style.width = target;
    mapEl.style.setProperty('aspect-ratio', '1 / 1');
  }
}

/**
 * Bind minimap controls to DOM elements under the provided container.
 */
export function bindMinimapControls(options: MinimapDomBindOptions): MinimapDomBindingsHandle {
  const root: Document | HTMLElement = options.container ?? document;
  const unbinders: Array<() => void> = [];
  let visibleState = true;

  const bindClick = (selector: string | undefined, handler: (ev: Event) => void) => {
    if (!selector) return;
    const el = (root as Document).querySelector
      ? (root as Document).querySelector(selector)
      : (root as HTMLElement).querySelector!(selector);
    if (!el) return;
    const wrapped = (ev: Event) => {
      ev.preventDefault();
      handler(ev);
    };
    el.addEventListener('click', wrapped as EventListener, false);
    unbinders.push(() => el.removeEventListener('click', wrapped as EventListener, false));
  };

  bindClick(options.zoomInSelector ?? '.minimap-zoom.zoom-in', () => options.onZoomChanged(+1));
  bindClick(options.zoomOutSelector ?? '.minimap-zoom.zoom-out', () => options.onZoomChanged(-1));
  if (options.toggleSelector) {
    bindClick(options.toggleSelector, () => {
      visibleState = !visibleState;
      options.onToggle?.(visibleState);
    });
  }

  return {
    unbind() {
      for (const off of unbinders) off();
    },
  };
}
