# Architecture Snapshot — 2025-11-21

This snapshot captures the current structure of `src/` and highlights controllers, models, libs/utils, workers, render-related modules, and minimap-related modules. It also notes where the current `EventManager` is used.

## High-level Overview
- Entry point: `src/main.ts`
  - Sets up renderer, camera, scene, controls, managers, and the main RAF loop via `animate()`.
- Messaging: `src/lib/EventManager.ts`
  - Ad-hoc pub/sub base class currently extended by several controllers/managers.

## File Map of src/

- controllers/
  - `HUDController.ts` — HUD text input and on-screen UI; extends `EventManager`.
  - `CreatorController.ts` — Editor-like interactions, object placement and selection; extends `EventManager`.
  - `MinimapController.ts` — Renders a top-down minimap into its own WebGL canvas; extends `EventManager`.

- lib/
  - `EventManager.ts` — Generic pub/sub base class (current event system).
  - `ServerManager.ts` — WebSocket messaging; extends `EventManager`.
  - `terrainManager.ts` — Terrain height/mesh/procedural helpers for the world.

- models/
  - Root assets and primitives: `box.ts`, `demoMap.ts`, `hero.ts`, `sky.ts`, `sphere.ts`.
  - cloud/
    - `index.ts`, `cloud.vert`, `cloud.frag` — Cloud mesh and shaders.
  - grass/
    - `grassManager.ts`, `grassImpostorField.ts`, `adaptiveGrassPatch.ts` — Grass LOD management and impostors.
    - `grass.vert`, `grass.frag` — Grass shaders.
    - shaders/
      - `field.vert`, `field.frag` — Additional grass material shaders.

- pages/
  - `menu.html`, `ingame.html`, `pause.html` — HTML templates/pages used by the app.

- types/
  - `controller.ts` — Controller-related types (e.g., minimap params and dimensions).
  - `grass.ts`, `main.ts`, `math.ts`, `three.ts`, `imports.d.ts` — Shared type declarations.

- utils/
  - `math.ts` — Numeric helpers; rounding, etc.
  - `model.ts` — Scene/model instantiation helpers (e.g., shadow objects).
  - `noise.ts` — Noise functions for procedural generation.
  - `terrain.ts` — Terrain math/utilities.

- workers/
  - `environmentWorker.ts` — Web Worker script for environment/terrain work.
  - `environmentWorkerClient.ts` — Worker client/bridge used from the main thread.

- Root files
  - `main.ts` — Application bootstrap, renderer/camera/scene setup, input wiring, and `requestAnimationFrame` loop in `animate()`.
  - `vite-env.d.ts` — Vite type declarations.

## Render-related Modules (renderer, loop, scene setup)
- `src/main.ts`
  - Renderer creation: `new THREE.WebGLRenderer(...)`, `setPixelRatio`, `setSize`, appended to `document.body`.
  - Scene/camera: `new THREE.Scene()`, `new THREE.PerspectiveCamera(...)`.
  - Controls: `OrbitControls` configured for dolly/rotate.
  - RAF loop: `function animate() { ... requestAnimationFrame(animate); ... renderer.render(scene, camera); }`.
  - Resize handling: `onWindowResize()` updates camera aspect and renderer size.

## Minimap-related Modules
- `src/controllers/MinimapController.ts`
  - Owns a separate `WebGLRenderer` bound to a target canvas in the minimap DOM.
  - Uses `OrthographicCamera` and a `Sprite` textured with the world map.
  - Tracks zoom/span, player orientation, and handles texture swapping.
- Types
  - `src/types/controller.ts` — Contains `MinimapDimensions`, `MinimapInputArguments`, etc., used by `MinimapController`.

## Where `EventManager` Is Used
- Definition:
  - `src/lib/EventManager.ts`
- Direct usages (extends/imports):
  - `src/controllers/CreatorController.ts` — `extends EventManager`.
  - `src/controllers/HUDController.ts` — `extends EventManager`.
  - `src/controllers/MinimapController.ts` — `extends EventManager`.
  - `src/lib/ServerManager.ts` — `extends EventManager`.

## Workers / Background Tasks
- `src/workers/environmentWorker.ts` — Worker entry for environment/terrain tasks.
- `src/workers/environmentWorkerClient.ts` — Main-thread client that communicates with the worker.

## Notes
- The current eventing is untyped and localized via `EventManager`. Future tasks plan to introduce a typed `EventBus`.
- The render loop currently lives in `main.ts`; later tasks propose extracting a `FrameLoop` in `src/engine/render/`.
