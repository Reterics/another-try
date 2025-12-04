# Grass Guidelines (THREE.js)

## 0. Goals

- Implement stylized grass:
    - Tall, chunky, “tusk-shaped” blades.
    - Dense near player, fading with distance.
    - GPU-instanced, wind-animated.
- Hard requirements:
    - Use **THREE.InstancedMesh** (no individual Meshes).
    - Support **1M+ blades** on desktop targets.
    - Grass system must be **toggleable** and **config-driven**.

## 1. Files & Structure

- Create:
    - `src/foliage/GrassSystem.ts`
    - `src/foliage/shaders/grass.vert.glsl`
    - `src/foliage/shaders/grass.frag.glsl`

- API:
  ```ts
  class GrassSystem {
    constructor(params: GrassParams);
    attach(scene): void;
    update(dt, camera): void;
    setEnabled(enabled): void;
    dispose(): void;
  }
  ```

- `GrassParams` includes: patchSize, densityPerSqM, maxDistance, windStrength, windSpeed, seed.

```javascript
export const GRASS_CONSTANTS = {
HEIGHT_MIN: 0.35,
HEIGHT_MAX: 0.55,
WIDTH_MIN: 0.01,
WIDTH_MAX: 0.02,
CLUMP_RADIUS_MIN: 0.2,
CLUMP_RADIUS_MAX: 0.4,
DENSITY_MIN: 200,
DENSITY_MAX: 600,
LOD0_DISTANCE: 20,
FADE_DISTANCE: 50,
};
```
## 2. Grass Geometry
THREE.js Units (~1 unit = 1 meter)

- 4–8 triangles.
- Width: 0.01–0.02 units.
- Average Blade Height	35–55 cm	0.35–0.55 units
- Blade Width	1–2 cm	0.01–0.02 units
- Clump Radius	20–40 cm
- Slight curved “tusk” shape.
- Attributes: position, normal, uv, optional aTaper.

## 3. Instancing

- One InstancedMesh per patch.
- instanceCount = patchSize² * densityPerSqM
- Recommended density: 200–600 blades per m², depending on biome / splatMap
- Per-instance:
    - Position via jittered grid + height callback.
    - Rotation random 0–360°.
    - Scale 0.8–1.3.
- Custom attributes: aVariant, aRandom.

## 4. Vertex Shader

- Wind, bend, instance transform, fade.
- Uniforms: uTime, uWindDir, uWindStrength, uWindSpeed, uMaxDistance, uCameraPos.

## 5. Fragment Shader

- Stylized painterly colors.
- Dark base → light tip.
- Random tint from instance seed.
- Alpha fade by distance.

## 6. LOD & Performance

- Tier 0: 0–20m
- Tier 1: 20–40m (Reduced shading detail, wind simplified)
- Tier 2: 40–60m (fade-out, Dither fade, instances become invisible)
- Per‑patch LOD preferred.
- Keep vertex shader branch-free.
- grass matters near the player, not far away.

## 7. Terrain Integration

- getHeightAt(x, z) callback.
- Exclusion masks for roads, buildings.
- Support delayed initialization.

## 8. Randomness

- Use **hash2-based PRNG** for spatial determinism (aligns with terrain generation).
- Hash function: `hash2(x, z, seed) => sin(x*127.1 + z*311.7 + seed*17.23) * 43758.5453 % 1`
- Per-instance randomness derived from **world coordinates + global seed**, NOT just index.
- Ensures consistent placement across patch boundaries (no popping during movement).
- Integrate with **splat map weights** (grass/sand/rock/snow) for biome-aware density:
  - Sample splat at world position (wx, wz).
  - Calculate density: `(grass_weight * 1.0 + dirt_weight * 0.5) * (1 - sand) * (1 - rock) * (1 - snow)`.
  - Accept instance if `hash2(wx, wz, seed) <= density` (deterministic culling).
- Splat-based approach prevents grass on roads, rock faces, underwater, or snow-covered areas.

## 9. API Hooks

- setWind(strength, speed, dir)
- setDensity(val)
- setMaxDistance(val)

## 10. Debugging

- Overlay: instance count, draw calls.
- debugDrawBounds()
- Tests: flat terrain, slopes, perf test.