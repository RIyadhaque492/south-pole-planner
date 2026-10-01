/* Real skylines for the candidate sites, computed from NASA LOLA elevation data by terrain/lola_horizons.py
   and shipped as public/terrain/horizons.json. Sites without one (outside the polar DEM) stay smooth-Moon. */
import type { Site } from "./ephemeris";
import { makeSite, type SiteSeed } from "./sites";

export interface TerrainBundle {
  source: string;
  resolution_m: number;
  sites: Record<string, { horizon: number[]; site_height_m: number; lat: number; lon: number; moved_m: number }>;
}

let bundle: TerrainBundle | null = null, ready = false;
let loading: Promise<TerrainBundle | null> | null = null;

export const setTerrain = (b: TerrainBundle | null) => { bundle = b; ready = true; };
export const isTerrainReady = () => ready;
export const terrainSource = () => bundle?.source ?? "";

/** Client side: fetch once. A missing file just means every site stays smooth-Moon. */
export function loadTerrain(): Promise<TerrainBundle | null> {
  if (bundle) return Promise.resolve(bundle);
  loading ??= fetch("/terrain/horizons.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((b) => { setTerrain(b); return b; });
  return loading;
}

/** A site with its LOLA skyline attached (model "terrain"), or the smooth-Moon site if there is none.
    Peak-of-light sites use the LOLA peak position, which can sit up to ~1 km from the published point. */
export function withTerrain(seed: SiteSeed): Site {
  const s = makeSite(seed), t = bundle?.sites[seed.id];
  if (!t) return s;
  return { ...s, lat: t.lat, lon: t.lon, model: "terrain", mask: Float32Array.from(t.horizon), maskName: `NASA LOLA ${bundle!.source}` };
}

/** How far the site was moved onto the LOLA peak, in metres (0 if not moved or no terrain). */
export const movedMetres = (id: string) => bundle?.sites[id]?.moved_m ?? 0;
