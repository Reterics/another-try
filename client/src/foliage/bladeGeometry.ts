/**
 * Tusk-shaped Grass Blade Geometry Factory
 * Creates stylized grass blades with proper tapering and curvature
 * for Fortnite-style rendering
 */

import {
    BufferGeometry,
    BufferAttribute,
    Vector3,
} from 'three';
import { GRASS_CONSTANTS, GRASS_VARIANTS, type GrassVariant } from './types';

/**
 * Bezier curve control points for tusk shape
 * Creates an outward curve like an elephant tusk or curved grass blade
 */
interface BezierControlPoints {
    p0: Vector3; // Base (origin)
    p1: Vector3; // First control point (outward pull)
    p2: Vector3; // Second control point (tip approach)
    p3: Vector3; // Tip (end point)
}

/**
 * Sample a cubic bezier curve at parameter t
 */
function sampleCubicBezier(
    t: number,
    p0: Vector3,
    p1: Vector3,
    p2: Vector3,
    p3: Vector3,
    target: Vector3
): Vector3 {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;

    target.set(0, 0, 0);
    target.addScaledVector(p0, uuu);
    target.addScaledVector(p1, 3 * uu * t);
    target.addScaledVector(p2, 3 * u * tt);
    target.addScaledVector(p3, ttt);

    return target;
}

/**
 * Generate bezier control points for a tusk-shaped curve
 * @param height - Total blade height
 * @param curvature - Curvature amount (0-1)
 */
function generateTuskControlPoints(height: number, curvature: number): BezierControlPoints {
    // Curvature determines how far outward the blade bends
    const bendAmount = height * 0.3 * curvature;

    return {
        p0: new Vector3(0, 0, 0),
        // First control: pulls outward at ~30% height
        p1: new Vector3(bendAmount * 0.6, height * 0.3, bendAmount * 0.3),
        // Second control: continues curve, approaching tip
        p2: new Vector3(bendAmount * 0.8, height * 0.75, bendAmount * 0.1),
        // Tip: slightly offset from center due to curve
        p3: new Vector3(bendAmount * 0.3, height, 0),
    };
}

/**
 * Create a single tusk-shaped grass blade geometry
 *
 * Geometry characteristics:
 * - Tapered: Wide at base, pointed at tip (tusk shape)
 * - Curved: Follows bezier curve for natural bend
 * - Flat-shaded: All normals point UP (0, 1, 0) for stylized look
 * - 5 segments = 10 triangles for smooth curve
 * - Unit height (1.0), scaled by shader uniforms
 * - Width is 1.0 at base, tapered to tip - shader scales to actual width
 *
 * @param segments - Number of height segments (default: 5)
 * @param curvature - Curvature amount 0-1 (default: 0.4)
 * @returns BufferGeometry with position, normal, uv, and aTaper attributes
 */
export function createTuskBladeGeometry(
    segments: number = GRASS_CONSTANTS.SEGMENTS_PER_BLADE,
    curvature: number = 0.4
): BufferGeometry {
    // Blade is unit height (1.0), will be scaled by shader
    // Width at base is 1.0, tapered toward tip - shader applies actual width scale
    const height = 1.0;

    // Generate bezier control points for the tusk curve
    // Scale curvature relative to height for proper proportions
    const bendAmount = height * 0.15 * curvature;

    const p0 = new Vector3(0, 0, 0);
    const p1 = new Vector3(bendAmount * 0.5, height * 0.35, 0);
    const p2 = new Vector3(bendAmount * 0.8, height * 0.7, 0);
    const p3 = new Vector3(bendAmount * 0.3, height, 0);

    // Vertices: 2 per row (left and right edge) × (segments + 1) rows
    const vertexCount = (segments + 1) * 2;
    const triangleCount = segments * 2;
    const indexCount = triangleCount * 3;

    // Allocate buffers
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const tapers = new Float32Array(vertexCount);
    const indices = new Uint16Array(indexCount);

    const curvePoint = new Vector3();

    // Generate vertices row by row from base to tip
    for (let row = 0; row <= segments; row++) {
        const t = row / segments; // 0 at base, 1 at tip

        // Sample the bezier curve for this row's center position
        sampleCubicBezier(t, p0, p1, p2, p3, curvePoint);

        // Taper: full width at base (0.5 on each side), nearly zero at tip
        // Quadratic falloff for natural tusk shape
        const taperFactor = 1.0 - t * t * 0.98;
        const halfWidth = 0.5 * taperFactor;

        // Left vertex (negative X)
        const leftIdx = row * 2;
        positions[leftIdx * 3 + 0] = curvePoint.x - halfWidth;
        positions[leftIdx * 3 + 1] = curvePoint.y;
        positions[leftIdx * 3 + 2] = curvePoint.z;

        // Right vertex (positive X)
        const rightIdx = row * 2 + 1;
        positions[rightIdx * 3 + 0] = curvePoint.x + halfWidth;
        positions[rightIdx * 3 + 1] = curvePoint.y;
        positions[rightIdx * 3 + 2] = curvePoint.z;

        // CRITICAL: All normals point straight UP for Fortnite-style flat shading
        normals[leftIdx * 3 + 0] = 0;
        normals[leftIdx * 3 + 1] = 1;
        normals[leftIdx * 3 + 2] = 0;
        normals[rightIdx * 3 + 0] = 0;
        normals[rightIdx * 3 + 1] = 1;
        normals[rightIdx * 3 + 2] = 0;

        // UVs: u = 0-1 across width, v = 0-1 along height
        uvs[leftIdx * 2 + 0] = 0;
        uvs[leftIdx * 2 + 1] = t;
        uvs[rightIdx * 2 + 0] = 1;
        uvs[rightIdx * 2 + 1] = t;

        // Taper attribute: 0 at base, 1 at tip (for shader wind calculations)
        tapers[leftIdx] = t;
        tapers[rightIdx] = t;
    }

    // Generate triangle indices (2 triangles per segment, forming a quad strip)
    let indexOffset = 0;
    for (let row = 0; row < segments; row++) {
        const bottomLeft = row * 2;
        const bottomRight = row * 2 + 1;
        const topLeft = (row + 1) * 2;
        const topRight = (row + 1) * 2 + 1;

        // First triangle: bottom-left, top-left, top-right
        indices[indexOffset++] = bottomLeft;
        indices[indexOffset++] = topLeft;
        indices[indexOffset++] = topRight;

        // Second triangle: bottom-left, top-right, bottom-right
        indices[indexOffset++] = bottomLeft;
        indices[indexOffset++] = topRight;
        indices[indexOffset++] = bottomRight;
    }

    // Create geometry and set attributes
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    geometry.setAttribute('aTaper', new BufferAttribute(tapers, 1));
    geometry.setIndex(new BufferAttribute(indices, 1));

    // Compute bounding box/sphere for frustum culling
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
}

/**
 * Create blade geometries for all grass variants
 * Each variant has a different curvature profile
 *
 * @returns Array of BufferGeometry, one per variant
 */
export function createBladeGeometryVariants(): BufferGeometry[] {
    return GRASS_VARIANTS.map((variant: GrassVariant) => {
        return createTuskBladeGeometry(
            GRASS_CONSTANTS.SEGMENTS_PER_BLADE,
            variant.curve
        );
    });
}

/**
 * Create a single shared blade geometry for all variants
 * Uses medium curvature; per-instance variation handled in shader
 *
 * @returns Single BufferGeometry for instanced rendering
 */
export function createSharedBladeGeometry(): BufferGeometry {
    // Use medium curvature (0.4) as base; shader adds variation
    return createTuskBladeGeometry(
        GRASS_CONSTANTS.SEGMENTS_PER_BLADE,
        0.4
    );
}

/**
 * Get vertex/triangle counts for debugging
 */
export function getBladeGeometryStats(segments: number = GRASS_CONSTANTS.SEGMENTS_PER_BLADE) {
    const vertexCount = (segments + 1) * 2;
    const triangleCount = segments * 2;

    return {
        vertices: vertexCount,
        triangles: triangleCount,
        indices: triangleCount * 3,
    };
}
