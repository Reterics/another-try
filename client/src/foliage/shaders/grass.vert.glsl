/**
 * Grass Vertex Shader
 * Fortnite-style stylized grass with:
 * - Per-instance positioning, rotation, scale
 * - Tusk-shaped blade tapering
 * - Wind animation (stronger at tip)
 * - Distance-based fade calculation
 * - Upward normals for flat shading
 */

precision highp float;

// ============================================
// Geometry Attributes (per-vertex)
// ============================================
attribute vec3 position;    // Local blade vertex position
attribute vec3 normal;      // Vertex normal (pointing UP for flat shading)
attribute vec2 uv;          // Texture coordinates
attribute float aTaper;     // 0=base, 1=tip (for wind/taper calculations)

// ============================================
// Instance Attributes (per-instance)
// ============================================
attribute vec3 aInstancePosition;   // World position (x, y, z)
attribute vec4 aInstanceData;       // x=rotation, y=scale, z=variant, w=random

// ============================================
// Uniforms
// ============================================
// Transform matrices
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

// Time for animation
uniform float uTime;

// Wind parameters
uniform vec2 uWindDirection;    // Normalized XZ direction
uniform float uWindStrength;    // Overall wind intensity (0-1)
uniform float uWindSpeed;       // Animation speed multiplier

// Camera for distance calculations
uniform vec3 uCameraPosition;

// LOD/Fade parameters
uniform float uMaxDistance;     // Maximum render distance
uniform float uFadeStart;       // Distance where fade begins (typically maxDistance - 20)

// Blade dimensions (per-variant, set by material)
uniform vec2 uHeightRange;      // [min, max] height in meters
uniform vec2 uWidthRange;       // [min, max] width in meters

// ============================================
// Varyings (to fragment shader)
// ============================================
varying vec2 vUv;
varying float vHeightFactor;    // 0=base, 1=tip (for color gradient)
varying float vDistanceFade;    // 1=full opacity, 0=fully faded
varying float vRandom;          // Per-instance random for color variation
varying vec3 vWorldPosition;    // For potential effects
varying float vWindBend;        // For potential fragment effects

// ============================================
// Hash Functions
// ============================================

// Deterministic hash for consistent randomness
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Second hash with different coefficients
float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(269.5, 183.3))) * 24634.6342);
}

// ============================================
// Wind Functions
// ============================================

// Multi-layered wind for natural movement
float calculateWind(vec3 worldPos, float time) {
    // Base sway - slow, large movement
    float baseSway = sin(time * 0.9 + worldPos.x * 0.05 + worldPos.z * 0.07) * 0.5;

    // Secondary ripple - faster, medium waves
    float ripple = sin(time * 1.8 + worldPos.x * 0.12 + worldPos.z * 0.1) * 0.35;

    // Gust pattern - intermittent strong wind
    float gustPhase = time * 0.35 + worldPos.x * 0.015 + worldPos.z * 0.02;
    float gust = max(0.0, sin(gustPhase)) * 0.4;
    gust *= gust; // Square for sharper gusts

    return baseSway + ripple + gust;
}

// ============================================
// Main Vertex Shader
// ============================================

void main() {
    // Pass through UVs and taper factor
    vUv = uv;
    vHeightFactor = aTaper;
    vRandom = aInstanceData.w;

    // Unpack instance data
    float rotation = aInstanceData.x;       // Rotation around Y axis (radians)
    float scale = aInstanceData.y;          // Overall scale multiplier
    float variant = aInstanceData.z;        // Variant index (0, 1, 2)

    // Calculate blade dimensions with per-instance variation
    vec2 posHash = aInstancePosition.xz;
    float heightVar = pow(hash(posHash), 0.7);
    float widthVar = pow(hash(posHash + 100.0), 0.85);

    float bladeHeight = mix(uHeightRange.x, uHeightRange.y, heightVar) * scale;
    float bladeWidth = mix(uWidthRange.x, uWidthRange.y, widthVar);

    // Start with base position
    vec3 pos = position;

    // Apply height scaling
    pos.y *= bladeHeight;

    // Apply width with taper (geometry already tapered, this adds variation)
    // Width decreases toward tip (aTaper = 1 at tip)
    float taperWidth = bladeWidth * (1.0 - aTaper * 0.95);
    pos.x *= taperWidth;

    // Apply rotation around Y axis
    float cosR = cos(rotation);
    float sinR = sin(rotation);
    vec2 rotatedXZ = mat2(cosR, -sinR, sinR, cosR) * pos.xz;
    pos.x = rotatedXZ.x;
    pos.z = rotatedXZ.y;

    // Static lean and micro-bend per blade to break vertical uniformity
    vec2 leanDir = normalize(vec2(hash(posHash + 17.7) - 0.5, hash(posHash + 27.3) - 0.5) + vec2(0.01, 0.02));
    float leanStrength = mix(0.04, 0.22, hash(posHash + 91.31)) * (0.6 + vRandom * 0.4);
    float heightT = smoothstep(0.0, 1.0, aTaper);
    float leanBend = heightT * heightT;
    pos.xz += leanDir * leanStrength * bladeHeight * leanBend;

    // Subtle S-curve around a perpendicular axis for tuft softness
    vec2 perpDir = vec2(-leanDir.y, leanDir.x);
    float sCurvePhase = hash(posHash + 141.7) * 6.28318530718;
    float sCurve = sin(heightT * 2.2 + sCurvePhase) * 0.05;
    pos.xz += perpDir * sCurve * bladeHeight * heightT * 0.35;

    // Slight vertical wobble for non-uniform spike heights
    pos.y *= 0.98 + (hash(posHash + 211.3) - 0.5) * 0.06;

    // Calculate wind displacement
    // Wind affects mostly the tip (aTaper squared for natural falloff)
    float windAmount = calculateWind(aInstancePosition, uTime * uWindSpeed);
    float windInfluence = aTaper * aTaper * uWindStrength;
    vec2 windOffset = uWindDirection * windAmount * windInfluence * bladeHeight;

    // Apply wind bend
    pos.x += windOffset.x;
    pos.z += windOffset.y;

    // Slight droop at tip when bent (fake gravity effect)
    pos.y -= abs(windAmount) * windInfluence * 0.1 * bladeHeight;

    vWindBend = windAmount * windInfluence;

    // Final world position
    vec3 worldPos = aInstancePosition + pos;
    vWorldPosition = worldPos;

    // Calculate distance fade
    // Horizontal distance only (ignore height difference)
    float dist = distance(worldPos.xz, uCameraPosition.xz);

    // Smooth fade from uFadeStart to uMaxDistance
    vDistanceFade = 1.0 - smoothstep(uFadeStart, uMaxDistance, dist);

    // Transform to clip space
    vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
