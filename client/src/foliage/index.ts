/**
 * Foliage System - Public API
 *
 * Fortnite-style stylized grass rendering system
 */

// Main system
export { GrassSystem } from './GrassSystem';

// Patch (for advanced usage)
export { GrassPatch, type GrassPatchOptions } from './GrassPatch';

// Materials
export {
    createGrassMaterial,
    createGrassMaterialVariants,
    createSharedGrassMaterial,
    updateGrassMaterialTime,
    updateGrassMaterialCamera,
    updateGrassMaterialWind,
    updateGrassMaterialDistance,
    updateGrassMaterialLighting,
    updateGrassMaterialColors,
    updateGrassMaterialPerFrame,
    type GrassMaterialOptions,
} from './GrassMaterial';

// Geometry
export {
    createTuskBladeGeometry,
    createBladeGeometryVariants,
    createSharedBladeGeometry,
    getBladeGeometryStats,
} from './bladeGeometry';

// Types and constants
export {
    // Params
    type GrassParams,
    DEFAULT_GRASS_PARAMS,

    // Variants
    type GrassVariant,
    GRASS_VARIANTS,

    // Constants
    GRASS_CONSTANTS,
    LOD_DENSITY_FACTORS,
    VARIANT_DISTRIBUTION,

    // Samplers
    type TerrainSampler,
    type SplatSampler,
    type SplatWeights,

    // Instance data
    type GrassInstanceData,
    type GrassWorkerRequest,
    type GrassWorkerResponse,

    // Stats
    type GrassStats,
    type PatchState,
} from './types';
