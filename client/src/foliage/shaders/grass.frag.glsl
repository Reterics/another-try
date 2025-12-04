/**
 * Grass Fragment Shader
 * Fortnite-style stylized grass with:
 * - Dark base to light tip color gradient
 * - Per-instance random tint variation
 * - Top-down flat shading (normals point up)
 * - Dithered distance fade (no alpha blending needed)
 * - Ambient occlusion at base
 */

precision highp float;

// ============================================
// Varyings (from vertex shader)
// ============================================
varying vec2 vUv;
varying float vHeightFactor;    // 0=base, 1=tip
varying float vDistanceFade;    // 1=full opacity, 0=fully faded
varying float vRandom;          // Per-instance random (0-1)
varying vec3 vWorldPosition;    // World position
varying float vWindBend;        // Wind bend amount (for subtle effects)

// ============================================
// Uniforms
// ============================================
// Colors (set per-variant or globally)
uniform vec3 uColorBase;        // Dark color at blade base
uniform vec3 uColorTip;         // Light color at blade tip

// Lighting
uniform vec3 uSunDirection;     // Normalized sun direction
uniform vec3 uSunColor;         // Sun light color
uniform vec3 uAmbientColor;     // Ambient light color

// Optional texture (can be null for pure procedural)
uniform sampler2D uAlphaMap;    // Alpha/shape texture
uniform bool uUseAlphaMap;      // Whether to use alpha map

// ============================================
// Constants
// ============================================
const float AO_STRENGTH = 0.4;          // Ambient occlusion intensity at base
const float TINT_VARIATION = 0.12;      // Random color variation strength
const float SUBSURFACE_STRENGTH = 0.15; // Fake subsurface scattering

// ============================================
// Helper Functions
// ============================================

// Dither pattern for fade (avoids alpha blending overhead)
float dither4x4(vec2 position) {
    // 4x4 Bayer matrix dither pattern
    int x = int(mod(position.x, 4.0));
    int y = int(mod(position.y, 4.0));
    int index = x + y * 4;

    // Bayer matrix values (normalized 0-1)
    float bayer[16];
    bayer[0] = 0.0 / 16.0;   bayer[1] = 8.0 / 16.0;   bayer[2] = 2.0 / 16.0;   bayer[3] = 10.0 / 16.0;
    bayer[4] = 12.0 / 16.0;  bayer[5] = 4.0 / 16.0;   bayer[6] = 14.0 / 16.0;  bayer[7] = 6.0 / 16.0;
    bayer[8] = 3.0 / 16.0;   bayer[9] = 11.0 / 16.0;  bayer[10] = 1.0 / 16.0;  bayer[11] = 9.0 / 16.0;
    bayer[12] = 15.0 / 16.0; bayer[13] = 7.0 / 16.0;  bayer[14] = 13.0 / 16.0; bayer[15] = 5.0 / 16.0;

    // Return threshold value
    if (index == 0) return bayer[0];
    else if (index == 1) return bayer[1];
    else if (index == 2) return bayer[2];
    else if (index == 3) return bayer[3];
    else if (index == 4) return bayer[4];
    else if (index == 5) return bayer[5];
    else if (index == 6) return bayer[6];
    else if (index == 7) return bayer[7];
    else if (index == 8) return bayer[8];
    else if (index == 9) return bayer[9];
    else if (index == 10) return bayer[10];
    else if (index == 11) return bayer[11];
    else if (index == 12) return bayer[12];
    else if (index == 13) return bayer[13];
    else if (index == 14) return bayer[14];
    else return bayer[15];
}

// Simple noise-based dither (faster, less structured)
float noiseDither(vec2 position) {
    return fract(sin(dot(position, vec2(12.9898, 78.233))) * 43758.5453);
}

// ============================================
// Main Fragment Shader
// ============================================

void main() {
    // Early discard for fully faded blades
    if (vDistanceFade < 0.01) {
        discard;
    }

    // Optional alpha map for blade shape
    if (uUseAlphaMap) {
        float alpha = texture2D(uAlphaMap, vUv).r;
        if (alpha < 0.5) {
            discard;
        }
    }

    // ========================================
    // Base Color Calculation
    // ========================================

    // Gradient from base to tip
    float heightGradient = vHeightFactor;

    // Smooth the gradient slightly for more natural look
    heightGradient = smoothstep(0.0, 1.0, heightGradient);

    // Mix base and tip colors
    vec3 color = mix(uColorBase, uColorTip, heightGradient);

    // ========================================
    // Per-Instance Color Variation
    // ========================================

    // Add subtle random tint per blade
    // Shift hue slightly based on random value
    float tintShift = (vRandom - 0.5) * TINT_VARIATION;

    // Apply tint (more green variation, less red/blue)
    color.r += tintShift * 0.5;
    color.g += tintShift;
    color.b += tintShift * 0.3;

    // ========================================
    // Lighting
    // ========================================

    // Flat shading: normals point straight up
    // This gives the characteristic Fortnite/stylized look
    vec3 normal = vec3(0.0, 1.0, 0.0);

    // Basic diffuse lighting
    float NdotL = max(0.0, dot(normal, uSunDirection));

    // Boost minimum light level for stylized look (avoid pure black)
    float diffuse = mix(0.4, 1.0, NdotL);

    // Apply sun color
    vec3 lighting = uSunColor * diffuse;

    // Add ambient
    lighting += uAmbientColor;

    // ========================================
    // Fake Subsurface Scattering
    // ========================================

    // When backlit, grass glows slightly
    // This happens when sun is behind the blade from camera's view
    float backlight = max(0.0, -dot(normal, uSunDirection));
    vec3 subsurface = uSunColor * backlight * SUBSURFACE_STRENGTH * heightGradient;
    lighting += subsurface;

    // Apply lighting to color
    color *= lighting;

    // ========================================
    // Ambient Occlusion
    // ========================================

    // Darker at base where blades overlap and block light
    float ao = mix(1.0 - AO_STRENGTH, 1.0, heightGradient);
    color *= ao;

    // ========================================
    // Wind-based Effects (subtle)
    // ========================================

    // Slightly lighter when bent (simulates light catching the blade)
    float bendHighlight = abs(vWindBend) * 0.1;
    color += vec3(bendHighlight);

    // ========================================
    // Distance Fade (Dithered)
    // ========================================

    // Use dithering instead of alpha blending for performance
    // Dithering creates a stipple pattern that fades smoothly from distance
    float ditherThreshold = dither4x4(gl_FragCoord.xy);

    // Discard pixels based on fade amount
    if (ditherThreshold > vDistanceFade) {
        discard;
    }

    // ========================================
    // Output
    // ========================================

    // Clamp to valid range
    color = clamp(color, 0.0, 1.0);

    // Output solid color (no alpha needed due to dithering)
    gl_FragColor = vec4(color, 1.0);
}
