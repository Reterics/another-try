// Shared grass sizing (tuned to Fortnite-like, knee-height grass).
// Units are meters; 1 unit = 1 meter in world space.
export const GRASS_HEIGHT_RANGE = {
    min: 0.25, // short trim
    max: 0.7   // knee-height, Fortnite-style foliage
} as const;

// Base billboard dimensions before per-instance scaling.
export const GRASS_BILLBOARD_BASE_SIZE = {
    width: 2.56,
    height: GRASS_HEIGHT_RANGE.max * 8
} as const;
