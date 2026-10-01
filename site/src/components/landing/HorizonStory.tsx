"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DAY, HOUR, SUN_R, diskFrac, loadGeometry, series, type Series } from "@/lib/ephemeris";
import { css } from "@/lib/canvas";
import { useI18n } from "@/lib/i18n";
import { seedById } from "@/lib/sites";

/* "Why it's hard", told as a scene: stand at Shackleton ridge B for one Moon day with the real Sun and Earth.
   The same sky is shown from two places. On a ridge the skyline is low; in a crater the rim is high.
   Skylines are illustrative; Sun and Earth positions are from the JPL ephemeris. */

type Place = "ridge" | "crater";
const LUNAR_DAY_H = Math.round(29.53 * 24);
const EXAG = 16; // px per degree of elevation
const g = (x: number, w: number) => Math.exp(-((x / w) ** 2));
const wrap = (d: number) => ((d + 540) % 360) - 180;

const SKYLINE: Record<Place, (az: number) => number> = {
  // a high ridge: the horizon dips below 0°, a few distant peaks poke up
  ridge: (az) => -0.7 + 1.5 * g(wrap(az - 250), 9) + 1.1 * g(wrap(az - 42), 7) + 0.8 * g(wrap(az - 155), 5) + 0.6 * g(wrap(az - 318), 6) + 0.12 * Math.sin((az * Math.PI) / 11),
  // a crater floor: the rim walls the sky in on every side
  crater: (az) => 2.5 + 0.9 * Math.sin((3 * az * Math.PI) / 180 + 1) + 0.5 * Math.sin((7 * az * Math.PI) / 180) + 0.15 * Math.sin((az * Math.PI) / 9),
};

function tally(o: Series, hz: (az: number) => number) {
  let p = 0, r = 0, b = 0;
  for (let i = 0; i < LUNAR_DAY_H; i++) {
    const sun = diskFrac((o.sEl[i] - hz(o.sAz[i])) / SUN_R) >= 0.5, earth = o.eEl[i] > hz(o.eAz[i]);
    p += +sun; r += +earth; b += +(sun && earth);
  }
  const f = (x: number) => Math.round((x / LUNAR_DAY_H) * 100);
  return { power: f(p), radio: f(r), both: f(b) };
}

export function HorizonStory({ startMs }: { startMs: number }) {
  const { t } = useI18n();
  const cv = useRef<HTMLCanvasElement>(null);
  const [o, setO] = useState<Series | null>(null);
  const [place, setPlace] = useState<Place>("ridge");
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(true);
  const st = useRef({ hour: 0, playing: true, visible: false });

  useEffect(() => {
    let alive = true;
    loadGeometry().then(() => {
      if (alive) setO(series(seedById("B"), startMs, startMs + 30 * DAY, HOUR));
    });
    return () => { alive = false; };
  }, [startMs]);

  const tallies = useMemo(() => (o ? { ridge: tally(o, SKYLINE.ridge), crater: tally(o, SKYLINE.crater) } : null), [o]);

  // animation: a Moon day in about 45 s, only while on screen
  useEffect(() => { st.current.playing = playing; }, [playing]);
  useEffect(() => {
    if (!o) return;
    const canvas = cv.current!;
    const io = new IntersectionObserver(([e]) => { st.current.visible = e.isIntersecting; }, { threshold: 0.15 });
    io.observe(canvas);
    let raf = 0, last = 0, pushed = 0;
    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      const s = st.current, dt = last ? Math.min(100, ts - last) : 16;
      last = ts;
      if (!s.visible) return;
      if (s.playing) s.hour = (s.hour + (dt / 1000) * (LUNAR_DAY_H / 45)) % LUNAR_DAY_H;
      drawScene(canvas, o, s.hour, place, t);
      if (ts - pushed > 100) { pushed = ts; setHour(s.hour); }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [o, place, t]);

  const i = Math.floor(hour), hz = SKYLINE[place];
  const sunOn = o ? diskFrac((o.sEl[i] - hz(o.sAz[i])) / SUN_R) >= 0.5 : false;
  const earthOn = o ? o.eEl[i] > hz(o.eAz[i]) : false;
  const msg = sunOn && earthOn ? t("w.msgBoth") : !sunOn && !earthOn ? t("w.msgNone") : !sunOn ? t("w.msgNoSun") : t("w.msgNoEarth");
  const day = (hour / 24 + 1).toFixed(0);

  return (
    <div className="story">
      <div className="story-stage">
        <canvas ref={cv} aria-label={t("w.canvasLabel")} />
        <div className="story-top">
          <div className="seg story-place" role="group" aria-label={t("w.where")}>
            <button type="button" aria-pressed={place === "ridge"} onClick={() => setPlace("ridge")}>{t("w.ridge")}</button>
            <button type="button" aria-pressed={place === "crater"} onClick={() => setPlace("crater")}>{t("w.crater")}</button>
          </div>
          <div className="story-status">
            <span className={`sp sun${sunOn ? " on" : ""}`}><i />{sunOn ? t("w.pOn") : t("w.pOff")}</span>
            <span className={`sp earth${earthOn ? " on" : ""}`}><i />{earthOn ? t("w.rOn") : t("w.rOff")}</span>
          </div>
        </div>
        <p className={`story-msg${sunOn && earthOn ? " good" : ""}`} aria-live="polite">{msg}</p>
      </div>

      <div className="story-bar">
        <button type="button" className="chip-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? t("p.pause") : t("p.play")}>{playing ? "❚❚" : "▶"}</button>
        <input type="range" min={0} max={LUNAR_DAY_H - 1} step={1} value={Math.floor(hour)} aria-label={t("p.time")}
          onChange={(e) => { setPlaying(false); st.current.hour = +e.target.value; setHour(+e.target.value); }} />
        <span className="mono story-day">{t("w.day", { d: day })}</span>
      </div>

      {tallies && (
        <div className="story-tally">
          <span className="tally-label">{t("w.tally")}</span>
          {(["ridge", "crater"] as const).map((p) => (
            <button key={p} type="button" className={`tally${place === p ? " sel" : ""}`} onClick={() => setPlace(p)}>
              <b>{t(`w.${p}`)}</b>
              <span><i className="d sun" />{t("w.tPower")} <strong>{tallies[p].power}%</strong></span>
              <span><i className="d earth" />{t("w.tRadio")} <strong>{tallies[p].radio}%</strong></span>
            </button>
          ))}
        </div>
      )}
      <p className="story-note">{t("w.note", { k: 5 })}</p>
    </div>
  );
}

/* ---------------- painting ---------------- */

const STARS = (() => {
  let s = 91;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 260 }, () => [r() * 360, r(), r()] as const);
})();

function drawScene(canvas: HTMLCanvasElement, o: Series, hour: number, place: Place, t: (k: string) => string) {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const c = canvas.getContext("2d")!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = r.width, h = r.height, y0 = h * 0.6, hz = SKYLINE[place];
  const i0 = Math.floor(hour), f = hour - i0, i1 = Math.min(o.n - 1, i0 + 1);
  const lerp = (a: Float32Array) => a[i0] + (a[i1] - a[i0]) * f;
  const lerpAz = (a: Float32Array) => (a[i0] + wrap(a[i1] - a[i0]) * f + 360) % 360;
  const sEl = lerp(o.sEl), sAz = lerpAz(o.sAz), eEl = lerp(o.eEl), eAz = lerpAz(o.eAz);
  // keep the Sun and Earth both on screen: centre the view between them
  // phones get a narrower view so the Sun, Earth and lander stay large enough to read
  const mid = (eAz + wrap(sAz - eAz) / 2 + 360) % 360, span = w < 640 ? 200 : 300, small = w < 640;
  const X = (az: number) => w / 2 + (wrap(az - mid) / span) * w, Y = (el: number) => y0 - el * EXAG;
  const sunVis = diskFrac((sEl - hz(sAz)) / SUN_R), earthVis = eEl > hz(eAz);
  const sx = X(sAz), sy = Y(sEl), ex = X(eAz), ey = Y(eEl);
  const sans = css("--sans");

  // sky
  const sky = c.createLinearGradient(0, 0, 0, y0);
  sky.addColorStop(0, "#020306"); sky.addColorStop(1, sunVis > 0.05 ? "#0d1017" : "#06080c");
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  for (const [az, yy, m] of STARS) {
    const x = X(az);
    if (x < 0 || x > w) continue;
    c.globalAlpha = 0.25 + 0.6 * m;
    c.fillStyle = "#dfe6ef";
    c.fillRect(x, yy * (y0 - 30), m > 0.9 ? 2 : 1, m > 0.9 ? 2 : 1);
  }
  c.globalAlpha = 1;

  // Earth, with its real phase (Earth looks fullest when the Sun is behind you)
  const elong = Math.abs(wrap(sAz - eAz)) * (Math.PI / 180);
  drawEarth(c, ex, ey, 17, (1 - Math.cos(elong)) / 2, Math.sign(sx - ex) || 1);

  // Sun: glow, corona, disc
  const glow = c.createRadialGradient(sx, sy, 0, sx, sy, 170);
  glow.addColorStop(0, "rgba(255,226,166,.55)"); glow.addColorStop(0.25, "rgba(242,169,59,.18)"); glow.addColorStop(1, "rgba(242,169,59,0)");
  c.fillStyle = glow; c.fillRect(sx - 170, sy - 170, 340, 340);
  c.fillStyle = "#fff4dc"; c.beginPath(); c.arc(sx, sy, 9, 0, Math.PI * 2); c.fill();

  // far skyline (the one that decides everything), rim-lit toward the Sun
  const skyline = (lift: number) => {
    c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 2) { const az = mid + ((x - w / 2) / w) * span; c.lineTo(x, Y(hz(az) + lift)); }
    c.lineTo(w, h); c.closePath();
  };
  const far = c.createLinearGradient(0, Y(4), 0, y0 + 30);
  far.addColorStop(0, "#3a3833"); far.addColorStop(1, "#1d1c1a");
  skyline(0); c.fillStyle = far; c.fill();
  for (let x = 0; x < w; x += 2) {
    const az = mid + ((x - w / 2) / w) * span, near = Math.exp(-((wrap(az - sAz) / 55) ** 2));
    if (near < 0.03) continue;
    c.strokeStyle = `rgba(255,214,150,${0.85 * near * Math.max(0.15, sunVis)})`; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x, Y(hz(az))); c.lineTo(x + 2, Y(hz(az + (2 / w) * span))); c.stroke();
  }

  // near ground: warm and lit, or cold blue in shadow
  const lit = sunVis;
  const gnd = c.createLinearGradient(0, y0, 0, h);
  gnd.addColorStop(0, mix([34, 36, 42], [96, 90, 80], lit)); gnd.addColorStop(1, mix([12, 14, 19], [48, 45, 40], lit));
  c.fillStyle = gnd;
  c.beginPath(); c.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) c.lineTo(x, y0 + 26 + 6 * Math.sin(x / 90) + 4 * Math.sin(x / 37));
  c.lineTo(w, h); c.closePath(); c.fill();

  // rocks and small craters, lit on the Sun side, shadows stretching away
  const dir = Math.sign(sx - w / 2) || 1;
  const rocks = [[0.12, 0.83, 16], [0.27, 0.93, 10], [0.68, 0.9, 13], [0.84, 0.8, 9], [0.93, 0.95, 18], [0.4, 0.8, 7]];
  for (const [rx, ry, rs] of rocks) {
    const x = rx * w, y = ry * h;
    if (lit > 0.1) {
      c.fillStyle = `rgba(0,0,0,${0.45 * lit})`;
      c.beginPath(); c.ellipse(x - dir * rs * 3.2, y + 2, rs * 3.2, rs * 0.28, 0, 0, Math.PI * 2); c.fill();
    }
    const rg = c.createLinearGradient(x - rs, 0, x + rs, 0);
    const bright = mix([40, 42, 48], [150, 142, 128], lit), dark = mix([18, 20, 26], [60, 56, 50], lit);
    rg.addColorStop(0, dir > 0 ? dark : bright); rg.addColorStop(1, dir > 0 ? bright : dark);
    c.fillStyle = rg; c.beginPath(); c.ellipse(x, y - rs * 0.35, rs, rs * 0.6, 0, Math.PI, 0); c.fill();
  }
  c.strokeStyle = "rgba(0,0,0,.28)"; c.lineWidth = 1.5;
  for (const [cx, cy, cr] of [[0.2, 0.74, 44], [0.58, 0.97, 70], [0.78, 0.72, 30]]) { c.beginPath(); c.ellipse(cx * w, cy * h, cr, cr * 0.18, 0, 0, Math.PI * 2); c.stroke(); }

  // the lander, its shadow and its radio beam
  const lx = w * 0.5, ly = h * 0.8;
  if (lit > 0.1) {
    // a Sun a degree or two up throws a shadow dozens of times longer than the lander is tall
    const len = Math.min(w * 0.42, 12 / Math.tan(Math.max(0.6, sEl - hz(sAz) + 0.8) * (Math.PI / 180)));
    const sh = c.createLinearGradient(lx, 0, lx - dir * len, 0);
    sh.addColorStop(0, `rgba(0,0,0,${0.55 * lit})`); sh.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = sh; c.beginPath(); c.moveTo(lx - 34, ly); c.lineTo(lx - dir * len, ly - 4); c.lineTo(lx - dir * len, ly + 6); c.lineTo(lx + 34, ly + 4); c.closePath(); c.fill();
  }
  const ls = small ? 1.25 : 1.9, antX = lx + 12 * ls, antY = ly - 58 * ls;
  if (earthVis) {
    c.strokeStyle = "rgba(110,167,242,.85)"; c.lineWidth = 1.6; c.setLineDash([5, 7]); c.lineDashOffset = -hour * 40;
    c.beginPath(); c.moveTo(antX, antY); c.lineTo(ex, ey); c.stroke(); c.setLineDash([]);
  }
  drawLander(c, lx, ly, small ? 1.25 : 1.9, lit, earthVis ? Math.atan2(ey - antY, ex - antX) : -1.9, dir);

  // tags on the sky objects
  c.font = `600 12px ${sans}`; c.textBaseline = "bottom";
  const tag = (x: number, y: number, text: string, col: string, shown: boolean) => {
    if (!shown || x < 20 || x > w - 20) return;
    c.fillStyle = col; c.textAlign = x > w - 120 ? "right" : "left";
    c.fillText(text, x + (x > w - 120 ? -14 : 14), y - 10);
  };
  tag(sx, sy, t("sun"), "#ffd48a", sunVis > 0.02);
  tag(ex, ey, t("earth"), "#9cc4f7", earthVis);
}

function mix(a: number[], b: number[], k: number) {
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(",")})`;
}

/** Earth disc with a day side facing the Sun (`toSun` = +1 right, -1 left) and lit fraction `frac`. */
function drawEarth(c: CanvasRenderingContext2D, x: number, y: number, r: number, frac: number, toSun: number) {
  const halo = c.createRadialGradient(x, y, r * 0.8, x, y, r * 2.4);
  halo.addColorStop(0, "rgba(110,167,242,.35)"); halo.addColorStop(1, "rgba(110,167,242,0)");
  c.fillStyle = halo; c.beginPath(); c.arc(x, y, r * 2.4, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#0b1422"; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); // night side
  c.save();
  // day side: half disc toward the Sun plus/minus a terminator ellipse
  c.beginPath();
  c.arc(x, y, r, -Math.PI / 2, Math.PI / 2, toSun < 0);
  const k = Math.abs(1 - 2 * frac) * r;
  // gibbous: the terminator bulges into the night side; crescent: into the day side
  c.ellipse(x, y, k, r, 0, Math.PI / 2, -Math.PI / 2, (frac <= 0.5) !== (toSun < 0));
  c.closePath(); c.clip();
  const sea = c.createRadialGradient(x + toSun * r * 0.4, y - r * 0.3, 1, x, y, r);
  sea.addColorStop(0, "#8fc2ff"); sea.addColorStop(1, "#2a63b8");
  c.fillStyle = sea; c.fillRect(x - r, y - r, 2 * r, 2 * r);
  c.fillStyle = "rgba(96,160,96,.8)";
  c.beginPath(); c.ellipse(x - r * 0.25, y + r * 0.1, r * 0.32, r * 0.2, 0.6, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 1.6;
  c.beginPath(); c.arc(x + r * 0.1, y - r * 0.2, r * 0.55, 3.6, 4.6); c.stroke();
  c.beginPath(); c.arc(x - r * 0.1, y + r * 0.35, r * 0.5, 0.2, 1.3); c.stroke();
  c.restore();
}

function drawLander(c: CanvasRenderingContext2D, x: number, y: number, s: number, lit: number, antAng: number, sunDir: number) {
  c.save(); c.translate(x, y); c.scale(s, s);
  // legs
  c.strokeStyle = lit > 0.1 ? "#aeb5bd" : "#5d646c"; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(-15, -14); c.lineTo(-26, 0); c.moveTo(15, -14); c.lineTo(26, 0); c.moveTo(-6, -14); c.lineTo(-10, 0); c.moveTo(6, -14); c.lineTo(10, 0); c.stroke();
  c.fillStyle = "#7c838c"; for (const fx of [-26, -10, 10, 26]) { c.beginPath(); c.ellipse(fx, 0, 4, 1.4, 0, 0, Math.PI * 2); c.fill(); }
  // body with foil, lit side toward the Sun
  const body = c.createLinearGradient(-18, 0, 18, 0);
  const hi = lit > 0.1 ? "#e9c46a" : "#6a6250", lo = lit > 0.1 ? "#9a7424" : "#3a3526";
  body.addColorStop(0, sunDir > 0 ? lo : hi); body.addColorStop(1, sunDir > 0 ? hi : lo);
  c.fillStyle = body; c.fillRect(-18, -36, 36, 22);
  c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = 0.8;
  for (let k = -14; k < 18; k += 6) { c.beginPath(); c.moveTo(k, -36); c.lineTo(k + 3, -14); c.stroke(); }
  // solar panel mast
  c.fillStyle = "#20324a"; c.fillRect(-36, -64, 13, 40);
  if (lit > 0.05) { c.fillStyle = `rgba(255,190,90,${0.2 + 0.55 * lit})`; c.fillRect(-36, -64, 13, 40); }
  c.strokeStyle = "#9aa3ad"; c.lineWidth = 0.8;
  for (let k = -60; k < -24; k += 8) { c.beginPath(); c.moveTo(-36, k); c.lineTo(-23, k); c.stroke(); }
  c.strokeRect(-36, -64, 13, 40);
  c.strokeStyle = "#9aa3ad"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-23, -34); c.lineTo(-18, -34); c.stroke();
  // antenna dish pointing at Earth
  c.strokeStyle = "#c7cdd4"; c.lineWidth = 2; c.beginPath(); c.moveTo(12, -36); c.lineTo(12, -58); c.stroke();
  c.save(); c.translate(12, -58); c.rotate(antAng);
  c.fillStyle = "#e6ebf0"; c.beginPath(); c.ellipse(4, 0, 3.5, 9, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#8d96a1"; c.lineWidth = 1; c.beginPath(); c.moveTo(4, 0); c.lineTo(11, 0); c.stroke();
  c.restore();
  // frost in the dark
  if (lit < 0.1) { c.fillStyle = "rgba(150,195,255,.28)"; c.fillRect(-18, -36, 36, 22); c.fillRect(-36, -64, 13, 40); }
  c.restore();
}
