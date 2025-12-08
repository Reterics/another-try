/**
 * Grass Tuft Geometry Factory
 *
 * Creates grass as tufts/tussocks - groups of ~5 blades emanating from
 * a single point, rather than individual scattered blades. This creates
 * a more natural, clumpy appearance similar to real grass.
 *
 * Each tuft contains:
 * - 5 blades fanning outward from a central point
 * - Each blade has tusk-shaped tapering and curvature
 * - Blades are rotated around Y-axis at ~72° intervals with randomization
 * - Per-blade height and lean variation for natural look
 */

import {
    BufferGeometry,
    BufferAttribute,
    Vector3,
} from 'three';
import { GRASS_CONSTANTS, GRASS_VARIANTS, type GrassVariant } from './types';

/**
 * Number of blades per tuft
 */
export const BLADES_PER_TUFT = 5;

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
 * Create a tuft/tussock geometry
 *
 * A tuft contains BLADES_PER_TUFT (5) blades arranged in a fan pattern
 * emanating from a single base point. This creates the clumpy, natural
 * grass appearance
 *
 * Tuft characteristics:
 * - 5 blades per tuft, ~72° apart with randomization
 * - Each blade leans outward from center
 * - Height variation per blade (0.7-1.0 of base height)
 * - All blades share the same root position (instanced per-tuft)
 *
 * @param segments - Number of height segments per blade (default: 5)
 * @param baseCurvature - Base curvature amount 0-1 (default: 0.4)
 * @returns BufferGeometry containing all 5 blades
 */
export function createTuftGeometry(
    segments: number = GRASS_CONSTANTS.SEGMENTS_PER_BLADE,
    baseCurvature: number = 0.4
): BufferGeometry {
    const height = 1.0; // Unit height, scaled by shader

    // Pre-calculated pseudo-random values for consistent blade variation
    // These create variety while keeping each tuft visually coherent
    const bladeVariation = [
        { rotOffset: 0.0, heightScale: 1.0, leanAmount: 0.14, curveOffset: 0.0 },
        { rotOffset: 0.25, heightScale: 0.88, leanAmount: 0.2, curveOffset: 0.1 },
        { rotOffset: -0.22, heightScale: 0.95, leanAmount: 0.22, curveOffset: -0.05 },
        { rotOffset: 0.18, heightScale: 0.8, leanAmount: 0.24, curveOffset: 0.08 },
        { rotOffset: -0.28, heightScale: 0.9, leanAmount: 0.19, curveOffset: -0.08 },
    ];

    // Vertices per blade: 2 per row × (segments + 1) rows
    const verticesPerBlade = (segments + 1) * 2;
    const trianglesPerBlade = segments * 2;
    const indicesPerBlade = trianglesPerBlade * 3;

    const totalVertices = verticesPerBlade * BLADES_PER_TUFT;
    const totalIndices = indicesPerBlade * BLADES_PER_TUFT;

    // Allocate buffers for entire tuft
    const positions = new Float32Array(totalVertices * 3);
    const normals = new Float32Array(totalVertices * 3);
    const uvs = new Float32Array(totalVertices * 2);
    const tapers = new Float32Array(totalVertices);
    const bladeIndices = new Float32Array(totalVertices); // Which blade in tuft (0-4)
    const indices = new Uint16Array(totalIndices);

    const curvePoint = new Vector3();
    const baseAngleStep = (Math.PI * 2) / BLADES_PER_TUFT * 1.08;

    // Generate each blade in the tuft
    for (let bladeIdx = 0; bladeIdx < BLADES_PER_TUFT; bladeIdx++) {
        const variation = bladeVariation[bladeIdx];
        const bladeVertexOffset = bladeIdx * verticesPerBlade;
        const bladeIndexOffset = bladeIdx * indicesPerBlade;

        // Blade rotation around Y axis (fan pattern)
        const bladeAngle = baseAngleStep * bladeIdx + variation.rotOffset;
        const cosA = Math.cos(bladeAngle);
        const sinA = Math.sin(bladeAngle);

        // Blade-specific curvature
        const bladeCurvature = baseCurvature + variation.curveOffset;
        const bladeHeight = height * variation.heightScale;

        // Lean direction (outward from center)
        const leanX = sinA * variation.leanAmount * bladeHeight;
        const leanZ = cosA * variation.leanAmount * bladeHeight;

        // Bezier control points for this blade's curve
        const bendAmount = bladeHeight * 0.15 * bladeCurvature;
        const p0 = new Vector3(0, 0, 0);
        const p1 = new Vector3(bendAmount * 0.5, bladeHeight * 0.35, 0);
        const p2 = new Vector3(bendAmount * 0.8, bladeHeight * 0.7, 0);
        const p3 = new Vector3(bendAmount * 0.3, bladeHeight, 0);

        // Generate vertices for this blade
        for (let row = 0; row <= segments; row++) {
            const t = row / segments;

            // Sample bezier curve
            sampleCubicBezier(t, p0, p1, p2, p3, curvePoint);

            // Taper width
            const taperFactor = 1.0 - t * t * 0.98;
            const halfWidth = 0.5 * taperFactor;

            // Apply lean based on height
            const leanFactor = t * t; // Quadratic - more lean at top
            const leanedX = curvePoint.x + leanX * leanFactor;
            const leanedZ = curvePoint.z + leanZ * leanFactor;

            // Rotate blade around Y axis
            const rotatedX = leanedX * cosA - leanedZ * sinA;
            const rotatedZ = leanedX * sinA + leanedZ * cosA;

            // Left vertex
            const leftIdx = bladeVertexOffset + row * 2;
            const leftX = rotatedX - halfWidth * cosA;
            const leftZ = rotatedZ - halfWidth * sinA;
            positions[leftIdx * 3 + 0] = leftX;
            positions[leftIdx * 3 + 1] = curvePoint.y;
            positions[leftIdx * 3 + 2] = leftZ;

            // Right vertex
            const rightIdx = bladeVertexOffset + row * 2 + 1;
            const rightX = rotatedX + halfWidth * cosA;
            const rightZ = rotatedZ + halfWidth * sinA;
            positions[rightIdx * 3 + 0] = rightX;
            positions[rightIdx * 3 + 1] = curvePoint.y;
            positions[rightIdx * 3 + 2] = rightZ;

            // Normals point UP (flat stylized shading)
            normals[leftIdx * 3 + 0] = 0;
            normals[leftIdx * 3 + 1] = 1;
            normals[leftIdx * 3 + 2] = 0;
            normals[rightIdx * 3 + 0] = 0;
            normals[rightIdx * 3 + 1] = 1;
            normals[rightIdx * 3 + 2] = 0;

            // UVs
            uvs[leftIdx * 2 + 0] = 0;
            uvs[leftIdx * 2 + 1] = t;
            uvs[rightIdx * 2 + 0] = 1;
            uvs[rightIdx * 2 + 1] = t;

            // Taper (height factor)
            tapers[leftIdx] = t;
            tapers[rightIdx] = t;

            // Blade index within tuft
            bladeIndices[leftIdx] = bladeIdx;
            bladeIndices[rightIdx] = bladeIdx;
        }

        // Generate triangle indices for this blade
        let indexOffset = bladeIndexOffset;
        for (let row = 0; row < segments; row++) {
            const bottomLeft = bladeVertexOffset + row * 2;
            const bottomRight = bladeVertexOffset + row * 2 + 1;
            const topLeft = bladeVertexOffset + (row + 1) * 2;
            const topRight = bladeVertexOffset + (row + 1) * 2 + 1;

            indices[indexOffset++] = bottomLeft;
            indices[indexOffset++] = topLeft;
            indices[indexOffset++] = topRight;

            indices[indexOffset++] = bottomLeft;
            indices[indexOffset++] = topRight;
            indices[indexOffset++] = bottomRight;
        }
    }

    // Create geometry
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    geometry.setAttribute('aTaper', new BufferAttribute(tapers, 1));
    geometry.setAttribute('aBladeIndex', new BufferAttribute(bladeIndices, 1));
    geometry.setIndex(new BufferAttribute(indices, 1));

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
}

/**
 * Create a shared tuft geometry for instanced rendering
 * This is the main geometry used by the grass system
 *
 * @returns BufferGeometry containing a 5-blade tuft
 */
export function createSharedTuftGeometry(): BufferGeometry {
    return createTuftGeometry(
        GRASS_CONSTANTS.SEGMENTS_PER_BLADE,
        0.4
    );
}

/**
 * Get vertex/triangle counts for debugging (single blade)
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

/**
 * Get vertex/triangle counts for tuft geometry (5 blades)
 */
export function getTuftGeometryStats(segments: number = GRASS_CONSTANTS.SEGMENTS_PER_BLADE) {
    const blade = getBladeGeometryStats(segments);

    return {
        bladesPerTuft: BLADES_PER_TUFT,
        verticesPerBlade: blade.vertices,
        trianglesPerBlade: blade.triangles,
        totalVertices: blade.vertices * BLADES_PER_TUFT,
        totalTriangles: blade.triangles * BLADES_PER_TUFT,
        totalIndices: blade.indices * BLADES_PER_TUFT,
    };
}
