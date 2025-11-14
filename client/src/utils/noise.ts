// Simple 2D Perlin Noise implementation adapted for TS
// Source approach: Ken Perlin's improved noise with permutations

export class Perlin2D {
  private perm: number[];

  constructor(seed = 1337) {
    this.perm = new Array(512);
    const p = new Array(256);
    // Seeded LCG
    let s = seed >>> 0;
    const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher–Yates shuffle based on seed
    for (let i = 255; i > 0; i--) {
      const r = Math.floor(rand() * (i + 1));
      const tmp = p[i]; p[i] = p[r]; p[r] = tmp;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
  private lerp(t: number, a: number, b: number) { return a + t * (b - a); }
  private grad(hash: number, x: number, y: number) {
    // 8 gradient directions
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x: number, y: number) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.perm[X    + this.perm[Y   ]];
    const ab = this.perm[X    + this.perm[Y+1 ]];
    const ba = this.perm[X+1  + this.perm[Y   ]];
    const bb = this.perm[X+1  + this.perm[Y+1 ]];

    const x1 = this.lerp(u, this.grad(aa, xf    , yf    ), this.grad(ba, xf-1  , yf    ));
    const x2 = this.lerp(u, this.grad(ab, xf    , yf-1  ), this.grad(bb, xf-1  , yf-1  ));
    return this.lerp(v, x1, x2); // range approx [-1,1]
  }
}

export const fbm2D = (
  perlin: Perlin2D,
  x: number,
  y: number,
  octaves = 5,
  lacunarity = 2,
  gain = 0.5
) => {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * perlin.noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / (norm || 1); // approx [-1,1]
};

export const ridged2D = (
  perlin: Perlin2D,
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5
) => {
  // Ridged fractal: invert abs to create sharp ridges/valleys
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = perlin.noise(x * freq, y * freq);
    const r = 1 - Math.abs(n);
    sum += r * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / (norm || 1); // [0,1]
};

export interface RidgedFbmOptions {
  octaves?: number;
  lacunarity?: number;
  gain?: number;
  steepness?: number;
}

export const smoothRidgedFbm2D = (
  perlin: Perlin2D,
  x: number,
  y: number,
  options: RidgedFbmOptions = {}
) => {
  const octaves = options.octaves ?? 5;
  const lacunarity = options.lacunarity ?? 2.0;
  const gain = options.gain ?? 0.45;
  const steepness = Math.max(0, options.steepness ?? 0.33);

  let sum = 0;
  let freq = 1;
  let amp = 0.5;
  let weight = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    const n = perlin.noise(x * freq, y * freq);
    let ridge = 1 - Math.abs(n);
    ridge = Math.max(0, Math.pow(ridge, 1 + steepness * 2));

    const contribution = ridge * amp * weight;
    sum += contribution;
    norm += amp * weight;
    weight = Math.max(0.2, ridge);

    freq *= lacunarity;
    amp *= gain;
  }

  return sum / (norm || 1); // 0..1
};
