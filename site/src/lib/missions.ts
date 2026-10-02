/* Real CLPS landings, replayed on the same engine as the Planner.
   Landing times, coordinates and outcomes are from NASA and the mission teams' public reports.
   These sites have no LOLA skyline in the app, so the sky is computed on a smooth Moon. */
import { D, DAY, HOUR, SUN_R, series, subLongitudes, type Series } from "./ephemeris";

const R_EARTH = 6378.14;
const MIN10 = 10 * 60e3;

export interface Mission {
  id: "im1" | "bg1" | "im2";
  name: string; lander: string; org: string; place: string;
  lat: number; lon: number;
  /** Touchdown and last contact, UTC. `endDay` is shown instead of a time when only the date was reported. */
  land: number; end: number;
  /** How far the lander leaned after touchdown, radians (0 = upright). */
  tilt: number;
  /** True when the lander ended up shaded by terrain the smooth-Moon model cannot see. */
  shaded: boolean;
}

export const MISSIONS: Mission[] = [
  {
    id: "im1", name: "IM-1", lander: "Odysseus", org: "Intuitive Machines", place: "Malapert A",
    lat: -80.13, lon: 1.44, land: Date.UTC(2024, 1, 22, 23, 23), end: Date.UTC(2024, 1, 29, 12), tilt: -0.52, shaded: false,
  },
  {
    id: "bg1", name: "Blue Ghost Mission 1", lander: "Blue Ghost", org: "Firefly Aerospace", place: "Mare Crisium",
    lat: 18.56, lon: 61.81, land: Date.UTC(2025, 2, 2, 8, 34), end: Date.UTC(2025, 2, 16, 23, 15), tilt: 0, shaded: false,
  },
  {
    id: "im2", name: "IM-2", lander: "Athena", org: "Intuitive Machines", place: "Mons Mouton",
    lat: -84.79, lon: 29.2, land: Date.UTC(2025, 2, 6, 17, 28), end: Date.UTC(2025, 2, 7, 12), tilt: -1.25, shaded: true,
  },
];

export interface Replay {
  m: Mission;
  /** Sky every 10 minutes, from two days before touchdown until after the following sunset. */
  o: Series;
  iLand: number; iEnd: number;
  sunAtLanding: number; earthAtLanding: number;
  /** Model sunrise before touchdown and sunset after it (ms), when they fall inside the replay. */
  sunrise: number | null; sunset: number | null;
  /** Start and end (ms) of the Sun passing fully behind Earth, as seen from the site. */
  eclipse: [number, number] | null;
}

/** Angle between the Sun and Earth in the site's sky, degrees. */
const separation = (o: Series, i: number) => Math.acos(Math.min(1, Math.max(-1,
  Math.sin(o.sEl[i] * D) * Math.sin(o.eEl[i] * D) + Math.cos(o.sEl[i] * D) * Math.cos(o.eEl[i] * D) * Math.cos((o.sAz[i] - o.eAz[i]) * D)))) / D;

export function replay(m: Mission): Replay {
  const from = Math.floor((m.land - 2 * DAY) / HOUR) * HOUR, to = Math.max(m.end + 3 * DAY, m.land + 16 * DAY);
  const o = series(m, from, to, MIN10);
  const at = (ms: number) => Math.max(0, Math.min(o.n - 1, Math.round((ms - from) / MIN10)));
  const iLand = at(m.land), iEnd = at(m.end), up = (i: number) => o.sFrac[i] >= 0.5;
  let sunrise: number | null = null, sunset: number | null = null, eclipse: [number, number] | null = null;
  for (let i = iLand; i > 0; i--) if (up(i) && !up(i - 1)) { sunrise = from + i * MIN10; break; }
  for (let i = iLand + 1; i < o.n; i++) if (!up(i) && up(i - 1)) { sunset = from + i * MIN10; break; }
  for (let i = iLand; i <= iEnd; i++) { // only an eclipse the lander was alive to see
    if (o.sEl[i] < 0 || separation(o, i) > 1) continue;
    const t = from + i * MIN10, earthR = Math.asin(R_EARTH / subLongitudes(t).earthKm) / D;
    if (separation(o, i) < earthR - SUN_R) eclipse = [eclipse?.[0] ?? t, t];
  }
  return { m, o, iLand, iEnd, sunAtLanding: o.sEl[iLand], earthAtLanding: o.eEl[iLand], sunrise, sunset, eclipse };
}
