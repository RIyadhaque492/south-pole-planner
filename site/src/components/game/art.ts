"use client";
import type { Series } from "@/lib/ephemeris";
import { CFG, panelFactor, type Scenario, type SimState } from "@/lib/game";
import { css, setupCanvas } from "@/lib/canvas";

const FOIL = "#d9a93f", SUN = "#f2a93b", EARTH = "#6ea7f2", DATA = "#6cc083", TAU = Math.PI * 2, D = Math.PI / 180;
const TILT = -1.25; // how far the tipped lander leans, radians
type Ctx = CanvasRenderingContext2D;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export type Mood = "awake" | "happy" | "worry" | "sleep" | "dead";
type LanderLook = {
  /** Seconds, drives blinking and flicker. */
  t?: number; mood?: Mood; charge?: number; frost?: boolean; warn?: boolean;
  /** Lean in radians; the tipped lander rests at TILT. */
  tilt?: number;
  /** Screen-space angle the dish points at. */
  antAng?: number;
  /** Where the eyes look, unit vector in screen space. */
  look?: [number, number];
  /** Descent engine, 0..1. */
  flame?: number;
};

/** Screen position of a point given in the lander's own coordinates. */
export function landerPoint(x: number, y: number, scale: number, a: number, px: number, py: number): [number, number] {
  const cs = Math.cos(a), sn = Math.sin(a);
  return [x + (px * cs - py * sn) * scale, y + (px * sn + py * cs) * scale];
}

export function drawLander(c: Ctx, x: number, y: number, scale: number, st: LanderLook) {
  const t = st.t ?? 0, mood = st.mood ?? "awake", dead = mood === "dead", rot = st.tilt ?? 0;
  c.save(); c.translate(x, y); c.scale(scale, scale); c.rotate(rot);
  c.lineCap = "round"; c.lineJoin = "round";
  if (st.flame) {
    const f = st.flame * (0.8 + 0.2 * Math.sin(t * 43));
    c.fillStyle = "rgba(255,150,60,.9)"; c.beginPath(); c.moveTo(-7, -11); c.quadraticCurveTo(0, -11 + 44 * f, 7, -11); c.fill();
    c.fillStyle = "rgba(255,240,190,.95)"; c.beginPath(); c.moveTo(-3.5, -11); c.quadraticCurveTo(0, -11 + 24 * f, 3.5, -11); c.fill();
  }
  // legs and foot pads
  c.strokeStyle = "#9aa3ae"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-13, -12); c.lineTo(-21, -1); c.moveTo(13, -12); c.lineTo(21, -1); c.moveTo(-5, -12); c.lineTo(-8, -1); c.moveTo(5, -12); c.lineTo(8, -1); c.stroke();
  c.lineWidth = 2.4; c.beginPath(); c.moveTo(-25, 0); c.lineTo(-17, 0); c.moveTo(17, 0); c.lineTo(25, 0); c.stroke();
  // solar panel on a short arm
  c.strokeStyle = "#9aa3ae"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-20, -28); c.lineTo(-16, -26); c.stroke();
  rr(c, -31, -54, 12, 36, 2); c.fillStyle = "#23364f"; c.fill();
  const glow = st.charge || 0;
  if (glow > 0) { c.fillStyle = `rgba(255,205,110,${(0.2 + 0.55 * glow) * (0.85 + 0.15 * Math.sin(t * 5))})`; c.fill(); }
  c.strokeStyle = "rgba(190,205,225,.7)"; c.lineWidth = 0.8; c.stroke();
  c.beginPath(); for (let k = 1; k < 4; k++) { c.moveTo(-31, -54 + k * 9); c.lineTo(-19, -54 + k * 9); } c.moveTo(-25, -54); c.lineTo(-25, -18); c.stroke();
  // dish
  c.save(); c.translate(9, -31); c.rotate((st.antAng ?? rot - 1.2) - rot);
  c.strokeStyle = "#c7cdd4"; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(11, 0); c.stroke();
  c.fillStyle = "#e6ebf0"; c.beginPath(); c.ellipse(12, 0, 3, 7.5, 0, 0, TAU); c.fill();
  c.restore();
  // body
  rr(c, -16, -32, 32, 21, 5); c.fillStyle = dead ? "#8794a3" : FOIL; c.fill();
  c.fillStyle = "rgba(255,255,255,.22)"; rr(c, -14, -30.5, 28, 5, 2.5); c.fill();
  c.fillStyle = "rgba(0,0,0,.14)"; c.fillRect(-16, -15, 32, 2);
  // face
  const [lx, ly] = st.look ?? [0, 0], ink = "#1b222b";
  c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1.3;
  for (const ex of [-6.5, 6.5]) {
    const ey = -23.5;
    if (dead) { c.beginPath(); c.moveTo(ex - 2.2, ey - 2.2); c.lineTo(ex + 2.2, ey + 2.2); c.moveTo(ex + 2.2, ey - 2.2); c.lineTo(ex - 2.2, ey + 2.2); c.stroke(); }
    else if (mood === "sleep") { c.beginPath(); c.arc(ex, ey - 0.5, 2.8, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    else {
      const open = (t + 1) % 4.3 < 0.12 ? 0.12 : 1; // blink
      c.fillStyle = "#fff"; c.beginPath(); c.ellipse(ex, ey, 3.7, 3.7 * open, 0, 0, TAU); c.fill();
      if (open === 1) {
        c.fillStyle = ink; c.beginPath(); c.arc(ex + lx * 1.5, ey + ly * 1.5, 1.9, 0, TAU); c.fill();
        c.fillStyle = "#fff"; c.beginPath(); c.arc(ex + lx * 1.5 - 0.6, ey + ly * 1.5 - 0.7, 0.6, 0, TAU); c.fill();
      }
      if (mood === "worry") { c.beginPath(); c.moveTo(ex - 3 * Math.sign(ex), ey - 6.2); c.lineTo(ex + 2.5 * Math.sign(ex), ey - 4.6); c.stroke(); }
    }
  }
  c.strokeStyle = ink; c.fillStyle = ink; c.beginPath();
  if (dead) { c.moveTo(-2.5, -16); c.lineTo(2.5, -16); c.stroke(); }
  else if (mood === "sleep") { c.arc(0, -16.5, 1.3, 0, TAU); c.fill(); }
  else if (mood === "worry") { c.arc(0, -14.3, 2.6, 1.2 * Math.PI, 1.8 * Math.PI); c.stroke(); }
  else if (mood === "happy") { c.arc(0, -18.2, 3.1, 0.05 * Math.PI, 0.95 * Math.PI); c.closePath(); c.fill(); }
  else { c.arc(0, -18.5, 2.6, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
  if (mood === "happy") { c.fillStyle = "rgba(240,110,90,.45)"; for (const ex of [-11.5, 11.5]) { c.beginPath(); c.arc(ex, -18.5, 1.9, 0, TAU); c.fill(); } }
  if (st.warn && t % 0.8 < 0.4) { c.fillStyle = "#ff5a4a"; c.shadowColor = "#ff5a4a"; c.shadowBlur = 8; c.beginPath(); c.arc(0, -34.5, 2, 0, TAU); c.fill(); c.shadowBlur = 0; }
  if (st.frost || dead) {
    c.fillStyle = "rgba(170,210,255,.32)"; rr(c, -16, -32, 32, 21, 5); c.fill(); rr(c, -31, -54, 12, 36, 2); c.fill();
  }
  c.restore();
}

export function drawStars(c: Ctx, stars: number[][], w: number, h: number, t: number, dim = 1) {
  c.fillStyle = "#dbe4ee";
  for (const [a, b, m] of stars) {
    const tw = 0.65 + 0.35 * Math.sin(t * (0.8 + m * 2.2) + a * 60);
    c.globalAlpha = (0.25 + 0.65 * m) * tw * dim;
    const r = m > 0.85 ? 1.3 : 0.8;
    c.beginPath(); c.arc(a * w, b * h, r, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
}

export function drawSun(c: Ctx, x: number, y: number, r: number, t: number) {
  const R = r * 6.5 * (1 + 0.05 * Math.sin(t * 1.7));
  const g = c.createRadialGradient(x, y, r * 0.3, x, y, R);
  g.addColorStop(0, "rgba(255,214,140,.9)"); g.addColorStop(0.35, "rgba(242,169,59,.28)"); g.addColorStop(1, "rgba(242,169,59,0)");
  c.fillStyle = g; c.fillRect(x - R, y - R, R * 2, R * 2);
  c.save(); c.translate(x, y); c.rotate(t * 0.12);
  c.fillStyle = "rgba(255,220,150,.3)";
  for (let k = 0; k < 12; k++) {
    const len = r * (2.2 + 0.5 * Math.sin(t * 2 + k * 1.7));
    c.rotate(TAU / 12); c.beginPath(); c.moveTo(r * 1.15, -r * 0.16); c.lineTo(r * 1.15 + len, 0); c.lineTo(r * 1.15, r * 0.16); c.fill();
  }
  c.restore();
  c.fillStyle = "#ffe7b3"; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}

const LAND = [[-0.55, -0.25, 0.42, 0.3], [0.25, 0.2, 0.5, 0.34], [-0.15, 0.62, 0.3, 0.18], [0.85, -0.5, 0.36, 0.26], [1.45, 0.1, 0.44, 0.3], [-1.25, 0.3, 0.4, 0.3]];
/** Earth with its real phase: `lit` is the sunlit fraction of the disc and `ang` points at the Sun on screen. */
export function drawEarth(c: Ctx, x: number, y: number, r: number, ang: number, lit: number, t: number) {
  c.save(); c.translate(x, y);
  const g = c.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 2.6);
  g.addColorStop(0, "rgba(110,167,242,.3)"); g.addColorStop(1, "rgba(110,167,242,0)");
  c.fillStyle = g; c.fillRect(-r * 2.6, -r * 2.6, r * 5.2, r * 5.2);
  c.fillStyle = "#1b2c47"; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  c.rotate(ang);
  c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
  c.ellipse(0, 0, Math.max(0.01, r * Math.abs(1 - 2 * lit)), r, 0, Math.PI / 2, -Math.PI / 2, lit < 0.5);
  c.closePath(); c.clip();
  c.rotate(-ang);
  c.fillStyle = EARTH; c.fillRect(-r, -r, r * 2, r * 2);
  const spin = (t * 0.03) % 3; // the globe turns slowly
  c.fillStyle = "#6bbf86";
  for (const [a, b, p, q] of LAND) { c.beginPath(); c.ellipse(((((a + spin + 1.5) % 3) + 3) % 3 - 1.5) * r, b * r, p * r, q * r, 0.4, 0, TAU); c.fill(); }
  c.fillStyle = "rgba(255,255,255,.6)";
  for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse((((k * 1.1 + spin * 1.6) % 3) - 1.5) * r, (k - 1) * 0.5 * r, 0.5 * r, 0.1 * r, -0.2, 0, TAU); c.fill(); }
  c.restore();
}

/** `n` dots travelling from a to b; used for sunlight, science bits and radio packets. */
export function flow(c: Ctx, a: [number, number], b: [number, number], n: number, t: number, speed: number, col: string, r: number) {
  c.fillStyle = col;
  for (let k = 0; k < n; k++) {
    const p = (t * speed + k / n) % 1;
    c.globalAlpha = Math.sin(p * Math.PI);
    c.beginPath(); c.arc(a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, r, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
}

export function seeded(seed: number) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
const MASCOT_STARS = (() => { const rnd = seeded(31); return Array.from({ length: 40 }, () => [rnd(), rnd() * 0.75, rnd()]); })();
/** The lander on its own, for the debrief and the landing page. */
export function drawMascot(cv: HTMLCanvasElement, mood: Mood, t = 0, height = 150) {
  const { c, w, h } = setupCanvas(cv, height);
  c.fillStyle = "#070a0e"; c.fillRect(0, 0, w, h);
  drawStars(c, MASCOT_STARS, w, h, t);
  const gy = h * 0.8, x = w / 2, hop = mood === "happy" ? Math.abs(Math.sin(t * 3.2)) * 7 : 0;
  if (mood === "happy" || mood === "awake") drawSun(c, w * 0.14, gy - 10, 8, t);
  c.fillStyle = mood === "dead" ? "#1c222b" : "#3b3934"; c.fillRect(0, gy, w, h - gy);
  c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(x, gy + 8, 44 - hop * 1.5, 5, 0, 0, TAU); c.fill();
  drawLander(c, x, gy + 6 - hop, 1.7, { t, mood, charge: mood === "happy" ? 1 : 0, look: mood === "awake" ? [Math.cos(t * 0.7), -0.3] : [0, -0.2] });
  if (mood === "happy") {
    for (let k = 0; k < 10; k++) {
      const p = (t * 0.5 + k / 10) % 1, a = k * 2.4;
      c.fillStyle = [SUN, EARTH, DATA][k % 3]; c.globalAlpha = 1 - p;
      c.beginPath(); c.arc(x + Math.cos(a) * (40 + p * 90), gy - 60 + Math.sin(a) * (20 + p * 50) - p * 20, 2.6, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  }
}

export type SkyView = {
  sunEl: number; sunAz: number; earthEl: number; earthAz: number; power: boolean; link: boolean; center: number;
  /** Mission replays: how far the lander leans, whether it has stopped working, and whether it has landed yet. */
  tilt?: number; over?: boolean; lander?: boolean;
};
export type SkyLabels = { sun: string; earth: string; exag: (k: number) => string; below: string; hill: string };
const SKY_STARS = (() => { const rnd = seeded(53); return Array.from({ length: 90 }, () => [rnd(), rnd(), rnd()]); })();

/** One site's sky at one moment, for the landing page: where the Sun and Earth are, and whether the lander can use them. */
export function drawSkyNow(cv: HTMLCanvasElement, v: SkyView, L: SkyLabels, t = 0) {
  const { c, w, h } = setupCanvas(cv, 280);
  const y0 = h * 0.6, k = Math.min(11, (y0 - 30) / 8); // pixels per degree of elevation
  const X = (az: number) => ((((az - v.center + 540) % 360) - 180) / 360) * w + w / 2, Y = (el: number) => y0 - el * k;
  const mono = css("--mono"), body = css("--sans"), lit = v.power ? 1 : 0;
  c.fillStyle = "#05070a"; c.fillRect(0, 0, w, h);
  drawStars(c, SKY_STARS, w, y0, t, 1 - 0.4 * lit);
  // Away from the poles the Sun and Earth climb far above this low-horizon view: pin them to the top edge with an arrow.
  const sunHigh = Y(v.sunEl) < 26, earthHigh = Y(v.earthEl) < 28;
  const sx = X(v.sunAz), sy = Math.max(26, Y(v.sunEl)), ex = X(v.earthAz), ey = Math.max(28, Y(v.earthEl));
  const cosSep = Math.sin(v.sunEl * D) * Math.sin(v.earthEl * D) + Math.cos(v.sunEl * D) * Math.cos(v.earthEl * D) * Math.cos((v.sunAz - v.earthAz) * D);
  drawEarth(c, ex, ey, 14, Math.atan2(sy - ey, sx - ex), (1 - cosSep) / 2, t);
  drawSun(c, sx, sy, 11, t);
  // a hill on the skyline when the real terrain hides something that a flat Moon would show
  const hill = (x: number, top: number) => {
    c.fillStyle = "#15181d"; c.beginPath(); c.moveTo(x - 110, y0 + 1);
    c.bezierCurveTo(x - 50, y0, x - 40, top - 16, x, top - 18); c.bezierCurveTo(x + 44, top - 14, x + 60, y0, x + 120, y0 + 1); c.fill();
  };
  const sunHidden = !v.power && v.sunEl > 0.4, earthHidden = !v.link && v.earthEl > 0.4;
  if (sunHidden) hill(sx, sy);
  if (earthHidden) hill(ex, ey);
  const mix = (p: number[], q: number[], f: number) => p.map((n, j) => Math.round(n + (q[j] - n) * f));
  const gg = c.createLinearGradient(0, y0, 0, h);
  gg.addColorStop(0, `rgb(${mix([22, 25, 31], [92, 87, 77], lit)})`); gg.addColorStop(1, `rgb(${mix([14, 16, 20], [56, 53, 47], lit)})`);
  c.fillStyle = gg; c.fillRect(0, y0, w, h - y0);
  c.strokeStyle = lit ? "rgba(255,220,160,.55)" : "rgba(160,180,210,.25)"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, y0 + 0.5); c.lineTo(w, y0 + 0.5); c.stroke();
  // ghosts under the ground show where the Sun or Earth is when it is below the horizon
  c.setLineDash([3, 4]); c.lineWidth = 1.5;
  if (sy > y0 + 6) { c.strokeStyle = "rgba(242,169,59,.6)"; c.beginPath(); c.arc(sx, Math.min(sy, h - 16), 9, 0, TAU); c.stroke(); }
  if (ey > y0 + 6) { c.strokeStyle = "rgba(110,167,242,.7)"; c.beginPath(); c.arc(ex, Math.min(ey, h - 16), 11, 0, TAU); c.stroke(); }
  c.setLineDash([]);
  c.font = `11px ${mono}`; c.fillStyle = "rgba(200,210,220,.5)"; c.textAlign = "center"; c.textBaseline = "top";
  ([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).forEach(([l, az]) => { const x = X(az); if (x > 8 && x < w - 8) c.fillText(l, x, y0 + 4); });
  const tag = (x: number, y: number, text: string, col: string) => {
    c.font = `600 12.5px ${body}`; c.textBaseline = "middle";
    const left = x + 22 + c.measureText(text).width > w; // flip to the left near the right edge
    c.textAlign = left ? "right" : "left"; c.fillStyle = col; c.fillText(text, x + (left ? -20 : 20), y);
  };
  // anything below the horizon is named in a bottom corner, clear of the lander
  const corner = (text: string, col: string, right: boolean) => {
    c.font = `600 11.5px ${body}`; c.textBaseline = "bottom"; c.textAlign = right ? "right" : "left"; c.fillStyle = col;
    c.fillText(text, right ? w - 10 : 10, h - 8);
  };
  if (sy > y0 + 6) corner(`${L.sun}: ${L.below}`, SUN, false); else tag(sx, sunHigh ? sy : sy - 14, sunHidden ? `${L.sun}: ${L.hill}` : sunHigh ? `${L.sun} ↑ ${Math.round(v.sunEl)}°` : L.sun, SUN);
  if (ey > y0 + 6) corner(`${L.earth}: ${L.below}`, EARTH, true); else tag(ex, earthHigh ? ey : ey - 16, earthHidden ? `${L.earth}: ${L.hill}` : earthHigh ? `${L.earth} ↑ ${Math.round(v.earthEl)}°` : L.earth, EARTH);
  c.font = `11px ${mono}`; c.fillStyle = "rgba(200,210,220,.45)"; c.textAlign = "right"; c.textBaseline = "top";
  c.fillText(L.exag(Math.max(1, Math.round(k / (w / 360)))), w - 12, 10);
  if (v.lander === false) return;
  // the lander shows what the sky means for it
  const S = 1.5, lx = w / 2, tilt = v.tilt ?? 0, gy = h - 22 - (tilt < -0.9 ? 18 : 0), away = sx < lx ? 1 : -1, on = !v.over;
  if (v.power) {
    const sg = c.createLinearGradient(lx, 0, lx + away * 200, 0);
    sg.addColorStop(0, "rgba(0,0,0,.45)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = sg; c.beginPath(); c.moveTo(lx - 26, gy); c.lineTo(lx + 26, gy + 4); c.lineTo(lx + away * 200, gy + 14); c.lineTo(lx + away * 200, gy + 4); c.fill();
  }
  c.fillStyle = "rgba(0,0,0,.4)"; c.beginPath(); c.ellipse(lx, gy + 2, 36, 4, 0, 0, TAU); c.fill();
  const dish = landerPoint(lx, gy, S, tilt, 9, -31), head = landerPoint(lx, gy, S, tilt, 0, -24);
  const target = v.power ? [sx, sy] : v.link ? [ex, ey] : [lx, head[1] - 50], ld = Math.hypot(target[0] - head[0], target[1] - head[1]) || 1;
  if (v.power && on) flow(c, [sx, sy], landerPoint(lx, gy, S, tilt, -25, -36), 7, t, 0.35, "rgba(255,217,138,.75)", 2);
  drawLander(c, lx, gy, S, {
    t, tilt, charge: on ? lit : 0, antAng: Math.atan2(ey - dish[1], ex - dish[0]), frost: !v.power || !on,
    mood: !on ? "sleep" : v.power && v.link ? "happy" : v.power ? "awake" : v.link ? "worry" : "sleep",
    look: [(target[0] - head[0]) / ld, (target[1] - head[1]) / ld],
  });
  if (v.link && on) {
    c.strokeStyle = "rgba(110,167,242,.35)"; c.lineWidth = 1; c.beginPath(); c.moveTo(dish[0], dish[1]); c.lineTo(ex, ey); c.stroke();
    flow(c, dish, [ex, ey], 6, t, 0.5, "#a9cbff", 2.4);
  }
}

export type Labels = { sun: string; earth: string; exag: (k: number) => string; panel: string };
/** `t` is the clock in seconds, `frac` how far into the current hour the simulation is, `age` seconds since touchdown began. */
export type Anim = { t: number; frac: number; age: number };
const LAND_S = 1.6;
const CRATERS = [[0.1, 0.84, 46], [0.8, 0.76, 30], [0.92, 0.92, 54], [0.27, 0.95, 24], [0.66, 0.9, 18]];

export function drawScene(cv: HTMLCanvasElement, sc: Scenario, o: Series, s: SimState, stars: number[][], L: Labels, a: Anim) {
  const { c, w, h } = setupCanvas(cv, 360), { t } = a;
  const i0 = Math.min(s.i, o.n - 1), i1 = Math.min(i0 + 1, o.n - 1), f = s.dead || s.done ? 0 : clamp01(a.frac);
  // Hourly samples are blended so the Sun and Earth glide instead of jumping.
  const lin = (v: Float32Array) => v[i0] + (v[i1] - v[i0]) * f;
  const ang = (v: Float32Array) => v[i0] + ((((v[i1] - v[i0]) % 360) + 540) % 360 - 180) * f;
  const sEl = lin(o.sEl), eEl = lin(o.eEl), sAz = ang(o.sAz), eAz = ang(o.eAz), sun = lin(o.sFrac);
  const center = o.eAz[0];
  let maxEl = 2;
  for (let k = 0; k < sc.hours; k++) maxEl = Math.max(maxEl, o.sEl[k], o.eEl[k]);
  const y0 = h * 0.62, k = Math.max(4, Math.min(18, (y0 - 40) / maxEl));
  const X = (az: number) => ((((az - center + 540) % 360) - 180) / 360) * w + w / 2, Y = (el: number) => y0 - el * k;
  const mono = css("--mono"), body = css("--sans");
  // sky: black, because the Moon has no air to scatter light
  c.fillStyle = "#05070a"; c.fillRect(0, 0, w, h);
  drawStars(c, stars, w, y0 * 0.98, t, 1 - 0.45 * sun);
  // where the Sun and Earth go over the next 72 hours
  for (let q = 2; q <= 72; q += 2) {
    const j = Math.min(o.n - 1, i0 + q), fade = 1 - q / 80;
    c.fillStyle = `rgba(242,169,59,${0.4 * fade})`; c.beginPath(); c.arc(X(o.sAz[j]), Y(o.sEl[j]), 1.3, 0, TAU); c.fill();
    c.fillStyle = `rgba(110,167,242,${0.45 * fade})`; c.beginPath(); c.arc(X(o.eAz[j]), Y(o.eEl[j]), 1.3, 0, TAU); c.fill();
  }
  const sx = X(sAz), sy = Y(sEl), ex = X(eAz), ey = Y(eEl);
  const cosSep = Math.sin(sEl * D) * Math.sin(eEl * D) + Math.cos(sEl * D) * Math.cos(eEl * D) * Math.cos((sAz - eAz) * D);
  drawEarth(c, ex, ey, 15, Math.atan2(sy - ey, sx - ex), (1 - cosSep) / 2, t);
  drawSun(c, sx, sy, 11, t);
  // ground, lit by the Sun
  const mix = (p: number[], q: number[], v: number) => p.map((n, j) => Math.round(n + (q[j] - n) * v));
  const gg = c.createLinearGradient(0, y0, 0, h);
  gg.addColorStop(0, `rgb(${mix([22, 25, 31], [92, 87, 77], sun)})`); gg.addColorStop(1, `rgb(${mix([14, 16, 20], [56, 53, 47], sun)})`);
  c.fillStyle = gg; c.fillRect(0, y0, w, h - y0);
  c.strokeStyle = sun > 0.5 ? "rgba(255,220,160,.55)" : "rgba(160,180,210,.25)"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, y0 + 0.5); c.lineTo(w, y0 + 0.5); c.stroke();
  const away = sx < w / 2 ? 1 : -1; // shadows fall away from the Sun
  for (const [cx, cy, r] of CRATERS) {
    c.fillStyle = "rgba(0,0,0,.24)"; c.beginPath(); c.ellipse(cx * w, cy * h, r, r * 0.24, 0, 0, TAU); c.fill();
    c.strokeStyle = `rgba(255,230,190,${0.1 + 0.35 * sun})`; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(cx * w, cy * h, r, r * 0.24, 0, away > 0 ? -0.5 * Math.PI : 0.5 * Math.PI, away > 0 ? 0.5 * Math.PI : 1.5 * Math.PI); c.stroke();
  }
  // compass + labels
  c.font = `11px ${mono}`; c.fillStyle = "rgba(200,210,220,.55)"; c.textAlign = "center"; c.textBaseline = "top";
  ([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).forEach(([l, az]) => { const x = X(az); if (x > 8 && x < w - 8) c.fillText(l, x, y0 + 4); });
  c.font = `600 13px ${body}`; c.textBaseline = "bottom"; c.textAlign = "left";
  if (sy < y0 + 4) { c.fillStyle = SUN; c.fillText(L.sun, Math.min(sx + 16, w - 50), sy - 10); }
  if (ey < y0 + 4) { c.fillStyle = EARTH; c.fillText(L.earth, Math.min(ex + 19, w - 60), ey - 12); }
  c.font = `11px ${mono}`; c.fillStyle = "rgba(200,210,220,.45)"; c.textAlign = "right"; c.textBaseline = "top";
  c.fillText(L.exag(Math.round(k / (w / 360))), w - 12, 10);
  if (sc.panelAz != null) {
    const px = X(sc.panelAz);
    c.strokeStyle = "rgba(242,169,59,.5)"; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(px, y0 - 4); c.lineTo(px, y0 - 34); c.stroke(); c.setLineDash([]);
    c.fillStyle = "rgba(242,169,59,.8)"; c.textAlign = "center"; c.textBaseline = "bottom"; c.font = `11px ${mono}`; c.fillText("▼ " + L.panel, px, y0 - 36);
  }

  // lander: drops in on its engine, then settles
  const S = 1.9, lx = w / 2, tipped = sc.panelAz != null, gy = h - (tipped ? 50 : 30);
  const down = easeOut(a.age / LAND_S), landed = a.age >= LAND_S, ly = gy - (1 - down) * (gy + 40);
  const tilt = tipped ? TILT * easeOut((a.age - LAND_S + 0.15) / 0.6) : 0; // it lands upright, then topples
  const b = s.bat / CFG.batteryWh, awake = landed && !s.hib && !s.dead;
  const at = (px: number, py: number) => landerPoint(lx, ly, S, tilt, px, py);
  const shade = landed ? sun : sun * down;
  if (shade > 0.03) {
    const sg = c.createLinearGradient(lx, 0, lx + away * 260, 0);
    sg.addColorStop(0, `rgba(0,0,0,${0.45 * shade})`); sg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = sg; c.beginPath();
    c.moveTo(lx - 34, gy); c.lineTo(lx + 34, gy + 6); c.lineTo(lx + away * 260, gy + 20); c.lineTo(lx + away * 260, gy + 6); c.fill();
  }
  c.fillStyle = "rgba(0,0,0,.4)"; c.beginPath(); c.ellipse(lx, gy + 3, 46 * (0.4 + 0.6 * down), 5, 0, 0, TAU); c.fill();
  if (a.age > LAND_S - 0.5 && a.age < LAND_S + 1.3) { // dust kicked up at touchdown
    const p = (a.age - LAND_S + 0.5) / 1.8;
    c.fillStyle = `rgba(190,180,165,${0.35 * (1 - p)})`;
    for (let q = 0; q < 10; q++) { const dir = q % 2 ? 1 : -1, d = (20 + q * 9) * easeOut(p); c.beginPath(); c.arc(lx + dir * (24 + d), gy - 2 - Math.sin(p * Math.PI) * (4 + q * 2), 5 + q * 0.8 + p * 8, 0, TAU); c.fill(); }
  }
  const head = at(0, -24), target = sy < y0 ? [sx, sy] : ey < y0 ? [ex, ey] : [lx, head[1] - 60];
  const ld = Math.hypot(target[0] - head[0], target[1] - head[1]) || 1;
  const dish = at(9, -31);
  if (awake && sun > 0.02 && s.solarW > 5 && sy < y0 + 12) flow(c, [sx, sy], at(-25, -36), 7, t, 0.35, "rgba(255,217,138,.75)", 2);
  if (awake && s.sci) { // scanner sweeps the ground and science bits hop back to the lander
    const full = s.stored >= CFG.storageMB, hit: [number, number] = [lx + 95 + 45 * Math.sin(t * 1.4), gy + 8], from = at(14, -14);
    const bg = c.createLinearGradient(from[0], from[1], hit[0], hit[1]);
    bg.addColorStop(0, "rgba(108,192,131,.5)"); bg.addColorStop(1, "rgba(108,192,131,0)");
    c.fillStyle = bg; c.beginPath(); c.moveTo(from[0], from[1]); c.lineTo(hit[0] - 16, hit[1]); c.lineTo(hit[0] + 16, hit[1]); c.fill();
    c.fillStyle = "rgba(108,192,131,.8)"; c.beginPath(); c.ellipse(hit[0], hit[1], 16, 3, 0, 0, TAU); c.fill();
    flow(c, hit, from, 4, t, 0.7, full ? "#ef7b61" : DATA, 2.4);
  }
  drawLander(c, lx, ly, S, {
    t, charge: landed ? s.solarW / CFG.solarW : 0, antAng: Math.atan2(ey - dish[1], ex - dish[0]), tilt,
    mood: s.dead ? "dead" : s.hib ? "sleep" : b < 0.25 ? "worry" : s.sending ? "happy" : "awake",
    frost: s.hib && sun < 0.5, warn: !s.dead && b < 0.25, flame: landed ? 0 : 1 - down * 0.5,
    look: [(target[0] - head[0]) / ld, (target[1] - head[1]) / ld],
  });
  if (s.sending && landed) { // data packets fly to Earth
    c.strokeStyle = "rgba(110,167,242,.35)"; c.lineWidth = 1; c.beginPath(); c.moveTo(dish[0], dish[1]); c.lineTo(ex, ey); c.stroke();
    flow(c, dish, [ex, ey], 6, t, 0.5, "#a9cbff", 2.6);
    for (let q = 0; q < 2; q++) { const p = (t * 0.9 + q / 2) % 1; c.strokeStyle = `rgba(110,167,242,${0.7 * (1 - p)})`; c.lineWidth = 1.5; c.beginPath(); c.arc(ex, ey, 16 + p * 16, 0, TAU); c.stroke(); }
  }
  if (s.hib && !s.dead) {
    c.fillStyle = "rgba(200,220,255,.9)"; c.textAlign = "center"; c.textBaseline = "middle";
    const [zx, zy] = at(20, -40);
    for (let q = 0; q < 3; q++) { const p = (t * 0.3 + q / 3) % 1; c.globalAlpha = Math.sin(p * Math.PI); c.font = `600 ${12 + p * 14}px ${mono}`; c.fillText("z", zx + p * 30 + Math.sin(t * 2 + q) * 4, zy - p * 56); }
    c.globalAlpha = 1;
  }
  if (s.dead) { // ice crystals
    c.strokeStyle = "rgba(200,230,255,.9)"; c.lineWidth = 1.2;
    for (let q = 0; q < 9; q++) {
      const x = lx + Math.cos(q * 2.3) * (40 + (q % 3) * 22), y = ly - 50 + Math.sin(q * 1.7) * 44, r = 3 + (q % 3), tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + q));
      c.globalAlpha = tw; c.beginPath();
      for (let m = 0; m < 3; m++) { const an = (m * Math.PI) / 3; c.moveTo(x - Math.cos(an) * r, y - Math.sin(an) * r); c.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); }
      c.stroke();
    }
    c.globalAlpha = 1;
  }
}

/** Sun/Earth availability strip: `span` hours starting at `from`, with day ticks every `tickH`. */
export function drawForecast(cv: HTMLCanvasElement, rows: [string, (j: number) => number, string][], opts: {
  from: number; span: number; tickEvery: number; tickLabel: (k: number) => string; endAt?: number; labelW: number;
}) {
  const { c, w } = setupCanvas(cv, 80);
  const { from, span, tickEvery, tickLabel, endAt, labelW: L } = opts, pw = w - L - 8;
  c.font = `11.5px ${css("--sans")}`;
  rows.forEach(([lab, f, col], r) => {
    const y = 6 + r * 26;
    c.fillStyle = css("--bg-2"); c.fillRect(L, y, pw, 18);
    for (let q = 0; q < span; q++) {
      const v = f(from + q);
      if (v > 0.02) { c.fillStyle = col; c.globalAlpha = 0.25 + 0.75 * v; c.fillRect(L + (q / span) * pw, y, pw / span + 0.6, 18); }
    }
    c.globalAlpha = 1; c.fillStyle = css("--muted"); c.textAlign = "right"; c.textBaseline = "middle"; c.fillText(lab, L - 6, y + 9);
  });
  c.fillStyle = css("--faint"); c.textBaseline = "top"; c.textAlign = "center"; c.font = `10.5px ${css("--mono")}`;
  for (let d = 0; d * tickEvery <= span; d++) {
    const x = L + ((d * tickEvery) / span) * pw;
    c.fillRect(x, 4, 1, 50);
    c.fillText(tickLabel(d), Math.min(Math.max(x, L + 12), w - 16), 60);
  }
  if (endAt != null && endAt < span) { const x = L + (endAt / span) * pw; c.fillStyle = css("--ink"); c.fillRect(x, 2, 2, 54); }
}

export function drawReplay(cv: HTMLCanvasElement, sc: Scenario, o: Series, s: SimState) {
  const { c, w, h } = setupCanvas(cv, 96), H = s.batHist, n = sc.hours;
  c.fillStyle = css("--bg-2"); c.fillRect(0, 0, w, h);
  for (let k = 0; k < n; k++) {
    const x = (k / n) * w, bw = w / n + 0.6;
    if (o.sFrac[k] >= 0.5) { c.fillStyle = "rgba(242,169,59,.22)"; c.fillRect(x, 0, bw, h * 0.5); }
    if (o.eEl[k] >= 0) { c.fillStyle = "rgba(110,167,242,.22)"; c.fillRect(x, h * 0.5, bw, h * 0.5); }
  }
  c.beginPath();
  H.forEach((v, k) => { const x = (k / n) * w, y = h - 4 - v * (h - 8); if (k) c.lineTo(x, y); else c.moveTo(x, y); });
  c.strokeStyle = s.dead ? css("--warn") : css("--both"); c.lineWidth = 2; c.stroke();
}

export { panelFactor };
