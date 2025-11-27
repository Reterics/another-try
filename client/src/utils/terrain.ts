import {BufferGeometry} from 'three';
import {fbm2D, Perlin2D, ridged2D, smoothRidgedFbm2D} from './noise';

export const WORLD_MIN_HEIGHT = -35;
export const WORLD_MAX_HEIGHT = 500;
export const WATER_LEVEL = -1;
const WORLD_HEIGHT_RANGE = WORLD_MAX_HEIGHT - WORLD_MIN_HEIGHT;

// ------------------------
// Splat map (layer weights) utilities
// ------------------------
export interface SplatParams {
  // Heights in normalized 0..1 space derived from WORLD_MIN_HEIGHT..WORLD_MAX_HEIGHT
  sandMax: number;   // below this => beach/sand (near sea level)
  grassMin: number;  // start of grass region
  grassMax: number;  // end of grass region
  rockMin: number;   // start of rocky highlands
  snowMin: number;   // start of snow at very high elevations
  // Slope thresholds (approx normalized 0..1 of gradient magnitude)
  slopeRockStart: number;  // slopes above this fade to rock
  slopeRockFull: number;   // slopes above this are fully rock
}

export const defaultSplatParams: SplatParams = {
  sandMax: 0.08,
  grassMin: 0.10,
  grassMax: 0.65,
  rockMin: 0.55,
  snowMin: 0.82,
  slopeRockStart: 0.15,
  slopeRockFull: 0.35,
};

export interface SplatWeights {
  // Using channels reminiscent of a typical RGBA splat texture
  // R = sand, G = grass, B = dirt, A = rock. Snow is derived from the leftover.
  r: number; g: number; b: number; a: number; // 0..1 weights
}

export const heightTo01 = (y: number) => (y - WORLD_MIN_HEIGHT) / (WORLD_HEIGHT_RANGE);

// Central differences slope estimator using the height sampler
export const estimateSlope01 = (sampler: (x: number, z: number) => number, x: number, z: number, dx = 3): number => {
  const hL = sampler(x - dx, z);
  const hR = sampler(x + dx, z);
  const hD = sampler(x, z - dx);
  const hU = sampler(x, z + dx);
  const gx = (hR - hL) / (2 * dx);
  const gz = (hU - hD) / (2 * dx);
  const g = Math.sqrt(gx * gx + gz * gz); // rise over run in world units per meter
  // Map slope magnitude into 0..1 with gentle rolloff; clamp hard above steep slopes
  const s = g; // already "per meter" since dx is in meters
  return Math.max(0, Math.min(1, s));
};

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// Compute default splat weights based on height and slope
export const sampleDefaultSplat = (
  sampler: (x: number, z: number) => number,
  x: number,
  z: number,
  params: SplatParams = defaultSplatParams,
  slopeDx?: number
): SplatWeights => {
  const h = sampler(x, z);
  const h01 = heightTo01(h);
  const slope = estimateSlope01(sampler, x, z, slopeDx ?? 3);

  // Base biome weights from height alone
  let sand = smoothstep(0, params.sandMax, h01) * (1 - smoothstep(params.sandMax, params.sandMax + 0.05, h01));
  // Grass peaks in [grassMin, grassMax]
  const grassRise = smoothstep(params.grassMin - 0.05, params.grassMin + 0.05, h01);
  const grassFall = 1 - smoothstep(params.grassMax - 0.05, params.grassMax + 0.05, h01);
  let grass = Math.max(0, Math.min(1, grassRise * grassFall));

  // Dirt forms a band between late grass and low rocks
  const dirtLow = params.rockMin - 0.08;
  const dirtHigh = params.rockMin + 0.08;
  let dirt = smoothstep(dirtLow, params.rockMin, h01) * (1 - smoothstep(params.rockMin, dirtHigh, h01));
  dirt = Math.max(0, Math.min(1, dirt));

  // Rock grows after rockMin and with slope
  let rockHeight = smoothstep(params.rockMin - 0.05, params.rockMin + 0.1, h01);
  // Snow grows after snowMin
  let snow = smoothstep(params.snowMin - 0.03, params.snowMin + 0.03, h01);

  // Apply slope influence: push weight from softer materials into rock as slope increases
  const slopeToRock = smoothstep(params.slopeRockStart, params.slopeRockFull, slope);
  const fromSoft = Math.min(1, (sand + grass + dirt) * slopeToRock);
  rockHeight = Math.max(rockHeight, fromSoft);
  sand *= 1 - slopeToRock;
  grass *= 1 - slopeToRock * 0.8;
  dirt *= 1 - slopeToRock * 0.6;

  // Prevent lower materials from dominating under permanent snow
  const snowMask = 1 - Math.min(1, snow);
  sand *= snowMask;
  grass *= snowMask;
  dirt *= snowMask;
  // Allow some rock detail to peek through snow while still biasing to snow
  rockHeight *= 1 - snow * 0.5;

  // Normalize and clamp (include snow to keep totals consistent; snow weight derived later)
  let r = Math.max(0, Math.min(1, sand));
  let g = Math.max(0, Math.min(1, grass));
  let b = Math.max(0, Math.min(1, dirt));
  let a = Math.max(0, Math.min(1, rockHeight));
  let s = Math.max(0, Math.min(1, snow));

  const sum = r + g + b + a + s;
  if (sum > 1e-6) {
    r /= sum; g /= sum; b /= sum; a /= sum; s /= sum;
  }
  // Snow weight is not stored in the texture; derive from leftover downstream.
  return { r, g, b, a };
};

// Return a simple debug color for the splat choice
// Water is colored separately using WATER_LEVEL check
export const splatDebugColor = (
  sampler: (x: number, z: number) => number,
  x: number,
  z: number,
  params: SplatParams = defaultSplatParams
): { r: number; g: number; b: number } => {
  const h = sampler(x, z);
  if (h <= WATER_LEVEL) {
    // Water: blue-ish; deeper is darker
    const depth01 = Math.max(0, Math.min(1, (WATER_LEVEL - h) / 20));
    const blue = Math.round(160 + 95 * (1 - depth01));
    return { r: 10, g: 40, b: blue };
  }
  const w = sampleDefaultSplat(sampler, x, z, params);
  const snowWeight = Math.max(0, 1 - (w.r + w.g + w.b + w.a));
  // Pick strongest weight and map to a flat debug color
  const arr = [w.r, w.g, w.b, w.a, snowWeight];
  const idx = arr.indexOf(Math.max(...arr));
  switch (idx) {
    case 0: return { r: 194, g: 178, b: 128 }; // sand (tan)
    case 1: return { r: 50, g: 160, b: 60 };   // grass (green)
    case 2: return { r: 134, g: 96, b: 67 };   // dirt (brown)
    case 3: return { r: 110, g: 110, b: 110 }; // rock (gray)
    case 4: return { r: 250, g: 250, b: 250 }; // snow (white)
    default: return { r: 128, g: 128, b: 128 };
  }
};

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
  midElevation: number;   // meters above sea level where normalized 0.5 should land
  persistence?: number;   // fbm persistence (gain)
  steepness: number;      // controls sharpness of ridged profiles
  ridgedOctaves: number;
  ridgedLacunarity: number;
  ridgedGain: number;
  warpScale: number;
  warpStrength: number;
  // Minor relief (small hills/valleys)
  hillScale: number;      // higher frequency than mountains
  hillWeight: number;     // low amplitude 0..0.3
  // Post-curve remap to match contrast/range
  clampLow: number;       // 0..0.5 percentile-ish lower clamp
  clampHigh: number;      // 0.5..1 upper clamp
  remapBias: number;      // -0.5..0.5 shifts midtones
  remapGain: number;      // 0.5..2.0 contrast; 1 = neutral
  remapGamma: number;     // 0.5..2.0 curve; 1 = neutral
}

const continentScaleFactor = 14; // meters per continent unit relative to max height
const mountainScaleFactor = 4.5;
const riverScaleFactor = 3;
const warpScaleFactor = 3;
const warpStrengthFactor = 0.06;
const hillScaleFactor = 0.25;

export const defaultEarthParams: EarthParams = {
  seed: 12345,
  elevationScale: WORLD_HEIGHT_RANGE,
  continentScale: WORLD_MAX_HEIGHT * continentScaleFactor,
  mountainScale: WORLD_MAX_HEIGHT * mountainScaleFactor,
  mountainWeight: 0.6,
  riverScale: WORLD_MAX_HEIGHT * riverScaleFactor,
  riverWidth: 0.06,
  riverDepth: 0.05,
  seaLevel: 0.18,             // lower sea level to expose more land
  midElevation: WORLD_MIN_HEIGHT + WORLD_HEIGHT_RANGE * 0.5,
  persistence: 0.5,
  steepness: 0.33,
  ridgedOctaves: 6,
  ridgedLacunarity: 2.1,
  ridgedGain: 0.42,
  warpScale: WORLD_MAX_HEIGHT * warpScaleFactor,
  warpStrength: WORLD_HEIGHT_RANGE * warpStrengthFactor,
  // Minor relief defaults tuned to bring out small valleys/mountains
  hillScale: WORLD_MAX_HEIGHT * hillScaleFactor,
  hillWeight: 0.03,
  // Remap neutralized to avoid range collapse; can be re‑enabled later
  clampLow: 0,
  clampHigh: 1,
  remapBias: 0,
  remapGain: 1,
  remapGamma: 1,
};

export class EarthTerrain {
  private perlin: Perlin2D;
  constructor(private params: EarthParams = defaultEarthParams) {
    this.perlin = new Perlin2D(params.seed);
  }

  getParams(): EarthParams {
    return { ...this.params };
  }

  sample01(x: number, z: number): number {
    const p = this.params;
    const ridgedOpts = {
      octaves: p.ridgedOctaves,
      lacunarity: p.ridgedLacunarity,
      gain: p.persistence ?? p.ridgedGain,
      steepness: p.steepness,
    };

    const offset = p.seed * 4096;
    const baseX = x + offset;
    const baseZ = z - offset;

    const warp = fbm2D(this.perlin, baseX / p.warpScale, baseZ / p.warpScale, 3, 2.25, 0.5);
    const warpedX = baseX + warp * p.warpStrength;
    const warpedZ = baseZ + warp * p.warpStrength;

    const continent = smoothRidgedFbm2D(
      this.perlin,
      warpedX / p.continentScale,
      warpedZ / p.continentScale,
      ridgedOpts
    );
    const detail = smoothRidgedFbm2D(
      this.perlin,
      (baseX * 0.85) / p.mountainScale,
      (baseZ * 1.12) / p.mountainScale,
      ridgedOpts
    );

    const coastMask = Math.pow(
      Math.max(0, continent - p.seaLevel) / Math.max(1e-6, 1 - p.seaLevel),
      1 + p.steepness
    );
    let elev = (1 - p.mountainWeight) * coastMask + p.mountainWeight * (coastMask * detail);

    // Gentle high-frequency hills (minor mountains/valleys)
    if (p.hillWeight > 0) {
      const hillRidged = smoothRidgedFbm2D(
        this.perlin,
        baseX / p.hillScale,
        baseZ / p.hillScale,
        {
          ...ridgedOpts,
          octaves: 3,
          gain: Math.min(0.7, (p.persistence ?? 0.5) * 0.9),
          steepness: Math.max(0.08, p.steepness * 0.45),
        }
      );
      const hillDelta = (hillRidged - 0.5) * 2; // -1..1
      const coastFade = Math.min(1, coastMask);
      elev = Math.max(
        0,
        Math.min(1, elev + hillDelta * p.hillWeight * coastFade * (0.5 + 0.5 * elev))
      );
    }

    // River mask: high value along channels -> carve depth
    const r = ridged2D(this.perlin, baseX / p.riverScale, baseZ / p.riverScale, 3, 2.0, 0.55); // [0,1]
    // Convert to a band near zero (channels). ridged peaks at 1 on ridges; we want valleys.
    // Using (1 - r) to get valleys ~1 near channels
    const valleys = 1 - r;
    // Create a bell-shaped band for rivers with width
    const band = Math.max(0, 1 - Math.abs(valleys - 1) / (p.riverWidth)); // ~1 inside channel, 0 outside
    let carved = Math.max(0, elev - band * p.riverDepth * (0.35 + 0.65 * coastMask));

    // Remap to match target contrast/range (clamp -> bias/gain -> gamma)
    const unclamped = carved;
    // Clamp to low/high percentiles
    const clamped = Math.min(1, Math.max(0, (unclamped - p.clampLow) / Math.max(1e-6, (p.clampHigh - p.clampLow))));
    // Bias/Gain functions (Schlick-like)
    const bias = (t: number, b: number) => {
      // b in [-0.5,0.5] -> map to (0,1) parameter
      const k = 0.5 + b; // 0..1
      if (k <= 0) return 0;
      if (k >= 1) return 1;
      return Math.pow(t, Math.log(0.5) / Math.log(k));
    };
    const gain = (t: number, g: number) => {
      // g in (0.5..2) approx, 1 neutral
      if (g === 1) return t;
      const k = g < 1 ? g : 1 / g; // 0..1
      const a = 0.5 * Math.pow(2 * Math.min(t, 1 - t), 1 - k);
      return t < 0.5 ? t - a : t + a;
    };

    let remapped = clamped;
    remapped = bias(remapped, p.remapBias);
    remapped = gain(remapped, p.remapGain);
    if (p.remapGamma !== 1) remapped = Math.pow(Math.max(0, Math.min(1, remapped)), Math.max(0.01, p.remapGamma));

    return Math.max(0, Math.min(1, remapped));
  }

  sampleHeight(x: number, z: number): number {
    const h01 = this.sample01(x, z);
    const scale = this.params.elevationScale ?? WORLD_HEIGHT_RANGE;
    const mid = this.params.midElevation ?? (WORLD_MIN_HEIGHT + scale * 0.5);
    const minBase = mid - scale * 0.5;
    return minBase + h01 * scale;
  }
}


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
