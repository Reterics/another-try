/**
 * Grass Type Definitions
 *
 * NOTE: The old GrassManager system has been replaced by the new GrassSystem
 * in client/src/foliage/. The types below are kept for backward compatibility
 * but are considered deprecated.
 *
 * New system imports:
 * ```ts
 * import { GrassSystem, GrassParams, GRASS_CONSTANTS } from './foliage';
 * ```
 */

import { BufferGeometry, Clock, Mesh, RawShaderMaterial, Scene, Object3D, Vector3 } from "three";

/**
 * @deprecated Use GrassSystem from './foliage' instead
 */
export interface Grass {
    clock: Clock;
    scene: Scene;
    readonly instances: number;
    readonly grassMaterial: RawShaderMaterial;
    size: number;
    mesh?: Mesh<BufferGeometry, RawShaderMaterial>;
    enabled: Boolean;
    geometry: BufferGeometry;

    getFromScene: ()=>Object3D|undefined

    regenerateGrassCoordinates: ()=>void
    addToScene: ()=>void
    refresh: (cameraPosition?: Vector3)=>void
    destroy: ()=>void
    isEnabled: (bool: boolean)=>Boolean
    setSize: (size: number)=>void
    setAnchor: (anchor: Vector3)=>void
    setSampler: (sampler: (x: number, z: number)=>number)=>void
}

/**
 * @deprecated Use GrassParams from './foliage' instead
 */
export interface GrassOptions {
    instances?: number
    size?: number
    enabled?: boolean
    sampler?: (x: number, z: number)=>number
    anchor?: Vector3
}

/**
 * @deprecated Use GrassParams from './foliage' instead
 *
 * Migration guide:
 * - patchRadius → maxDistance (now controls render distance directly)
 * - impostorRadius → removed (impostors not yet implemented in new system)
 * - lodRadii → lodDistances (now [number, number, number] for 3 tiers)
 * - instancesPerPatch → densityPerSqM (density-based instead of fixed count)
 * - lodSteps → handled internally by LOD_DENSITY_FACTORS
 * - windIntensity → windStrength
 * - impostorDensity → removed
 * - maxPatchCreatesPerFrame → handled internally
 */
export interface GrassManagerOptions {
    // World-space radii (same units as your coordinate system; 1 unit = 1 meter)
    patchRadius?: number
    impostorRadius?: number
    // Distances where LOD steps change (ascending), same units as patchRadius
    lodRadii?: number[]

    // Optional grass patch cell size (meters). If omitted, falls back to terrain chunk size.
    patchSize?: number

    instancesPerPatch?: number
    maxPatches?: number
    enabled?: boolean
    lodSteps?: number[]
    windIntensity?: number
    impostorDensity?: number
    maxPatchCreatesPerFrame?: number
}

// Re-export new types for convenience
export type {
    GrassParams,
    GrassVariant,
    GrassStats,
    TerrainSampler,
    SplatSampler,
} from '../foliage/types';

export {
    GrassSystem,
    GRASS_CONSTANTS,
    GRASS_VARIANTS,
    DEFAULT_GRASS_PARAMS,
} from '../foliage';
