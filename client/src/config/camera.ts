// Third-person camera defaults (1 unit = 1 meter).
export const TPS_CAMERA_DISTANCE = 6; // default orbit distance behind the player
export const TPS_CAMERA_MIN_DISTANCE = 1;
// Max orbit distance cap; effective max will be max(this, TPS_CAMERA_DISTANCE)
export const TPS_CAMERA_MAX_DISTANCE = 30;

// Fallback direction to place the camera when direction is undefined/zero-length.
export const TPS_CAMERA_FALLBACK_DIR: [number, number, number] = [0.25, 0.35, 1];
