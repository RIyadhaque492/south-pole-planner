/* Higher-level sky questions shared by server pages, API routes and client widgets.
   All functions assume the geometry table is loaded. */
import { DAY, HOUR, T_MAX, T_MIN, series, stats, type Stats } from "./ephemeris";
import type { SiteSeed } from "./sites";
import { movedMetres, withTerrain } from "./terrain";

export type { SiteSeed };

export const clampTime = (ms: number) => Math.max(T_MIN, Math.min(ms, T_MAX - 400 * DAY));

export interface SkyNow {
  id: string; name: string; lat: number; lon: number; terrain: boolean; movedM: number;
  sunEl: number; sunAz: number; sunVisible: number; earthEl: number; earthAz: number;
  power: boolean; link: boolean;
}

/** Sun and Earth as seen from a site at one moment, against its LOLA skyline when there is one. */
export function skyNow(seed: SiteSeed, ms: number): SkyNow {
  const s = withTerrain(seed), o = series(s, ms, ms + HOUR, HOUR);
  return {
    id: s.id, name: s.name, lat: s.lat, lon: s.lon, terrain: s.model === "terrain", movedM: movedMetres(s.id),
    sunEl: o.sEl[0], sunAz: o.sAz[0], sunVisible: o.sFrac[0], earthEl: o.eEl[0], earthAz: o.eAz[0],
    power: o.sFrac[0] >= 0.5, link: o.eAlt[0] >= 0,
  };
}

export type SkyEvent = { kind: "sunrise" | "sunset" | "earthrise" | "earthset"; t: number };

export interface Outlook {
  from: number; days: number; stats: Stats;
  events: SkyEvent[];
  /** Hourly-ish samples for sparklines: [sun elevation, earth elevation] every `sampleH` hours. */
  sampleH: number; sun: number[]; earth: number[];
}

/** Stats, next rise/set events and a downsampled elevation trace for the coming `days`. */
export function outlook(seed: SiteSeed, from: number, days: number, sampleH = 3): Outlook {
  const s = withTerrain(seed), o = series(s, from, from + days * DAY, HOUR);
  const events: SkyEvent[] = [];
  for (let i = 1; i < o.n; i++) {
    const t = from + i * HOUR;
    const su = o.sFrac[i] >= 0.5, sw = o.sFrac[i - 1] >= 0.5, eu = o.eAlt[i] >= 0, ew = o.eAlt[i - 1] >= 0;
    if (su && !sw) events.push({ kind: "sunrise", t });
    if (!su && sw) events.push({ kind: "sunset", t });
    if (eu && !ew) events.push({ kind: "earthrise", t });
    if (!eu && ew) events.push({ kind: "earthset", t });
  }
  const sun: number[] = [], earth: number[] = [];
  for (let i = 0; i < o.n; i += sampleH) { sun.push(+o.sEl[i].toFixed(3)); earth.push(+o.eEl[i].toFixed(3)); }
  return { from, days, stats: stats(o, 0), events, sampleH, sun, earth };
}

/** The current moment, kept inside the ephemeris table's range. */
export const currentTime = () => clampTime(Date.now());
