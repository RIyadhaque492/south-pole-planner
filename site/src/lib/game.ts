/* Race the Shadow: simulation core. One step = one hour. Balance notes live in GAME_DESIGN.md. */
import { D, DAY, HOUR, series, type Series } from "./ephemeris";
import { SITE_SEEDS, seedById } from "./sites";

/* =====================================================================
   GAME BALANCE: tweak these numbers. Power in watts, energy in Wh,
   data in MB, time steps are 1 hour.
   ===================================================================== */
export const CFG = {
  solarW: 300,        // panel output in full sunlight
  batteryWh: 4800,    // battery capacity
  avionicsW: 40,      // computer + sensors while awake
  heaterDarkW: 30,    // extra heating when the Sun is down (awake)
  hibernateW: 13,     // everything off except survival heaters
  scienceW: 60, scienceMB: 1,   // per hour
  radioW: 25, radioMB: 4,       // per hour, only when Earth is up and there is data
  storageMB: 48,      // onboard memory
};

export type SiteRef = { id: string; name: string; lat: number; lon: number };
export const GAME_SITES: SiteRef[] = SITE_SEEDS.filter((s) => s.id !== "C3");
export const siteById = (id: string): SiteRef => seedById(id);

/** Hourly sky for a site, from t0 for `hours` hours (n = hours + 1 samples). */
export const hourly = (s: SiteRef, t0: number, hours: number) => series(s, t0, t0 + hours * HOUR, HOUR);

export type ScnKey = "vikram" | "tipped" | "peak" | "daily";
export interface Scenario {
  site: SiteRef; land: number; hours: number; battery: number;
  winBy: "survive" | "data" | "score"; stars: number[];
  target?: number; panelAz?: number; nightH?: number;
  /** The UTC date a daily challenge belongs to. */
  day?: string;
}

const SCN_START = Date.UTC(2026, 9, 10);
function findFrom(site: SiteRef, from: number, hours: number, test: (o: Series, i: number) => boolean) {
  const o = hourly(site, from, hours);
  for (let i = 1; i < o.n; i++) if (test(o, i)) return from + i * HOUR;
  return null;
}
const rises = (o: Series, i: number) => o.sFrac[i] >= 0.5 && o.sFrac[i - 1] < 0.5;
const sets = (o: Series, i: number) => o.sFrac[i] < 0.5 && o.sFrac[i - 1] >= 0.5;

/** The UTC day as YYYY-MM-DD: everyone playing on the same day gets the same daily challenge. */
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** A sensible player, used to set the star scores for a daily challenge. */
const steady = (s: SimState, o: Series) => {
  const dark = o.sFrac[s.i] < 0.5;
  s.hib = dark; s.rad = true; s.sci = !dark && s.bat / CFG.batteryWh > 0.3 && s.stored < CFG.storageMB;
};

export const SCENARIOS: Record<ScnKey, { icon: "night" | "tipped" | "peak"; diff: "hard" | "med" | "easy"; needsSetup?: boolean; build: (siteId?: string, land?: number) => Scenario }> = {
  vikram: {
    icon: "night", diff: "hard",
    build() {
      const site = siteById("C3");
      const land = findFrom(site, SCN_START, 24 * 40, rises)! + 6 * HOUR;
      const set = findFrom(site, land, 24 * 25, sets)!;
      const rise = findFrom(site, set, 24 * 25, rises)!;
      return { site, land, hours: Math.round((rise - land) / HOUR) + 36, battery: 0.55, winBy: "survive",
               stars: [1, 330, 390], nightH: Math.round((rise - set) / HOUR) };
    },
  },
  tipped: {
    icon: "tipped", diff: "med",
    build() {
      const site = siteById("M1");
      const land = findFrom(site, Date.UTC(2026, 10, 1), 24 * 40, (o, i) => rises(o, i) && o.eEl[i] >= 0)! + 12 * HOUR;
      const o = hourly(site, land, 24);
      const dAz = ((o.sAz[24] - o.sAz[0] + 540) % 360) - 180, dir = Math.sign(dAz) || 1;
      const panelAz = (o.sAz[0] + 120 * dir + 360) % 360; // panel starts facing away from the Sun
      return { site, land, hours: 240, battery: 0.45, panelAz, winBy: "data", target: 120, stars: [120, 140, 160] };
    },
  },
  peak: {
    icon: "peak", diff: "easy", needsSetup: true,
    build(siteId = "B", land = Date.UTC(2026, 9, 15)) {
      return { site: siteById(siteId), land, hours: 336, battery: 0.8, winBy: "score", stars: [150, 240, 300] };
    },
  },
  daily: {
    icon: "peak", diff: "med",
    // One site and landing date per UTC day, picked from the date so every player gets the same mission.
    build(_site, today = Date.now()) {
      let seed = (Math.floor(today / DAY) * 2654435761) % 2147483647;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      rnd(); rnd();
      const site = GAME_SITES[Math.floor(rnd() * GAME_SITES.length)];
      const from = Date.UTC(2026, 9, 1) + Math.floor(rnd() * 440) * DAY;
      const land = (findFrom(site, from, 24 * 40, rises) ?? from) + 6 * HOUR;
      const sc: Scenario = { site, land, hours: 240, battery: 0.6, winBy: "score", stars: [5, 5, 5], day: dayKey(today) };
      const par = simulate(sc, steady).s.sent;
      sc.stars = [0.5, 0.75, 0.95].map((k) => Math.max(5, Math.round(par * k)));
      return sc;
    },
  },
};

export interface SimState {
  i: number; bat: number; stored: number; sent: number; lost: number;
  sci: boolean; rad: boolean; hib: boolean; dead: boolean; done: boolean;
  minBat: number; darkH: number; batHist: number[]; solarW: number; loadW: number; sending: boolean;
}

export const newState = (sc: Scenario): SimState => ({
  i: 0, bat: CFG.batteryWh * sc.battery, stored: 0, sent: 0, lost: 0, sci: true, rad: true, hib: false,
  dead: false, done: false, minBat: 1, darkH: 0, batHist: [], solarW: 0, loadW: 0, sending: false,
});

export function panelFactor(sc: Scenario, o: Series, i: number) {
  if (sc.panelAz == null) return 1; // upright lander with vertical panels
  return Math.max(0, Math.cos((o.sAz[i] - sc.panelAz) * D));
}

export function step(sc: Scenario, o: Series, s: SimState) {
  const i = s.i, sun = o.sFrac[i], earthUp = o.eEl[i] >= 0;
  const solar = CFG.solarW * sun * panelFactor(sc, o, i);
  let load: number, sending = false;
  if (s.hib) load = CFG.hibernateW;
  else {
    load = CFG.avionicsW + (sun < 0.5 ? CFG.heaterDarkW : 0);
    if (s.sci) {
      load += CFG.scienceW;
      const room = CFG.storageMB - s.stored, got = Math.min(room, CFG.scienceMB);
      s.stored += got; s.lost += CFG.scienceMB - got;
    }
    if (s.rad && earthUp && s.stored > 0) {
      load += CFG.radioW; sending = true;
      const x = Math.min(s.stored, CFG.radioMB); s.stored -= x; s.sent += x;
    }
  }
  s.solarW = solar; s.loadW = load; s.sending = sending;
  s.bat = Math.min(CFG.batteryWh, s.bat + solar - load);
  if (sun < 0.5) s.darkH++;
  s.batHist.push(Math.max(0, s.bat / CFG.batteryWh));
  s.minBat = Math.min(s.minBat, Math.max(0, s.bat / CFG.batteryWh));
  if (s.bat <= 0) { s.bat = 0; s.dead = true; }
  s.i++;
  if (s.i >= sc.hours) s.done = true;
}

export function starsFor(sc: Scenario, s: SimState) {
  if (s.dead && sc.winBy === "survive") return 0;
  const th = sc.stars;
  let n = 0;
  if (sc.winBy === "survive") { n = 1; if (s.sent >= th[1]) n = 2; if (s.sent >= th[2]) n = 3; }
  else for (const x of th) if (s.sent >= x) n++;
  return s.dead ? Math.min(n, 1) : n;
}

/** Headless run with a scripted player, for balance tests. */
export function simulate(sc: Scenario, policy: (s: SimState, o: Series, sc: Scenario) => void) {
  const o = hourly(sc.site, sc.land, sc.hours + 130), s = newState(sc);
  while (!s.dead && !s.done) { policy(s, o, sc); step(sc, o, s); }
  return { s, stars: starsFor(sc, s) };
}
