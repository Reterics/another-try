/**
 * Grass System Types and Constants
 * Fortnite-style stylized grass with multiple variants
 */


/**
 * Configuration parameters for the grass system
 */
export interface GrassParams {
    /** Size of each grass patch in meters (default: 16) */
    patchSize: number;
    /** Blades per square meter (200-600) */
    densityPerSqM: number;
    /** Maximum render distance in meters (default: 60) */
    maxDistance: number;
    /** Wind intensity (0-1, default: 0.3) */
    windStrength: number;
    /** Wind animation speed (default: 1.0) */
    windSpeed: number;
    /** Normalized XZ wind direction */
    windDirection: [number, number];
    /** Global seed for deterministic placement */
    seed: number;
    /** LOD tier boundaries in meters [tier0, tier1, tier2] */
    lodDistances: [number, number, number];
    /** Whether the grass system is enabled */
    enabled: boolean;
}

/**
 * Default grass parameters
 */
export const DEFAULT_GRASS_PARAMS: GrassParams = {
    patchSize: 16,
    densityPerSqM: 400,
    maxDistance: 60,
    windStrength: 0.3,
    windSpeed: 1.0,
    windDirection: [0.7, 0.7],
    seed: 12345,
    lodDistances: [20, 40, 60],
    enabled: true,
};

/**
 * Grass variant definition for different blade types
 */
export interface GrassVariant {
    /** Unique identifier */
    id: number;
    /** Human-readable name */
    name: string;
    /** Height range [min, max] in meters */
    heightRange: [number, number];
    /** Base width range [min, max] in meters */
    widthRange: [number, number];
    /** Curvature amount (0-1), higher = more curved */
    curve: number;
    /** Wind resistance (0-1), higher = stiffer/less movement */
    stiffness: number;
    /** Base color RGB (0-1) - dark, near ground */
    colorBase: [number, number, number];
    /** Tip color RGB (0-1) - lighter, at top */
    colorTip: [number, number, number];
}

/**
 * Pre-defined grass variants for Fortnite-style look
 * - Short: Dense ground cover, stiff
 * - Medium: Standard grass, moderate sway
 * - Tall: Sparse accent grass, flowing movement
 */
export const GRASS_VARIANTS: readonly GrassVariant[] = [
    {
        id: 0,
        name: 'short',
        heightRange: [0.15, 0.25],
        widthRange: [0.015, 0.02],
        curve: 0.2,
        stiffness: 0.8,
        colorBase: [0.18, 0.37, 0.12],  // Dark green
        colorTip: [0.45, 0.65, 0.25]    // Bright green
    },
    {
        id: 1,
        name: 'medium',
        heightRange: [0.35, 0.45],
        widthRange: [0.012, 0.018],
        curve: 0.4,
        stiffness: 0.5,
        colorBase: [0.15, 0.32, 0.10],  // Darker green
        colorTip: [0.55, 0.75, 0.35]    // Yellow-green
    },
    {
        id: 2,
        name: 'tall',
        heightRange: [0.45, 0.55],
        widthRange: [0.01, 0.015],
        curve: 0.6,
        stiffness: 0.3,
        colorBase: [0.12, 0.28, 0.08],  // Deep green
        colorTip: [0.50, 0.70, 0.30]    // Lime green
    }
] as const;

/**
 * Global grass constants matching the guidelines spec
 */
export const GRASS_CONSTANTS = {
    /** Minimum blade height in meters */
    HEIGHT_MIN: 0.15,
    /** Maximum blade height in meters */
    HEIGHT_MAX: 0.55,
    /** Minimum blade width in meters */
    WIDTH_MIN: 0.01,
    /** Maximum blade width in meters */
    WIDTH_MAX: 0.02,
    /** Minimum clump radius in meters */
    CLUMP_RADIUS_MIN: 0.2,
    /** Maximum clump radius in meters */
    CLUMP_RADIUS_MAX: 0.4,
    /** Minimum density (blades per m²) */
    DENSITY_MIN: 200,
    /** Maximum density (blades per m²) */
    DENSITY_MAX: 600,
    /** LOD tier 0 distance (full detail) */
    LOD0_DISTANCE: 20,
    /** LOD tier 1 distance (reduced detail) */
    LOD1_DISTANCE: 40,
    /** Fade/cull distance */
    FADE_DISTANCE: 60,
    /** Number of segments per blade geometry */
    SEGMENTS_PER_BLADE: 5,
    /** Maximum instances per patch */
    MAX_INSTANCES_PER_PATCH: 65536,
} as const;

/**
 * LOD tier density factors
 * Applied to instance count at each distance tier
 */
export const LOD_DENSITY_FACTORS = {
    /** 0-20m: Full density */
    TIER_0: 1.0,
    /** 20-40m: Reduced density */
    TIER_1: 0.5,
    /** 40-60m: Sparse, fading out */
    TIER_2: 0.2,
} as const;

/**
 * Variant distribution weights by biome type
 * Values are [short, medium, tall] weights (should sum to 1)
 */
export const VARIANT_DISTRIBUTION = {
    /** Lush grass areas */
    grass: [0.4, 0.4, 0.2],
    /** Dirt/path areas */
    dirt: [0.7, 0.3, 0.0],
    /** Near water */
    wetland: [0.2, 0.3, 0.5],
} as const;

/**
 * Terrain sampler function type
 */
export type TerrainSampler = (x: number, z: number) => number;

/**
 * Splat weight result from terrain
 */
export interface SplatWeights {
    /** Sand weight (0-1) */
    r: number;
    /** Grass weight (0-1) */
    g: number;
    /** Dirt weight (0-1) */
    b: number;
    /** Rock weight (0-1) */
    a: number;
}

/**
 * Splat sampler function type
 */
export type SplatSampler = (x: number, z: number) => SplatWeights;

/**
 * Grass instance data layout
 * Packed into Float32Arrays for GPU upload
 */
export interface GrassInstanceData {
    /** World positions (x, y, z) - 3 floats per instance */
    positions: Float32Array;
    /** Instance data (rotation, scale, variant, random) - 4 floats per instance */
    data: Float32Array;
    /** Number of active instances */
    count: number;
}

/**
 * Stats returned by the grass system for debugging
 */
export interface GrassStats {
    /** Total visible blade instances */
    instanceCount: number;
    /** Number of active patches */
    patchCount: number;
    /** Number of draw calls */
    drawCalls: number;
    /** Instances per LOD tier */
    instancesByLod: [number, number, number];
}

/**
 * Patch state for lifecycle management
 */
export interface PatchState {
    /** Chunk grid X coordinate */
    chunkX: number;
    /** Chunk grid Z coordinate */
    chunkZ: number;
    /** Current LOD tier (0, 1, or 2) */
    lodTier: number;
    /** Whether instance data has been loaded */
    dataLoaded: boolean;
    /** Generation ID to track stale data */
    generation: number;
}

/**
 * Worker request for grass instance generation
 */
export interface GrassWorkerRequest {
    /** Patch origin X in world units */
    originX: number;
    /** Patch origin Z in world units */
    originZ: number;
    /** Patch size in meters */
    patchSize: number;
    /** Target instance count */
    instanceCount: number;
    /** Terrain parameters for height sampling */
    terrainParams: unknown;
    /** Global seed */
    seed: number;
}

/**
 * Worker response with generated grass instances
 */
export interface GrassWorkerResponse {
    /** World positions (x, y, z) per instance */
    positions: Float32Array;
    /** Instance data (rotation, scale, variant, random) per instance */
    instanceData: Float32Array;
    /** Actual number of instances generated (may be less due to culling) */
    count: number;
}

// ========================================
// Tree System Types and Constants
// ========================================

/**
 * Configuration parameters for the tree system
 */
export interface TreeParams {
    /** Size of each tree patch in meters (default: 64) */
    patchSize: number;
    /** Trees per square meter (0.001-0.05 recommended) */
    densityPerSqM: number;
    /** Maximum render distance in meters (default: 200) */
    maxDistance: number;
    /** Minimum tree height in meters */
    minHeight: number;
    /** Maximum tree height in meters */
    maxHeight: number;
    /** Global seed for deterministic placement */
    seed: number;
    /** Minimum grass splat weight to place trees (0-1) */
    grassThreshold: number;
    /** LOD tier boundaries in meters [tier0, tier1, tier2] */
    lodDistances: [number, number, number];
    /** Whether the tree system is enabled */
    enabled: boolean;
    /** Collision cylinder radius in meters */
    collisionRadius: number;
}

/**
 * Default tree parameters
 */
export const DEFAULT_TREE_PARAMS: TreeParams = {
    patchSize: 64,
    densityPerSqM: 0.008,       // ~0.5 trees per 64m² patch area = ~8 trees per patch
    maxDistance: 200,
    minHeight: 3,
    maxHeight: 5,
    seed: 54321,
    grassThreshold: 0.3,        // Only place on areas with 30%+ grass
    lodDistances: [50, 100, 200],
    enabled: true,
    collisionRadius: 0.4,       // 40cm trunk radius for collision
};

/**
 * Tree model variants
 */
export interface TreeVariant {
    /** Unique identifier */
    id: number;
    /** Path to GLB model */
    modelPath: string;
    /** Display name */
    name: string;
}

/**
 * Pre-defined tree variants
 */
export const TREE_VARIANTS: readonly TreeVariant[] = [
    {
        id: 0,
        modelPath: '/assets/models/tree_1.glb',
        name: 'tree_1',
    },
    {
        id: 1,
        modelPath: '/assets/models/tree_2.glb',
        name: 'tree_2',
    },
] as const;

/**
 * Tree system constants
 */
export const TREE_CONSTANTS = {
    /** Maximum instances per patch */
    MAX_INSTANCES_PER_PATCH: 1024,
    /** Minimum density (trees per m²) */
    DENSITY_MIN: 0.001,
    /** Maximum density (trees per m²) */
    DENSITY_MAX: 0.05,
    /** Minimum tree height in meters */
    HEIGHT_MIN: 2,
    /** Maximum tree height in meters */
    HEIGHT_MAX: 8,
    /** Default collision radius */
    COLLISION_RADIUS: 0.4,
} as const;

/**
 * Tree LOD density factors
 */
export const TREE_LOD_DENSITY_FACTORS = {
    /** 0-50m: Full density */
    TIER_0: 1.0,
    /** 50-100m: Reduced density */
    TIER_1: 0.7,
    /** 100-200m: Sparse */
    TIER_2: 0.4,
} as const;

/**
 * Tree instance data for a single tree
 */
export interface TreeInstanceData {
    /** World X position */
    x: number;
    /** World Y position (terrain height) */
    y: number;
    /** World Z position */
    z: number;
    /** Y-axis rotation in radians */
    rotation: number;
    /** Uniform scale factor (affects height) */
    scale: number;
    /** Tree variant index (0 or 1) */
    variant: number;
}

/**
 * Worker request for tree instance generation
 */
export interface TreeWorkerRequest {
    /** Patch origin X in world units */
    originX: number;
    /** Patch origin Z in world units */
    originZ: number;
    /** Patch size in meters */
    patchSize: number;
    /** Target instance count */
    instanceCount: number;
    /** Terrain parameters for height sampling */
    terrainParams: unknown;
    /** Global seed */
    seed: number;
    /** Minimum grass weight threshold */
    grassThreshold: number;
}

/**
 * Worker response with generated tree instances
 */
export interface TreeWorkerResponse {
    /** World positions (x, y, z) per instance */
    positions: Float32Array;
    /** Instance data (rotation, scale, variant) per instance - 3 floats each */
    instanceData: Float32Array;
    /** Actual number of instances generated */
    count: number;
}

/**
 * Stats returned by the tree system for debugging
 */
export interface TreeStats {
    /** Total visible tree instances */
    instanceCount: number;
    /** Number of active patches */
    patchCount: number;
    /** Number of draw calls */
    drawCalls: number;
    /** Instances per LOD tier */
    instancesByLod: [number, number, number];
}
