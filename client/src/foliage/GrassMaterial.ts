/**
 * Grass Material Factory
 * Creates shader materials for grass rendering with Fortnite-style visuals
 */

import {
    Color,
    DoubleSide,
    RawShaderMaterial,
    Texture,
    Vector2,
    Vector3,
} from 'three';
import {
    GRASS_VARIANTS,
    GRASS_CONSTANTS,
    DEFAULT_GRASS_PARAMS,
    type GrassVariant,
    type GrassParams,
} from './types';
import vertexShader from './shaders/grass.vert.glsl?raw';
import fragmentShader from './shaders/grass.frag.glsl?raw';

/**
 * Options for creating grass material
 */
export interface GrassMaterialOptions {
    /** Grass variant for colors/dimensions (default: medium) */
    variant?: GrassVariant;
    /** Override base color */
    colorBase?: [number, number, number];
    /** Override tip color */
    colorTip?: [number, number, number];
    /** Sun direction for lighting (normalized) */
    sunDirection?: [number, number, number];
    /** Sun light color */
    sunColor?: [number, number, number];
    /** Ambient light color */
    ambientColor?: [number, number, number];
    /** Optional alpha map texture */
    alphaMap?: Texture | null;
    /** Grass system parameters */
    params?: Partial<GrassParams>;
}

/**
 * Default lighting configuration
 */
const DEFAULT_LIGHTING = {
    sunDirection: [0.3, 0.8, 0.5] as [number, number, number],
    sunColor: [1.0, 0.98, 0.9] as [number, number, number],
    ambientColor: [0.3, 0.35, 0.4] as [number, number, number],
};

/**
 * Create a grass shader material
 *
 * @param options - Material configuration options
 * @returns RawShaderMaterial configured for grass rendering
 */
export function createGrassMaterial(options: GrassMaterialOptions = {}): RawShaderMaterial {
    const variant = options.variant ?? GRASS_VARIANTS[1]; // Default to medium
    const params = { ...DEFAULT_GRASS_PARAMS, ...options.params };

    // Resolve colors (use variant defaults or overrides)
    const colorBase = options.colorBase ?? variant.colorBase;
    const colorTip = options.colorTip ?? variant.colorTip;

    // Resolve lighting
    const sunDirection = options.sunDirection ?? DEFAULT_LIGHTING.sunDirection;
    const sunColor = options.sunColor ?? DEFAULT_LIGHTING.sunColor;
    const ambientColor = options.ambientColor ?? DEFAULT_LIGHTING.ambientColor;

    // Normalize wind direction
    const windDir = new Vector2(params.windDirection[0], params.windDirection[1]);
    windDir.normalize();

    // Create uniforms
    const uniforms = {
        // Time
        uTime: { value: 0 },

        // Wind
        uWindDirection: { value: windDir },
        uWindStrength: { value: params.windStrength },
        uWindSpeed: { value: params.windSpeed },

        // Camera (updated per frame)
        uCameraPosition: { value: new Vector3() },

        // LOD/Fade
        uMaxDistance: { value: params.maxDistance },
        uFadeStart: { value: params.maxDistance - 20 },

        // Blade dimensions (from variant)
        uHeightRange: { value: new Vector2(variant.heightRange[0], variant.heightRange[1]) },
        uWidthRange: { value: new Vector2(variant.widthRange[0], variant.widthRange[1]) },

        // Colors
        uColorBase: { value: new Color(colorBase[0], colorBase[1], colorBase[2]) },
        uColorTip: { value: new Color(colorTip[0], colorTip[1], colorTip[2]) },

        // Lighting
        uSunDirection: { value: new Vector3(sunDirection[0], sunDirection[1], sunDirection[2]).normalize() },
        uSunColor: { value: new Color(sunColor[0], sunColor[1], sunColor[2]) },
        uAmbientColor: { value: new Color(ambientColor[0], ambientColor[1], ambientColor[2]) },

        // Optional alpha map
        uAlphaMap: { value: options.alphaMap ?? null },
        uUseAlphaMap: { value: options.alphaMap != null },
    };

    // Create the material
    const material = new RawShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        side: DoubleSide,        // Blades visible from both sides
        transparent: false,      // Using discard instead of alpha
        depthWrite: true,
        depthTest: true,
    });

    return material;
}

/**
 * Create materials for all grass variants
 *
 * @param options - Shared material options (colors will be per-variant)
 * @returns Array of materials, one per variant
 */
export function createGrassMaterialVariants(
    options: Omit<GrassMaterialOptions, 'variant' | 'colorBase' | 'colorTip'> = {}
): RawShaderMaterial[] {
    return GRASS_VARIANTS.map(variant => createGrassMaterial({
        ...options,
        variant,
    }));
}

/**
 * Create a single shared material that works for all variants
 * Uses medium variant dimensions; per-instance variation handled differently
 *
 * @param options - Material options
 * @returns Single shared material
 */
export function createSharedGrassMaterial(options: GrassMaterialOptions = {}): RawShaderMaterial {
    // Use full range for shared material (shader will pick based on instance data)
    const material = createGrassMaterial({
        ...options,
        variant: GRASS_VARIANTS[1], // Medium as base
    });

    // Override height/width ranges to cover all variants
    (material.uniforms.uHeightRange.value as Vector2).set(
        GRASS_CONSTANTS.HEIGHT_MIN,
        GRASS_CONSTANTS.HEIGHT_MAX
    );
    (material.uniforms.uWidthRange.value as Vector2).set(
        GRASS_CONSTANTS.WIDTH_MIN,
        GRASS_CONSTANTS.WIDTH_MAX
    );

    return material;
}

/**
 * Update time uniform for animation
 */
export function updateGrassMaterialTime(material: RawShaderMaterial, time: number): void {
    if (material.uniforms.uTime) {
        material.uniforms.uTime.value = time;
    }
}

/**
 * Update camera position uniform
 */
export function updateGrassMaterialCamera(material: RawShaderMaterial, position: Vector3): void {
    if (material.uniforms.uCameraPosition) {
        (material.uniforms.uCameraPosition.value as Vector3).copy(position);
    }
}

/**
 * Update wind parameters
 */
export function updateGrassMaterialWind(
    material: RawShaderMaterial,
    strength: number,
    speed: number,
    direction: [number, number]
): void {
    if (material.uniforms.uWindStrength) {
        material.uniforms.uWindStrength.value = strength;
    }
    if (material.uniforms.uWindSpeed) {
        material.uniforms.uWindSpeed.value = speed;
    }
    if (material.uniforms.uWindDirection) {
        const dir = material.uniforms.uWindDirection.value as Vector2;
        dir.set(direction[0], direction[1]);
        dir.normalize();
    }
}

/**
 * Update fade/LOD distance
 */
export function updateGrassMaterialDistance(
    material: RawShaderMaterial,
    maxDistance: number
): void {
    if (material.uniforms.uMaxDistance) {
        material.uniforms.uMaxDistance.value = maxDistance;
    }
    if (material.uniforms.uFadeStart) {
        material.uniforms.uFadeStart.value = maxDistance - 20;
    }
}

/**
 * Update lighting
 */
export function updateGrassMaterialLighting(
    material: RawShaderMaterial,
    sunDirection: [number, number, number],
    sunColor?: [number, number, number],
    ambientColor?: [number, number, number]
): void {
    if (material.uniforms.uSunDirection) {
        const dir = material.uniforms.uSunDirection.value as Vector3;
        dir.set(sunDirection[0], sunDirection[1], sunDirection[2]);
        dir.normalize();
    }
    if (sunColor && material.uniforms.uSunColor) {
        (material.uniforms.uSunColor.value as Color).setRGB(
            sunColor[0], sunColor[1], sunColor[2]
        );
    }
    if (ambientColor && material.uniforms.uAmbientColor) {
        (material.uniforms.uAmbientColor.value as Color).setRGB(
            ambientColor[0], ambientColor[1], ambientColor[2]
        );
    }
}

/**
 * Update grass colors
 */
export function updateGrassMaterialColors(
    material: RawShaderMaterial,
    colorBase: [number, number, number],
    colorTip: [number, number, number]
): void {
    if (material.uniforms.uColorBase) {
        (material.uniforms.uColorBase.value as Color).setRGB(
            colorBase[0], colorBase[1], colorBase[2]
        );
    }
    if (material.uniforms.uColorTip) {
        (material.uniforms.uColorTip.value as Color).setRGB(
            colorTip[0], colorTip[1], colorTip[2]
        );
    }
}

/**
 * Batch update all per-frame uniforms
 */
export function updateGrassMaterialPerFrame(
    material: RawShaderMaterial,
    time: number,
    cameraPosition: Vector3
): void {
    updateGrassMaterialTime(material, time);
    updateGrassMaterialCamera(material, cameraPosition);
}
