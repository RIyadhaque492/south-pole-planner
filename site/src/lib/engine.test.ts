/* Guards for the science. Run with `npm test`. */
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { DAY, HOUR, T_MAX, T_MIN, series, setGeometry, stats, subLongitudes, type Series } from "./ephemeris";
import { SCENARIOS, dayKey, simulate } from "./game";
import { MISSIONS, replay } from "./missions";
import { runTool } from "./server/luna";
import { skyNow } from "./sky";
import { SITE_SEEDS, makeSite, seedById } from "./sites";
import { setTerrain, withTerrain, type TerrainBundle } from "./terrain";

const repo = path.resolve(__dirname, "../../..");
const site = path.join(repo, "site");

beforeAll(() => {
  const b = readFileSync(path.join(site, "public/geometry.bin"));
  setGeometry(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
  setTerrain(JSON.parse(readFileSync(path.join(site, "public/terrain/horizons.json"), "utf8")) as TerrainBundle);
});

/** The original single-file Planner engine (web/app.template.html), run as-is on the original JSON table. */
function originalEngine() {
  const html = readFileSync(path.join(repo, "web/app.template.html"), "utf8");
  const code = html.slice(html.indexOf("const D = Math.PI / 180"), html.indexOf("/* ---------- formatting"));
  const GEOMETRY = JSON.parse(readFileSync(path.join(repo, "ephemeris/geometry.json"), "utf8"));
  return vm.runInNewContext(code + "\n;({ series, stats })", { GEOMETRY, atob, Math, Float32Array, Float64Array, ArrayBuffer, Uint8Array }) as {
    series: (s: object, t0: number, t1: number, step: number) => Series;
  };
}

const wrap = (d: number) => Math.abs(((d + 540) % 360) - 180);

describe("ephemeris port", () => {
  it("matches the original validated engine at every site and across the whole table", () => {
    const orig = originalEngine();
    const starts = [Date.UTC(2026, 9, 1), Date.UTC(2028, 5, 15), Date.UTC(2031, 11, 1)];
    let worst = 0;
    for (const seed of SITE_SEEDS) {
      for (const t0 of starts) {
        const s = makeSite(seed), a = series(s, t0, t0 + 30 * DAY, 3 * HOUR), b = orig.series(s, t0, t0 + 30 * DAY, 3 * HOUR);
        expect(a.n).toBe(b.n);
        for (let i = 0; i < a.n; i++) {
          worst = Math.max(worst, Math.abs(a.sEl[i] - b.sEl[i]), Math.abs(a.eEl[i] - b.eEl[i]), wrap(a.sAz[i] - b.sAz[i]), wrap(a.eAz[i] - b.eAz[i]));
        }
      }
    }
    expect(worst).toBeLessThan(1e-4); // degrees
  });

  it("stays inside the physical ranges quoted in the README", () => {
    let maxSubSolar = 0, minKm = Infinity, maxKm = 0;
    for (let t = T_MIN; t <= T_MAX; t += 3 * HOUR) {
      const g = subLongitudes(t);
      maxSubSolar = Math.max(maxSubSolar, Math.abs(g.sunLat));
      minKm = Math.min(minKm, g.earthKm); maxKm = Math.max(maxKm, g.earthKm);
    }
    expect(maxSubSolar).toBeGreaterThan(1.5);
    expect(maxSubSolar).toBeLessThan(1.6);   // Moon's axial tilt to the ecliptic: 1.54 deg
    expect(minKm).toBeGreaterThan(356_000);  // perigee
    expect(maxKm).toBeLessThan(407_000);     // apogee
  });
});

describe("LOLA terrain", () => {
  it("has a full, finite skyline for every polar site", () => {
    for (const seed of SITE_SEEDS.filter((s) => s.lat < -75)) {
      const s = withTerrain(seed);
      expect(s.model).toBe("terrain");
      expect(s.mask).toHaveLength(360);
      expect(Array.from(s.mask!).every(Number.isFinite)).toBe(true);
    }
    expect(withTerrain(seedById("C3")).model).toBe("smooth"); // 69 S is outside the polar DEM
  });

  it("lights the peak-of-light sites far better than a smooth Moon, near their published long-term figures", () => {
    const t0 = Date.UTC(2027, 0, 1), t1 = Date.UTC(2031, 0, 1);
    for (const seed of SITE_SEEDS.filter((s) => s.pub)) {
      const real = stats(series(withTerrain(seed), t0, t1, 3 * HOUR), 0).sun * 100;
      const flat = stats(series(makeSite(seed), t0, t1, 3 * HOUR), 0).sun * 100;
      expect(real, seed.id).toBeGreaterThan(flat + 10);            // smooth Moon: ~50% everywhere
      // Published 74-86% came from finer terrain models and multi-decade averages. Most sites land within
      // 8 points; ridge B is the known outlier (61% vs 82%), so the guard allows 22.
      expect(Math.abs(real - seed.pub!), seed.id).toBeLessThan(22);
    }
  });

  it("puts the LCROSS impact site in Cabeus in permanent shadow, as observed", () => {
    const t0 = Date.UTC(2027, 0, 1), o = series(withTerrain(seedById("LC")), t0, t0 + 365 * DAY, 3 * HOUR);
    expect(stats(o, 0).sun).toBe(0);
    // ...while a smooth Moon would wrongly light it about half the time
    expect(stats(series(makeSite(seedById("LC")), t0, t0 + 365 * DAY, 3 * HOUR), 0).sun).toBeGreaterThan(0.4);
  });
});

describe("Race the Shadow balance (GAME_DESIGN.md)", () => {
  it("Vikram's Night: hibernating at sunset survives with 399 MB and 3 stars", () => {
    const sc = SCENARIOS.vikram.build();
    const r = simulate(sc, (s, o) => { s.hib = o.sFrac[s.i] < 0.5; });
    expect(sc.nightH).toBe(339);
    expect(r.s.dead).toBe(false);
    expect(Math.round(r.s.sent)).toBe(399);
    expect(r.stars).toBe(3);
  });

  it("Vikram's Night: leaving everything on freezes at hour 395", () => {
    const r = simulate(SCENARIOS.vikram.build(), () => {});
    expect(r.s.dead).toBe(true);
    expect(r.s.i).toBe(395);
  });
});

describe("real CLPS landings", () => {
  const at = (id: string) => replay(MISSIONS.find((m) => m.id === id)!);
  const utc = (...a: [number, number, number, number, number]) => Date.UTC(...a);

  it("Blue Ghost: lands just after sunrise and loses the Sun on the evening of its last contact", () => {
    const r = at("bg1");
    expect(Math.abs(r.sunrise! - utc(2025, 2, 2, 1, 34))).toBeLessThan(30 * 60e3);
    expect(Math.abs(r.sunset! - utc(2025, 2, 16, 20, 14))).toBeLessThan(30 * 60e3);
    expect(r.m.end - r.sunset!).toBeGreaterThan(0);
    expect(r.m.end - r.sunset!).toBeLessThan(6 * HOUR);
  });

  it("Blue Ghost: the Sun passes fully behind Earth on 14 March 2025", () => {
    const [a, b] = at("bg1").eclipse!;
    expect(Math.abs(a - utc(2025, 2, 14, 6, 18))).toBeLessThan(20 * 60e3);
    expect(Math.abs(b - utc(2025, 2, 14, 8, 34))).toBeLessThan(20 * 60e3);
  });

  it("IM-1 and IM-2: the Sun is up but low at touchdown", () => {
    expect(at("im1").sunAtLanding).toBeCloseTo(10.5, 0);
    expect(at("im2").sunAtLanding).toBeCloseTo(2.5, 0);
    expect(at("im1").eclipse).toBeNull();
    expect(at("im2").eclipse).toBeNull(); // the March 2025 eclipse came a week after Athena went silent
  });
});

describe("daily challenge", () => {
  it("is the same mission all day and changes the next day", () => {
    const noon = Date.UTC(2026, 9, 2, 12), a = SCENARIOS.daily.build(undefined, noon), b = SCENARIOS.daily.build(undefined, noon + 6 * HOUR);
    expect(a.day).toBe(dayKey(noon));
    expect([b.site.id, b.land, b.stars]).toEqual([a.site.id, a.land, a.stars]);
    const week = Array.from({ length: 7 }, (_, k) => SCENARIOS.daily.build(undefined, noon + k * DAY));
    expect(new Set(week.map((s) => s.site.id + s.land)).size).toBeGreaterThan(3);
    for (const s of week) expect(s.stars[2]).toBeGreaterThanOrEqual(s.stars[0]);
  });
});

describe("Luna's tools", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool results are plain JSON for the model
  const call = (name: string, input: Record<string, unknown>): any => runTool(name, input);

  it("answer from the same engine as the pages", () => {
    const now = call("sites_now", { time: "2026-12-01T00:00:00Z" });
    expect(now.sites).toHaveLength(SITE_SEEDS.length);
    const b = skyNow(seedById("B"), Date.UTC(2026, 11, 1));
    expect(now.sites.find((s: { id: string }) => s.id === "B").hasSunlightForPower).toBe(b.power);

    const cmp = call("compare_sites", { start: "2026-12-01", days: 30 });
    const best = cmp.sites.map((s: { powerAndRadioTogetherPercent: number }) => s.powerAndRadioTogetherPercent);
    expect(best).toEqual([...best].sort((x, y) => y - x));

    const one = call("site_outlook", { site: "shackleton ridge", start: "2026-12-01", days: 30 });
    expect(one.id).toBe("B");
    expect(one.powerAndRadioTogetherPercent).toBe(cmp.sites.find((s: { id: string }) => s.id === "B").powerAndRadioTogetherPercent);
    expect(call("site_outlook", { site: "nowhere", days: 5 }).error).toContain("Unknown site");
    expect(call("no_such_tool", {}).error).toBeDefined();

    expect(call("real_missions", {}).missions.map((m: { lander: string }) => m.lander)).toEqual(MISSIONS.map((m) => m.lander));
  });
});
