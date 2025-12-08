/**
 * Foliage System - Public API
 *
 * - Grass rendered as tufts (5 blades per instance)
 * - Natural clumpy appearance like real grass
 * - Efficient instancing (5x fewer draw instances)
 *
 * Procedural tree placement system
 */

// Main systems
export { GrassSystem } from './GrassSystem';
export { TreeSystem } from './TreeSystem';

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
    // Single blade (legacy)
    createTuskBladeGeometry,
    createBladeGeometryVariants,
    createSharedBladeGeometry,
    getBladeGeometryStats,
    // Tuft geometry (5 blades per tuft)
    BLADES_PER_TUFT,
    createTuftGeometry,
    createSharedTuftGeometry,
    getTuftGeometryStats,
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

    // Tree types
    type TreeParams,
    DEFAULT_TREE_PARAMS,
    type TreeVariant,
    TREE_VARIANTS,
    TREE_CONSTANTS,
    TREE_LOD_DENSITY_FACTORS,
    type TreeInstanceData,
    type TreeWorkerRequest,
    type TreeWorkerResponse,
    type TreeStats,
} from './types';
