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
  const outer = document.createElement('div');
  outer.classList.add('minimap-outer');

  const map = document.createElement('div');
  map.classList.add('map');

  const canvas = document.createElement('canvas');
  canvas.classList.add('minimap');

  const controllers = document.createElement('div');
  controllers.classList.add('controllers');

  const zoomIn = document.createElement('button');
  zoomIn.textContent = '+';
  zoomIn.classList.add('zoom', 'zoom-in');

  const zoomOut = document.createElement('button');
  zoomOut.textContent = '-';
  zoomOut.classList.add('zoom', 'zoom-out');

  controllers.appendChild(zoomIn);
  controllers.appendChild(zoomOut);

  map.appendChild(canvas);
  map.appendChild(controllers);
  outer.appendChild(map);

  document.body.appendChild(outer);
  return outer;
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

  bindClick(options.zoomInSelector ?? '.zoom-in', () => options.onZoomChanged(+1));
  bindClick(options.zoomOutSelector ?? '.zoom-out', () => options.onZoomChanged(-1));
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
