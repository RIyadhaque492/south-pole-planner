"use client";
import type { Series } from "@/lib/ephemeris";
import { CFG, panelFactor, type Scenario, type SimState } from "@/lib/game";
import { css, setupCanvas } from "@/lib/canvas";

const FOIL = "#c49a3c", SUN = "#f2a93b", EARTH = "#6ea7f2";

type LanderLook = { charge?: number; antAng?: number; frost?: boolean; dead?: boolean; tipped?: boolean };
export function drawLander(c: CanvasRenderingContext2D, x: number, y: number, scale: number, st: LanderLook) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  if (st.tipped) c.rotate(-1.25);
  c.strokeStyle = "#8d96a1"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-14, -12); c.lineTo(-22, 0); c.moveTo(14, -12); c.lineTo(22, 0); c.moveTo(-6, -12); c.lineTo(-9, 0); c.moveTo(6, -12); c.lineTo(9, 0); c.stroke();
  c.fillStyle = st.dead ? "#6b6f76" : FOIL; c.fillRect(-16, -30, 32, 19);
  c.fillStyle = "rgba(0,0,0,.18)"; c.fillRect(-16, -21, 32, 2);
  // vertical solar panel
  const glow = st.charge || 0;
  c.fillStyle = "#23364f"; c.fillRect(-30, -52, 11, 34);
  if (glow > 0) { c.fillStyle = `rgba(242,169,59,${0.25 + 0.6 * glow})`; c.fillRect(-30, -52, 11, 34); }
  c.strokeStyle = "#8d96a1"; c.lineWidth = 1; c.strokeRect(-30, -52, 11, 34);
  c.beginPath(); c.moveTo(-19, -30); c.lineTo(-16, -30); c.stroke();
  // antenna
  c.save(); c.translate(8, -30); c.rotate(st.antAng ?? -1.2);
  c.strokeStyle = "#c7cdd4"; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(12, 0); c.stroke();
  c.fillStyle = "#dfe4ea"; c.beginPath(); c.ellipse(13, 0, 3, 7, 0, 0, 7); c.fill();
  c.restore();
  if (st.frost) { c.fillStyle = "rgba(140,190,255,.35)"; c.fillRect(-16, -30, 32, 19); c.fillRect(-30, -52, 11, 34); }
  c.restore();
}

export function drawCardArt(cv: HTMLCanvasElement, kind: "night" | "tipped" | "peak") {
  const { c, w, h } = setupCanvas(cv, 110);
  c.fillStyle = "#070a0e"; c.fillRect(0, 0, w, h);
  let seed = kind.length * 97;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  c.fillStyle = "#c9d3de";
  for (let k = 0; k < 50; k++) c.fillRect(rnd() * w, rnd() * h * 0.7, 1, 1);
  const gy = h * 0.72;
  const sunGlow = (x: number, y: number) => {
    const g = c.createRadialGradient(x, y, 2, x, y, 44);
    g.addColorStop(0, "rgba(242,169,59,.9)"); g.addColorStop(1, "rgba(242,169,59,0)");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = SUN; c.beginPath(); c.arc(x, y, 8, 0, 7); c.fill();
  };
  if (kind === "night") {
    c.fillStyle = EARTH; c.beginPath(); c.arc(w * 0.72, h * 0.3, 11, 0, 7); c.fill();
    c.fillStyle = "#1a1f27"; c.fillRect(0, gy, w, h - gy);
    drawLander(c, w * 0.35, gy, 1, { frost: true });
  } else if (kind === "tipped") {
    sunGlow(w * 0.18, gy - 4);
    c.fillStyle = "#3b3934"; c.fillRect(0, gy, w, h - gy);
    drawLander(c, w * 0.6, gy, 1, { tipped: true });
  } else {
    c.fillStyle = "#3b3934"; c.beginPath(); c.moveTo(0, gy); c.lineTo(w * 0.3, gy - 18); c.lineTo(w * 0.5, gy - 26); c.lineTo(w * 0.7, gy - 12); c.lineTo(w, gy); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    sunGlow(w * 0.85, gy - 3);
    c.fillStyle = "#57534b"; c.beginPath(); c.moveTo(w * 0.3, gy - 18); c.lineTo(w * 0.5, gy - 26); c.lineTo(w * 0.52, gy - 24); c.lineTo(w * 0.32, gy - 16); c.fill();
    drawLander(c, w * 0.5, gy - 24, 0.8, {});
  }
}

export type Labels = { sun: string; earth: string; exag: (k: number) => string; panel: string };

export function drawScene(cv: HTMLCanvasElement, sc: Scenario, o: Series, s: SimState, stars: number[][], L: Labels) {
  const { c, w, h } = setupCanvas(cv, 340), i = Math.min(s.i, o.n - 1);
  const center = o.eAz[0];
  let maxEl = 2;
  for (let k = 0; k < sc.hours; k++) maxEl = Math.max(maxEl, o.sEl[k], o.eEl[k]);
  const y0 = h * 0.64, k = Math.max(4, Math.min(18, (y0 - 34) / maxEl));
  const X = (az: number) => ((((az - center + 540) % 360) - 180) / 360) * w + w / 2, Y = (el: number) => y0 - el * k;
  const sun = o.sFrac[i];
  const mono = css("--mono"), body = css("--sans");
  // sky
  c.fillStyle = "#05070a"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#c9d3de";
  for (const [a, b, m] of stars) { c.globalAlpha = 0.3 + 0.6 * m; c.fillRect(a * w, b * y0 * 0.98, m > 0.85 ? 2 : 1, m > 0.85 ? 2 : 1); }
  c.globalAlpha = 1;
  // forecast trails (next 72h)
  for (let q = 0; q <= 72; q += 2) {
    const j = Math.min(o.n - 1, i + q);
    c.fillStyle = "rgba(242,169,59,.35)"; c.fillRect(X(o.sAz[j]) - 1, Y(o.sEl[j]) - 1, 2, 2);
    c.fillStyle = "rgba(110,167,242,.4)"; c.fillRect(X(o.eAz[j]) - 1, Y(o.eEl[j]) - 1, 2, 2);
  }
  // Earth
  const ex = X(o.eAz[i]), ey = Y(o.eEl[i]);
  c.fillStyle = EARTH; c.beginPath(); c.arc(ex, ey, 9, 0, 7); c.fill();
  c.fillStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.arc(ex - 3, ey - 3, 3, 0, 7); c.fill();
  // Sun
  const sx = X(o.sAz[i]), sy = Y(o.sEl[i]);
  const g = c.createRadialGradient(sx, sy, 2, sx, sy, 60);
  g.addColorStop(0, "rgba(255,210,130,.85)"); g.addColorStop(1, "rgba(242,169,59,0)");
  c.fillStyle = g; c.fillRect(sx - 60, sy - 60, 120, 120);
  c.fillStyle = "#ffe2a6"; c.beginPath(); c.arc(sx, sy, 10, 0, 7); c.fill();
  // ground, lit by the Sun
  const mix = (a: number[], b: number[], f: number) => a.map((v, j) => Math.round(v + (b[j] - v) * f));
  const gc = mix([22, 25, 31], [78, 74, 66], sun), gc2 = mix([14, 16, 20], [52, 49, 44], sun);
  const gg = c.createLinearGradient(0, y0, 0, h);
  gg.addColorStop(0, `rgb(${gc})`); gg.addColorStop(1, `rgb(${gc2})`);
  c.fillStyle = gg; c.fillRect(0, y0, w, h - y0);
  c.strokeStyle = sun > 0.5 ? "rgba(255,220,160,.5)" : "rgba(160,180,210,.25)"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, y0 + 0.5); c.lineTo(w, y0 + 0.5); c.stroke();
  c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = 1.5;
  [[0.12, 0.86, 40], [0.78, 0.8, 28], [0.9, 0.93, 50], [0.3, 0.95, 22]].forEach(([a, b, r]) => { c.beginPath(); c.ellipse(a * w, b * h, r, r * 0.22, 0, 0, 7); c.stroke(); });
  // compass + labels
  c.font = `11px ${mono}`; c.fillStyle = "rgba(200,210,220,.55)"; c.textAlign = "center"; c.textBaseline = "top";
  ([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).forEach(([l, a]) => { const x = X(a); if (x > 8 && x < w - 8) c.fillText(l, x, y0 + 4); });
  c.font = `600 12px ${body}`; c.textBaseline = "bottom"; c.textAlign = "left";
  if (sy < y0 + 4) { c.fillStyle = SUN; c.fillText(L.sun, Math.min(sx + 13, w - 50), sy - 6); }
  if (ey < y0 + 4) { c.fillStyle = EARTH; c.fillText(L.earth, Math.min(ex + 12, w - 60), ey - 6); }
  c.font = `11px ${mono}`; c.fillStyle = "rgba(200,210,220,.45)"; c.textAlign = "right"; c.textBaseline = "top";
  c.fillText(L.exag(Math.round(k / (w / 360))), w - 12, 10);
  // lander
  const lx = w / 2, ly = h - 26;
  drawLander(c, lx, ly, 1.25, {
    charge: s.solarW / CFG.solarW, antAng: Math.atan2(ey - (ly - 30), ex - (lx + 8)),
    frost: s.hib && sun < 0.5, dead: s.dead, tipped: sc.panelAz != null,
  });
  if (s.sending) {
    c.strokeStyle = "rgba(110,167,242,.8)"; c.setLineDash([4, 6]); c.lineDashOffset = -s.i * 3; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(lx + 10, ly - 38); c.lineTo(ex, ey); c.stroke(); c.setLineDash([]);
  }
  if (s.hib) { c.fillStyle = "rgba(200,220,255,.8)"; c.font = `600 14px ${mono}`; c.textAlign = "left"; c.fillText("z z", lx + 26, ly - 70); }
  if (sc.panelAz != null) {
    const px = X(sc.panelAz);
    c.strokeStyle = "rgba(242,169,59,.5)"; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(px, y0 - 4); c.lineTo(px, y0 - 34); c.stroke(); c.setLineDash([]);
    c.fillStyle = "rgba(242,169,59,.8)"; c.textAlign = "center"; c.textBaseline = "bottom"; c.font = `11px ${mono}`; c.fillText("▼ " + L.panel, px, y0 - 36);
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
