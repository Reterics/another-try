import {BufferGeometry, Vector3} from 'three';
import {fbm2D, Perlin2D, ridged2D} from './noise';

export const WORLD_MIN_HEIGHT = -35;
export const WORLD_MAX_HEIGHT = 220;
export const WATER_LEVEL = -1;
const WORLD_HEIGHT_RANGE = WORLD_MAX_HEIGHT - WORLD_MIN_HEIGHT;

export interface EarthParams {
  seed: number;
  elevationScale: number; // max elevation in world Y units (e.g., meters -> match your scene units)
  continentScale: number; // larger => larger continents (world units per noise unit)
  mountainScale: number;  // controls mountain detail frequency
  mountainWeight: number; // blend of mountains into continents
  riverScale: number;     // frequency for river mask
  riverWidth: number;     // 0..1 width of rivers
  riverDepth: number;     // depth factor for carving rivers
  seaLevel: number;       // 0..1 relative sea level threshold on the normalized height
}

export const defaultEarthParams: EarthParams = {
  seed: 12345,
  elevationScale: WORLD_HEIGHT_RANGE,
  continentScale: 3000,       // big shapes across multiple tiles
  mountainScale: 600,         // finer features
  mountainWeight: 0.6,
  riverScale: 1200,           // broad river basins
  riverWidth: 0.15,
  riverDepth: 0.25,
  seaLevel: 0.38,
};

export class EarthTerrain {
  private perlin: Perlin2D;
  constructor(private params: EarthParams = defaultEarthParams) {
    this.perlin = new Perlin2D(params.seed);
  }

  sample01(x: number, z: number): number {
    const p = this.params;

    // Continents: fbm in [-1,1] -> [0,1]
    const c = (fbm2D(this.perlin, x / p.continentScale, z / p.continentScale, 5, 2, 0.5) + 1) * 0.5;

    // Mountains: ridged in [0,1], modulated by continent mask
    const m = ridged2D(this.perlin, x / p.mountainScale, z / p.mountainScale, 4, 2.1, 0.55);

    // Basic elevation before rivers
    // Emphasize higher continent values and blend mountains in those regions
    const base = Math.pow(Math.max(0, c - p.seaLevel) / (1 - p.seaLevel), 1.2);
    const elev = (1 - p.mountainWeight) * base + p.mountainWeight * (base * m);

    // River mask: high value along channels -> carve depth
    const r = ridged2D(this.perlin, x / p.riverScale, z / p.riverScale, 3, 2.0, 0.55); // [0,1]
    // Convert to a band near zero (channels). ridged peaks at 1 on ridges; we want valleys.
    // Using (1 - r) to get valleys ~1 near channels
    const valleys = 1 - r;
    // Create a bell-shaped band for rivers with width
    const band = Math.max(0, 1 - Math.abs(valleys - 1) / (p.riverWidth)); // ~1 inside channel, 0 outside
    const carved = Math.max(0, elev - band * p.riverDepth * (0.5 + 0.5 * base));

    // Re-apply sea level clamp and slight beach smoothing
      return Math.max(0, Math.min(1, carved));
  }

  sampleHeight(x: number, z: number): number {
    const h01 = this.sample01(x, z);
    const scale = this.params.elevationScale ?? WORLD_HEIGHT_RANGE;
    return WORLD_MIN_HEIGHT + h01 * scale;
  }
}

export const applyProceduralHeightsToGeometry = (
  geom: BufferGeometry,
  worldOffset: Vector3,
  sampler: (x: number, z: number) => number
) => {
  const pos = geom.attributes.position.array as Float32Array;
  for (let i = 0; i < pos.length; i += 3) {
    // Local horizontal axes for PlaneGeometry before rotation are X (pos[i]) and Y (pos[i+1]).
    // Mesh is rotated -PI/2 around X to lie flat; height is stored in Z component (pos[i+2]).
    const wx = pos[i] + worldOffset.x;      // world X including offset
    const wz = pos[i + 1] + worldOffset.z;  // world Z corresponds to local Y before rotation
    const wy = sampler(wx, wz);
    pos[i + 2] = wy; // write height into Z component (before rotation), which becomes world Y after rotation
  }
  geom.attributes.position.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingBox();
};

export const applyProceduralHeightsWorld = (
  geom: BufferGeometry,
  sampler: (x: number, z: number) => number
) => {
  const pos = geom.attributes.position.array as Float32Array;
  for (let i = 0; i < pos.length; i += 3) {
    const wx = pos[i];      // world X
    const wz = pos[i + 2];  // world Z
    const wy = sampler(wx, wz);
    pos[i + 1] = wy; // set world Y directly
  }
  geom.attributes.position.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingBox();
};

// Blending between a heightmap-displaced world-space geometry and procedural terrain near edges
export type AffineMatch = 'none' | 'offset' | 'offsetScale';

export interface TerrainBlendParams {
  blendWidth: number; // width of blend zone (meters)
  affine: AffineMatch;
}

export const defaultBlendParams: TerrainBlendParams = {
  blendWidth: 50,
  affine: 'offsetScale',
};

export const blendHeightmapToProceduralWorld = (
  geom: BufferGeometry,
  sampler: (x: number, z: number) => number,
  params: TerrainBlendParams = defaultBlendParams,
  tileOffset?: Vector3 // optional world offset applied later to mesh.position
) => {
  if (!geom.boundingBox) geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const pos = geom.attributes.position.array as Float32Array;

  const minX = bb.min.x;
  const maxX = bb.max.x;
  const minZ = bb.min.z;
  const maxZ = bb.max.z;

  const ox = tileOffset ? tileOffset.x : 0;
  const oz = tileOffset ? tileOffset.z : 0;

  // Collect border samples for affine fit
  let n = 0;
  let sumH = 0, sumP = 0, sumH2 = 0, sumHP = 0;
  const eps = 1e-6;

  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const dx = Math.min(Math.abs(x - minX), Math.abs(maxX - x));
    const dz = Math.min(Math.abs(z - minZ), Math.abs(maxZ - z));
    const dEdge = Math.min(dx, dz);
    if (dEdge < eps) {
      const P = sampler(x + ox, z + oz);
      const H = y;
      sumH += H; sumP += P; sumH2 += H * H; sumHP += H * P; n++;
    }
  }

  let a = 1, b = 0;
  if (params.affine !== 'none' && n >= 2) {
    if (params.affine === 'offset') {
      // match average offset on the border
      const avgH = sumH / n;
      const avgP = sumP / n;
      a = 1; b = avgP - avgH;
    } else {
      // offsetScale: least squares a, b
      const denom = (n * sumH2 - sumH * sumH);
      if (Math.abs(denom) > 1e-6) {
        a = (n * sumHP - sumH * sumP) / denom;
        // clamp to avoid wild scales
        a = Math.max(0.5, Math.min(2.0, a));
        b = (sumP - a * sumH) / n;
      } else {
        // fallback to offset only
        const avgH = sumH / n;
        const avgP = sumP / n;
        a = 1; b = avgP - avgH;
      }
    }
  }

  const width = Math.max(1e-3, params.blendWidth);

  // Prepare delta storage for later object Y adjustments
  const vertCount = pos.length / 3;
  const rowLen = Math.max(1, Math.round(Math.sqrt(vertCount)));
  const deltas = new Float32Array(vertCount);

  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const dx = Math.min(Math.abs(x - minX), Math.abs(maxX - x));
    const dz = Math.min(Math.abs(z - minZ), Math.abs(maxZ - z));
    const dEdge = Math.min(dx, dz);

    const t = Math.max(0, Math.min(1, dEdge / width)); // 0 at edge, 1 after blendWidth
    const w = t; // weight for heightmap; (1-w) for procedural

    const P = sampler(x + ox, z + oz);
    const Hprime = a * y + b;
    const blended = w * Hprime + (1 - w) * P;

    deltas[i / 3] = blended - y; // how much ground moved at this vertex
    pos[i + 1] = blended;
  }

  // Attach blend delta grid to geometry for object adjustment
  // @ts-ignore
  geom.userData = geom.userData || {};
  // @ts-ignore
  geom.userData.blendDelta = {
    minX, maxX, minZ, maxZ,
    rowLen,
    deltas,
  };

  geom.attributes.position.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingBox();
};

export interface BlendDeltaInfo {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  rowLen: number; // vertices per row (segments+1)
  deltas: Float32Array; // per-vertex blendedY - originalY at grid nodes
}

// Bilinear sample of the stored blend delta at an arbitrary world (x,z)
export const sampleBlendDeltaAt = (geom: BufferGeometry, x: number, z: number): number => {
  // @ts-ignore
  const info: BlendDeltaInfo | undefined = geom?.userData?.blendDelta;
  if (!info) return 0;
  const { minX, maxX, minZ, maxZ, rowLen, deltas } = info;
  if (x < minX || x > maxX || z < minZ || z > maxZ) return 0;
  const nx = (x - minX) / Math.max(1e-6, (maxX - minX));
  const nz = (z - minZ) / Math.max(1e-6, (maxZ - minZ));
  const gx = nx * (rowLen - 1);
  const gz = nz * (rowLen - 1);
  const x0 = Math.floor(gx);
  const x1 = Math.min(rowLen - 1, x0 + 1);
  const z0 = Math.floor(gz);
  const z1 = Math.min(rowLen - 1, z0 + 1);
  const tx = Math.max(0, Math.min(1, gx - x0));
  const tz = Math.max(0, Math.min(1, gz - z0));

  const idx = (i: number, j: number) => j * rowLen + i;
  const d00 = deltas[idx(x0, z0)] || 0;
  const d10 = deltas[idx(x1, z0)] || 0;
  const d01 = deltas[idx(x0, z1)] || 0;
  const d11 = deltas[idx(x1, z1)] || 0;

  const d0 = d00 * (1 - tx) + d10 * tx;
  const d1 = d01 * (1 - tx) + d11 * tx;
  return d0 * (1 - tz) + d1 * tz;
};
