/* Illustrative relief of the lunar south pole and a fast cast-shadow renderer.
   The terrain is procedural (shaped after Shackleton, the connecting ridge and de Gerlache), the lighting is not:
   the Sun's direction and height come from the JPL ephemeris for the displayed moment.

   Map convention matches the Planner: looking down on the pole, 0° longitude up, 90°E right.
   World units: 1 = EXTENT_DEG degrees of colatitude from the pole. */

export const EXTENT_DEG = 1.8;
const KM_PER_DEG = 30.32, R_MOON = 1737.4;
export const KM_PER_UNIT = EXTENT_DEG * KM_PER_DEG;
const GRID = 256, HALF = 1.15; // heightmap covers [-HALF, HALF]^2

export const toWorld = (lat: number, lon: number) => {
  const r = (90 + lat) / EXTENT_DEG, a = (lon * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)] as const;
};

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}
function valueNoise(seed: number, cells: number) {
  const r = rng(seed), g = Array.from({ length: (cells + 1) ** 2 }, () => r() * 2 - 1);
  const at = (i: number, j: number) => g[j * (cells + 1) + i];
  return (x: number, y: number) => {
    const fx = ((x + HALF) / (2 * HALF)) * cells, fy = ((y + HALF) / (2 * HALF)) * cells;
    const i = Math.max(0, Math.min(cells - 1, Math.floor(fx))), j = Math.max(0, Math.min(cells - 1, Math.floor(fy)));
    const u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
    return a + (b - a) * sv;
  };
}

/** Heights in km on a GRID x GRID lattice. */
export function buildHeightmap(): Float32Array {
  const h = new Float32Array(GRID * GRID);
  const n1 = valueNoise(11, 6), n2 = valueNoise(23, 18), n3 = valueNoise(37, 48);
  type Crater = { x: number; y: number; r: number; depth: number; rim: number };
  const craters: Crater[] = [];
  const add = (lat: number, lon: number, rKm: number, depth: number, rim: number) => {
    const [x, y] = toWorld(lat, lon);
    craters.push({ x, y, r: rKm / KM_PER_UNIT, depth, rim });
  };
  add(-89.67, 129.8, 10.5, 4.2, 0.55);   // Shackleton
  add(-88.5, -87.1, 16.5, 3.2, 0.45);    // de Gerlache
  add(-88.1, 176, 13, 2.4, 0.35);        // (near Sverdrup side, illustrative)
  add(-87.9, 78, 20, 2.8, 0.4);          // Faustini-like
  add(-88.9, 60, 9, 1.8, 0.3);
  const r = rng(5);
  for (let k = 0; k < 70; k++) {
    const rad = 0.018 + Math.pow(r(), 3.2) * 0.16, ang = r() * Math.PI * 2, dist = Math.sqrt(r()) * 1.15;
    const km = rad * KM_PER_UNIT;
    craters.push({ x: dist * Math.sin(ang), y: -dist * Math.cos(ang), r: rad, depth: Math.min(2.6, km * 0.38), rim: Math.min(0.4, km * 0.05) });
  }
  // raised ground the candidate sites sit on
  const bumps: { x: number; y: number; s: number; hgt: number }[] = [];
  const bump = (lat: number, lon: number, sKm: number, hgt: number) => { const [x, y] = toWorld(lat, lon); bumps.push({ x, y, s: sKm / KM_PER_UNIT, hgt }); };
  bump(-89.68, -166, 3.5, 0.5); bump(-89.44, -141.8, 5, 0.9); bump(-88.71, -68.7, 4, 0.8); bump(-88.79, 124.5, 4.5, 1.0);
  // connecting ridge: Shackleton rim toward de Gerlache
  const [ax, ay] = toWorld(-89.44, -141.8), [bx, by] = toWorld(-88.75, -80);

  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = -HALF + (i / (GRID - 1)) * 2 * HALF, y = -HALF + (j / (GRID - 1)) * 2 * HALF;
      let z = n1(x, y) * 0.6 + n2(x, y) * 0.18 + n3(x, y) * 0.05;
      for (const c of craters) {
        const d = Math.hypot(x - c.x, y - c.y) / c.r;
        if (d > 3) continue;
        if (d < 1) z += -c.depth * (1 - d * d) + c.rim;
        else z += c.rim * Math.exp(-(((d - 1) / 0.35) ** 2)) + c.rim * 0.25 * Math.exp(-(d - 1) * 1.5);
      }
      for (const b of bumps) z += b.hgt * Math.exp(-(((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.s * b.s)));
      // ridge: distance to segment a-b
      const vx = bx - ax, vy = by - ay, tt = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
      const dr = Math.hypot(x - (ax + vx * tt), y - (ay + vy * tt));
      z += 0.9 * Math.exp(-((dr / 0.07) ** 2)) * (0.6 + 0.4 * Math.sin(tt * 9));
      // curvature of the Moon: ground drops away from the pole
      const rk = Math.hypot(x, y) * KM_PER_UNIT;
      z -= (rk * rk) / (2 * R_MOON);
      h[j * GRID + i] = z;
    }
  }
  return h;
}

function sampler(h: Float32Array) {
  const k = (GRID - 1) / (2 * HALF);
  return (x: number, y: number) => {
    const fx = Math.max(0, Math.min(GRID - 1.001, (x + HALF) * k)), fy = Math.max(0, Math.min(GRID - 1.001, (y + HALF) * k));
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, p = j * GRID + i;
    const a = h[p] + (h[p + 1] - h[p]) * u, b = h[p + GRID] + (h[p + GRID + 1] - h[p + GRID]) * u;
    return a + (b - a) * v;
  };
}

export interface ShadeFrame {
  image: ImageData;   // M x M, rows run away from the Sun; draw it rotated by sunLon
  lit: Uint8Array;    // 1 where the ground sees the Sun
  M: number; E: number;
}

/**
 * Render relief lit by a Sun at longitude `sunLon` and elevation `sunEl` (degrees, as seen from the pole).
 * Sweep-line shadows: walk each column away from the Sun, carrying the height of the shadow line down
 * by tan(elevation) per step; ground below the line is in shadow.
 */
const PENUMBRA_KM = 0.12;

export function makeShader(h: Float32Array, M = 320, E = 1.03) {
  const sample = sampler(h);
  const image = new ImageData(M, M), px = image.data, lit = new Uint8Array(M * M);
  const du = (2 * E) / (M - 1), duKm = du * KM_PER_UNIT;
  return (sunLon: number, sunEl: number): ShadeFrame => {
    const L = (sunLon * Math.PI) / 180, cL = Math.cos(L), sL = Math.sin(L);
    const tanEl = Math.tan((sunEl * Math.PI) / 180);
    for (let c = 0; c < M; c++) {
      const a = -E + c * du;
      let top = -1e9, prev = 0;
      for (let r = 0; r < M; r++) {
        const b = -E + r * du; // b < 0 is toward the Sun
        const x = a * cL - b * sL, y = a * sL + b * cL;
        const z = sample(x, y);
        if (r === 0) { top = z; prev = z; }
        top -= duKm * tanEl;
        const k = r * M + c, o = k * 4;
        const slope = (prev - z) / duKm; // positive when the ground rises toward the Sun
        prev = z;
        // Soft edge: the Sun is a half-degree disc, so shadow edges blur over a short height band.
        const lightK = z >= top ? 1 : Math.max(0, 1 + (z - top) / PENUMBRA_KM);
        if (z >= top) top = z;
        lit[k] = lightK > 0.5 ? 1 : 0;
        const bright = Math.max(0.18, Math.min(1, 0.3 + (tanEl + slope) * 3.2));
        const relief = Math.max(0, Math.min(1, 0.5 + slope * 1.4));
        const dr = 9 + 10 * relief, dg = 12 + 12 * relief, db = 18 + 18 * relief;
        px[o] = dr + (70 + 170 * bright - dr) * lightK;
        px[o + 1] = dg + (66 + 160 * bright - dg) * lightK;
        px[o + 2] = db + (60 + 142 * bright - db) * lightK;
        px[o + 3] = 255;
      }
    }
    return { image, lit, M, E };
  };
}

/** Is world point (x, y) lit in a frame rendered for `sunLon`? */
export function litAt(f: ShadeFrame, sunLon: number, x: number, y: number) {
  const L = (sunLon * Math.PI) / 180, cL = Math.cos(L), sL = Math.sin(L);
  const a = x * cL + y * sL, b = -x * sL + y * cL, du = (2 * f.E) / (f.M - 1);
  const c = Math.round((a + f.E) / du), r = Math.round((b + f.E) / du);
  if (c < 0 || r < 0 || c >= f.M || r >= f.M) return false;
  return f.lit[r * f.M + c] === 1;
}
