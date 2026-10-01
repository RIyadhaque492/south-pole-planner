/* Sun and Earth geometry from NASA JPL DE421 (with lunar librations), in the Moon ME frame.
   public/geometry.bin is float32 little-endian, one row every 3 h from 2026-01-01:
   sunX sunY sunZ (unit vector) earthX earthY earthZ (km). Built from ephemeris/geometry.json. */

export const D = Math.PI / 180;
export const R_MOON = 1737.4;
export const SUN_R = 0.2666; // apparent solar radius, degrees
export const HOUR = 3600e3;
export const DAY = 86400e3;

const META = { t0: 1767225600000, step: 10800000, n: 20449 };
export const T_MIN = META.t0;
export const T_MAX = META.t0 + (META.n - 1) * META.step;

let table: Float32Array | null = null;
let loading: Promise<Float32Array> | null = null;

export const isGeometryLoaded = () => table !== null;
/** Install the table directly (server side reads it from disk). */
export const setGeometry = (a: Float32Array) => { table = a; };

export function loadGeometry(): Promise<Float32Array> {
  if (table) return Promise.resolve(table);
  loading ??= fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/geometry.bin`)
    .then((r) => {
      if (!r.ok) throw new Error(`geometry.bin: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => (table = new Float32Array(buf)));
  return loading;
}

function geom(ms: number, out: Float64Array) {
  const a = table!;
  let f = (ms - META.t0) / META.step;
  let i = Math.floor(f);
  if (i < 0) { i = 0; f = 0; }
  if (i > META.n - 2) { i = META.n - 2; f = META.n - 1; }
  const w = f - i, p = i * 6, q = p + 6;
  const sx = a[p] + (a[q] - a[p]) * w, sy = a[p + 1] + (a[q + 1] - a[p + 1]) * w, sz = a[p + 2] + (a[q + 2] - a[p + 2]) * w;
  const sn = Math.hypot(sx, sy, sz);
  out[0] = sx / sn; out[1] = sy / sn; out[2] = sz / sn;
  out[3] = a[p + 3] + (a[q + 3] - a[p + 3]) * w;
  out[4] = a[p + 4] + (a[q + 4] - a[p + 4]) * w;
  out[5] = a[p + 5] + (a[q + 5] - a[p + 5]) * w;
  return out;
}

/** Selenographic longitude and latitude (degrees) of the sub-solar and sub-Earth points, and Earth's distance (km), at a moment. */
export function subLongitudes(ms: number) {
  const g = geom(ms, new Float64Array(6));
  const en = Math.hypot(g[3], g[4], g[5]);
  return {
    sun: Math.atan2(g[1], g[0]) / D, sunLat: Math.asin(g[2]) / D,
    earth: Math.atan2(g[4], g[3]) / D, earthLat: Math.asin(g[5] / en) / D, earthKm: en,
  };
}

/* ---------- horizon models ---------- */
export type HorizonModel = "smooth" | "raised" | "terrain";
export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  pub?: number; // published long-term illumination %, terrain studies
  model: HorizonModel;
  raised: number; // metres
  mask: Float32Array | null; // 360 horizon elevations, 1° azimuth steps
  maskName: string;
}

export function horizonFn(s: Site): (az: number) => number {
  if (s.model === "terrain" && s.mask) {
    const m = s.mask;
    return (az) => {
      const f = ((az % 360) + 360) % 360, i = Math.floor(f), w = f - i;
      return m[i] + (m[(i + 1) % 360] - m[i]) * w;
    };
  }
  if (s.model === "raised") {
    const dip = -Math.acos(R_MOON / (R_MOON + s.raised / 1000)) / D;
    return () => dip;
  }
  return () => 0;
}

/** Visible fraction of the solar disk when its centre is x solar radii above the horizon. */
export function diskFrac(x: number) {
  if (x >= 1) return 1;
  if (x <= -1) return 0;
  return 1 - (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI;
}

export interface Series {
  t0: number;
  step: number;
  n: number;
  sEl: Float32Array; sAz: Float32Array; sAlt: Float32Array; sFrac: Float32Array;
  eEl: Float32Array; eAz: Float32Array; eAlt: Float32Array;
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Sun/Earth elevation and azimuth at a site, sampled every `step` ms from t0 to t1. */
export function series(s: Pick<Site, "lat" | "lon"> & Partial<Site>, t0: number, t1: number, step: number): Series {
  const n = Math.max(2, Math.floor((t1 - t0) / step) + 1);
  const la = s.lat * D, lo = s.lon * D, cl = Math.cos(la), sl = Math.sin(la), co = Math.cos(lo), so = Math.sin(lo);
  const up = [cl * co, cl * so, sl], E = [-so, co, 0], N = [-sl * co, -sl * so, cl];
  const P = up.map((v) => v * R_MOON);
  const hz = s.model ? horizonFn(s as Site) : () => 0;
  const g = new Float64Array(6), v = [0, 0, 0];
  const o: Series = {
    t0, step, n,
    sEl: new Float32Array(n), sAz: new Float32Array(n), sAlt: new Float32Array(n), sFrac: new Float32Array(n),
    eEl: new Float32Array(n), eAz: new Float32Array(n), eAlt: new Float32Array(n),
  };
  for (let i = 0; i < n; i++) {
    geom(t0 + i * step, g);
    const el = Math.asin(dot(g, up)) / D;
    const az = (Math.atan2(dot(g, E), dot(g, N)) / D + 360) % 360;
    v[0] = g[3] - P[0]; v[1] = g[4] - P[1]; v[2] = g[5] - P[2];
    const vn = Math.hypot(v[0], v[1], v[2]);
    v[0] /= vn; v[1] /= vn; v[2] /= vn;
    const eel = Math.asin(dot(v, up)) / D;
    const eaz = (Math.atan2(dot(v, E), dot(v, N)) / D + 360) % 360;
    o.sEl[i] = el; o.sAz[i] = az; o.sAlt[i] = el - hz(az); o.sFrac[i] = diskFrac(o.sAlt[i] / SUN_R);
    o.eEl[i] = eel; o.eAz[i] = eaz; o.eAlt[i] = eel - hz(eaz);
  }
  return o;
}

export interface Stats {
  sun: number; earth: number; both: number; power: number; maxDarkH: number; maxNocH: number;
}

export function stats(o: Series, mask: number, a = 0, b = o.n): Stats {
  let sun = 0, earth = 0, both = 0, pow = 0, dark = 0, maxDark = 0, noc = 0, maxNoc = 0;
  for (let i = a; i < b; i++) {
    const p = o.sFrac[i] >= 0.5, e = o.eAlt[i] >= mask;
    sun += +p; earth += +e; both += +(p && e); pow += o.sFrac[i];
    dark = p ? 0 : dark + 1; if (dark > maxDark) maxDark = dark;
    noc = e ? 0 : noc + 1; if (noc > maxNoc) maxNoc = noc;
  }
  const n = b - a, h = o.step / HOUR;
  return { sun: sun / n, earth: earth / n, both: both / n, power: pow / n, maxDarkH: maxDark * h, maxNocH: maxNoc * h };
}

export const stepFor = (span: number) => (span <= 61 * DAY ? HOUR : span <= 190 * DAY ? 2 * HOUR : 3 * HOUR);

/** Parse a horizon CSV (azimuth_deg,horizon_deg per line, "# key: value" metadata) into a 1°-step mask. */
export function parseHorizonCsv(txt: string) {
  const meta: Record<string, string> = {}, pts: [number, number][] = [];
  for (const raw of txt.split(/\r?\n/)) {
    const ln = raw.trim();
    if (!ln) continue;
    if (ln.startsWith("#")) {
      const m = ln.match(/^#\s*(\w+)\s*:\s*(.*)$/);
      if (m) meta[m[1]] = m[2];
      continue;
    }
    const [a, b] = ln.split(/[,;\s]+/).map(Number);
    if (isFinite(a) && isFinite(b)) pts.push([((a % 360) + 360) % 360, b]);
  }
  if (pts.length < 8) return null;
  pts.sort((a, b) => a[0] - b[0]);
  const mask = new Float32Array(360);
  for (let az = 0; az < 360; az++) {
    let j = pts.findIndex((p) => p[0] >= az);
    if (j < 0) j = 0;
    const p1 = pts[j], p0 = pts[(j - 1 + pts.length) % pts.length];
    const span = (p1[0] - p0[0] + 360) % 360 || 360, w = ((az - p0[0] + 360) % 360) / span;
    mask[az] = p0[1] + (p1[1] - p0[1]) * w;
  }
  return { mask, meta };
}
