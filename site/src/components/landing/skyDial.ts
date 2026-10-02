"use client";
import { css, setupCanvas } from "@/lib/canvas";
import type { BoardSite } from "@/lib/sky";
import { drawEarth, drawLander, drawStars, drawSun, flow, landerPoint, seeded, type SkyLabels } from "@/components/game/art";

/* The landing page's site view: a tilted model of the ground around the lander. The rim of the plate is the
   horizon, so the Sun walks around it once a Moon day while Earth hovers in one place. Ridges on the rim are the
   site's LOLA skyline; the dotted paths are where the Sun and Earth go over the coming 30 days. */

const SUN = "#f2a93b", EARTH = "#6ea7f2", TAU = Math.PI * 2, D = Math.PI / 180;
const K_EL = 8; // pixels per degree of elevation
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const mix = (p: number[], q: number[], f: number) => `rgb(${p.map((n, j) => Math.round(n + (q[j] - n) * f)).join(",")})`;

const STARS = (() => { const rnd = seeded(77); return Array.from({ length: 130 }, () => [rnd(), rnd(), rnd()]); })();
/** [distance from the lander as a share of the plate, azimuth, size as a share of the plate] */
const CRATERS = [[0.56, 38, 0.13], [0.7, 152, 0.09], [0.62, 248, 0.15], [0.36, 305, 0.06], [0.8, 335, 0.07], [0.42, 196, 0.05]];
/** [distance, azimuth, size in pixels] */
const ROCKS = [[0.3, 70, 4], [0.5, 110, 6], [0.75, 80, 5], [0.48, 172, 4], [0.82, 215, 6], [0.3, 250, 3.5], [0.52, 282, 5], [0.7, 5, 4.5], [0.86, 300, 4]];

/** What is on screen now, eased toward the chosen moment so scrubbing glides instead of jumping. */
type Shown = { id: string; t: number; sa: number; se: number; ea: number; ee: number; lit: number };
const shown = new WeakMap<HTMLCanvasElement, Shown>();

export function drawSkyDial(cv: HTMLCanvasElement, site: BoardSite, i: number, L: SkyLabels, t = 0) {
  const { c, w, h } = setupCanvas(cv, 320);
  const f = +site.flags[i], power = (f & 1) !== 0, link = (f & 2) !== 0;

  let s = shown.get(cv);
  if (!s) shown.set(cv, s = { id: "", t: 0, sa: 0, se: 0, ea: 0, ee: 0, lit: 0 });
  const k = s.id !== site.id || t === 0 ? 1 : 1 - Math.exp(-Math.min(0.1, Math.max(0, t - s.t)) * 9);
  s.sa += wrap(site.sunAz[i] - s.sa) * k; s.se += (site.sunEl[i] - s.se) * k;
  s.ea += wrap(site.earthAz[i] - s.ea) * k; s.ee += (site.earthEl[i] - s.ee) * k;
  s.lit += (+power - s.lit) * k; s.id = site.id; s.t = t;
  const lit = s.lit;

  // the plate: Earth sits at the back, and the camera drifts a little so the model reads as solid
  const R = Math.min(w * 0.43, 280), ky = Math.max(0.36, Math.min(0.5, 100 / R)), cx = w / 2, cy = h * 0.6;
  const rot = site.earthAz[0] + (t ? 6 * Math.sin(t * 0.22) : 0);
  /** Screen position of a direction in the sky; the third value is positive on the far side of the plate. */
  const P = (az: number, el = 0, rf = 1): [number, number, number] => {
    const a = (az - rot) * D;
    return [cx + R * rf * Math.sin(a), cy - R * rf * ky * Math.cos(a) - el * K_EL, Math.cos(a)];
  };
  const hz = (az: number) => {
    const m = site.horizon;
    if (!m) return 0;
    const x = ((((az % 360) + 360) % 360) / 360) * m.length, j = Math.floor(x) % m.length;
    return m[j] + (m[(j + 1) % m.length] - m[j]) * (x - Math.floor(x));
  };
  const mono = css("--mono"), body = css("--sans");

  c.fillStyle = "#05070a"; c.fillRect(0, 0, w, h);
  drawStars(c, STARS, w, h, t, 1 - 0.35 * lit);

  // a body the lander can use is drawn solid, lifted just clear of the rim; otherwise it becomes a dashed ghost
  const place = (az: number, el: number, on: boolean, top: number) => {
    const [x, y, far] = P(az, on ? Math.max(el, 0.6) : Math.max(el, -2.2));
    return { x, y: Math.max(top, y), far: far >= 0, high: y < top };
  };
  const sun = place(s.sa, s.se, power, 26), earth = place(s.ea, s.ee, link, 28);
  const cosSep = Math.sin(s.se * D) * Math.sin(s.ee * D) + Math.cos(s.se * D) * Math.cos(s.ee * D) * Math.cos((s.sa - s.ea) * D);
  const paintSun = () => drawSun(c, sun.x, sun.y, 10, t);
  const paintEarth = () => drawEarth(c, earth.x, earth.y, 13, Math.atan2(sun.y - earth.y, sun.x - earth.x), (1 - cosSep) / 2, t);
  if (link && earth.far) paintEarth();
  if (power && sun.far) paintSun();

  // the skyline standing on the rim, from `from` to `to` degrees right of the view direction
  const wall = (from: number, to: number) => {
    c.beginPath();
    for (let a = from; a <= to; a += 2) { const [x, y] = P(rot + a, Math.max(0, hz(rot + a))); if (a === from) c.moveTo(x, y); else c.lineTo(x, y); }
    for (let a = to; a >= from; a -= 2) { const [x, y] = P(rot + a); c.lineTo(x, y); }
    c.closePath();
  };
  const back = c.createLinearGradient(0, cy - R * ky - 40, 0, cy);
  back.addColorStop(0, "#34353a"); back.addColorStop(1, "#17191d");
  wall(-90, 90); c.fillStyle = back; c.fill();
  if (site.horizon && s.se > -1.5) { // ridges facing the Sun catch its light
    c.lineWidth = 1.6;
    for (let a = -90; a < 90; a += 2) {
      const near = Math.exp(-((wrap(rot + a - s.sa) / 40) ** 2));
      if (near < 0.04) continue;
      const [x0, y0] = P(rot + a, Math.max(0, hz(rot + a))), [x1, y1] = P(rot + a + 2, Math.max(0, hz(rot + a + 2)));
      c.strokeStyle = `rgba(255,214,150,${0.8 * near * (0.25 + 0.75 * lit)})`;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
  }

  // the slab and its top surface, lit from the Sun's side
  c.fillStyle = "#0e1014"; c.beginPath(); c.ellipse(cx, cy + 9, R, R * ky, 0, 0, TAU); c.fill(); c.fillRect(cx - R, cy, R * 2, 9);
  const [gx, gy0] = P(s.sa), ground = c.createLinearGradient(gx, gy0, 2 * cx - gx, 2 * cy - gy0);
  ground.addColorStop(0, mix([30, 34, 42], [158, 147, 126], lit)); ground.addColorStop(1, mix([17, 19, 24], [66, 62, 55], lit));
  c.beginPath(); c.ellipse(cx, cy, R, R * ky, 0, 0, TAU); c.fillStyle = ground; c.fill();

  // everything on the ground throws its shadow straight away from the Sun, like a sundial
  const sa = (s.sa - rot) * D, dx = -Math.sin(sa), dy = ky * Math.cos(sa), away = Math.atan2(dy, dx);
  const S = w < 480 ? 1.05 : 1.3, gy = cy + 8;
  c.save(); c.beginPath(); c.ellipse(cx, cy, R, R * ky, 0, 0, TAU); c.clip();
  for (const [rf, az, size] of CRATERS) {
    const [x, y] = P(az, 0, rf), rx = size * R, ry = rx * ky;
    c.fillStyle = "rgba(0,0,0,.2)"; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
    c.lineWidth = 2;
    c.strokeStyle = `rgba(0,0,0,${0.25 + 0.3 * lit})`; c.beginPath(); c.ellipse(x, y, rx, ry, 0, away + Math.PI - 1.2, away + Math.PI + 1.2); c.stroke();
    c.strokeStyle = `rgba(255,226,170,${0.08 + 0.5 * lit})`; c.beginPath(); c.ellipse(x, y, rx, ry, 0, away - 1.2, away + 1.2); c.stroke();
  }
  c.lineCap = "round";
  for (const [rf, az, size] of ROCKS) {
    const [x, y] = P(az, 0, rf), len = size * 9;
    if (lit > 0.05) {
      const sh = c.createLinearGradient(x, y, x + dx * len, y + dy * len);
      sh.addColorStop(0, `rgba(0,0,0,${0.5 * lit})`); sh.addColorStop(1, "rgba(0,0,0,0)");
      c.strokeStyle = sh; c.lineWidth = size * 0.9; c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * len, y + dy * len); c.stroke();
    }
    c.fillStyle = mix([44, 48, 56], [176, 166, 148], lit); c.beginPath(); c.ellipse(x, y, size, size * 0.62, 0, Math.PI, 0); c.fill();
  }
  c.lineCap = "butt";
  if (lit > 0.05) { // the lander's own shadow: a Sun this low stretches it right across the plate
    const len = R * 0.82, px = -dy, py = dx, n = Math.hypot(px, py) || 1, ux = px / n, uy = (py / n) * ky;
    const sh = c.createLinearGradient(cx, gy, cx + dx * len, gy + dy * len);
    sh.addColorStop(0, `rgba(0,0,0,${0.55 * lit})`); sh.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = sh; c.beginPath();
    c.moveTo(cx - ux * 24 * S, gy - uy * 24 * S); c.lineTo(cx + ux * 24 * S, gy + uy * 24 * S);
    c.lineTo(cx + dx * len + ux * 9, gy + dy * len + uy * 9); c.lineTo(cx + dx * len - ux * 9, gy + dy * len - uy * 9);
    c.closePath(); c.fill();
  }
  // compass: ticks every 30° and the four letters lying on the ground
  c.strokeStyle = "rgba(200,210,220,.28)"; c.lineWidth = 1;
  for (let az = 0; az < 360; az += 30) { const [x0, y0] = P(az, 0, 0.95), [x1, y1] = P(az); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
  c.font = `10.5px ${mono}`; c.fillStyle = `rgba(${lit > 0.5 ? "30,26,20,.6" : "200,210,220,.5"})`; c.textAlign = "center"; c.textBaseline = "middle";
  ([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).forEach(([l, az]) => { const [x, y] = P(az, 0, 0.87); c.fillText(l, x, y); });
  c.restore();
  c.strokeStyle = mix([70, 82, 104], [255, 220, 160], lit); c.globalAlpha = 0.55; c.lineWidth = 1;
  c.beginPath(); c.ellipse(cx, cy, R, R * ky, 0, 0, TAU); c.stroke(); c.globalAlpha = 1;

  // where the Sun and Earth go in the next 30 days: coloured where the lander can use them
  const trail = (az: number[], el: number[], bit: number, col: string) => {
    for (let j = 0; j < az.length; j++) {
      if (el[j] < -2.2) continue; // far below the rim there is nothing to show
      const on = (+site.flags[j] & bit) !== 0, [x, y] = P(az[j], el[j]);
      if (y < 8) continue;
      c.fillStyle = on ? col : "rgba(150,160,176,.3)";
      c.beginPath(); c.arc(x, y, on ? 1.5 : 1.1, 0, TAU); c.fill();
    }
  };
  trail(site.sunAz, site.sunEl, 1, "rgba(242,169,59,.8)");
  trail(site.earthAz, site.earthEl, 2, "rgba(110,167,242,.8)");

  // the lander shows what the sky means for it
  const dish = landerPoint(cx, gy, S, 0, 9, -31), head = landerPoint(cx, gy, S, 0, 0, -24);
  const target = power ? [sun.x, sun.y] : link ? [earth.x, earth.y] : [cx, head[1] - 50], ld = Math.hypot(target[0] - head[0], target[1] - head[1]) || 1;
  c.fillStyle = "rgba(0,0,0,.4)"; c.beginPath(); c.ellipse(cx, gy + 2, 30 * S, 4, 0, 0, TAU); c.fill();
  if (power) flow(c, [sun.x, sun.y], landerPoint(cx, gy, S, 0, -25, -36), 7, t, 0.35, "rgba(255,217,138,.8)", 2);
  drawLander(c, cx, gy, S, {
    t, charge: lit, antAng: Math.atan2(earth.y - dish[1], earth.x - dish[0]), frost: !power,
    mood: power && link ? "happy" : power ? "awake" : link ? "worry" : "sleep",
    look: [(target[0] - head[0]) / ld, (target[1] - head[1]) / ld],
  });
  if (link) {
    c.strokeStyle = "rgba(110,167,242,.35)"; c.lineWidth = 1; c.beginPath(); c.moveTo(dish[0], dish[1]); c.lineTo(earth.x, earth.y); c.stroke();
    flow(c, dish, [earth.x, earth.y], 6, t, 0.5, "#a9cbff", 2.4);
  }

  // the near side of the skyline is see-through so it never hides the lander
  if (site.horizon) {
    wall(90, 270); c.fillStyle = "rgba(10,12,16,.5)"; c.fill();
    c.strokeStyle = "rgba(170,185,210,.3)"; c.lineWidth = 1; c.beginPath();
    for (let a = 90; a <= 270; a += 2) { const [x, y] = P(rot + a, Math.max(0, hz(rot + a))); if (a === 90) c.moveTo(x, y); else c.lineTo(x, y); }
    c.stroke();
  }
  if (link && !earth.far) paintEarth();
  if (power && !sun.far) paintSun();
  c.setLineDash([3, 4]); c.lineWidth = 1.5;
  if (!power) { c.strokeStyle = "rgba(242,169,59,.7)"; c.beginPath(); c.arc(sun.x, sun.y, 9, 0, TAU); c.stroke(); }
  if (!link) { c.strokeStyle = "rgba(110,167,242,.8)"; c.beginPath(); c.arc(earth.x, earth.y, 11, 0, TAU); c.stroke(); }
  c.setLineDash([]);

  const tag = (b: { x: number; y: number; high: boolean }, name: string, el: number, on: boolean, col: string) => {
    const text = on ? (b.high ? `${name} ↑ ${Math.round(el)}°` : name) : `${name}: ${el > 0.4 ? L.hill : L.below}`;
    c.font = `600 12.5px ${body}`; c.textBaseline = "middle";
    const left = b.x + 22 + c.measureText(text).width > w; // flip to the left near the right edge
    c.textAlign = left ? "right" : "left";
    const x = b.x + (left ? -20 : 20), y = b.high ? b.y : b.y - 12;
    c.lineWidth = 3; c.strokeStyle = "rgba(5,7,10,.75)"; c.strokeText(text, x, y);
    c.fillStyle = col; c.fillText(text, x, y);
  };
  tag(sun, L.sun, s.se, power, SUN);
  tag(earth, L.earth, s.ee, link, EARTH);
  c.font = `11px ${mono}`; c.fillStyle = "rgba(200,210,220,.45)"; c.textAlign = "right"; c.textBaseline = "top";
  c.fillText(L.exag(Math.max(1, Math.round(K_EL / (R * D)))), w - 12, 10);
}
