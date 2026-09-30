"use client";
import { useEffect, useRef, useState } from "react";
import { DAY, HOUR, T_MAX, T_MIN, loadGeometry, subLongitudes } from "@/lib/ephemeris";
import { useI18n } from "@/lib/i18n";
import { css } from "@/lib/canvas";
import { buildHeightmap, litAt, makeShader, toWorld, type ShadeFrame } from "./poleTerrain";

const PINS = [
  { id: "A", lat: -89.68, lon: -166.0 },
  { id: "B", lat: -89.44, lon: -141.8 },
  { id: "C", lat: -88.71, lon: -68.7 },
  { id: "D", lat: -88.79, lon: 124.5 },
];
const LABELS = [
  { name: "Shackleton", lat: -89.67, lon: 129.8 },
  { name: "de Gerlache", lat: -88.5, lon: -87.1 },
];
const SPEEDS = [0.25, 1, 4]; // Earth days per second

/**
 * The lunar south pole as the Sun circles it. Relief is illustrative; the Sun's direction and height
 * are the real ones for the displayed moment (JPL DE421), sped up so a lunar day passes in about 30 s.
 */
export function TerrainHero({ startMs }: { startMs: number }) {
  const { t } = useI18n();
  const cv = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ t: startMs, sunEl: 0, lit: 0, sunLon: 0 });
  const [playing, setPlaying] = useState(true);
  const [speedIx, setSpeedIx] = useState(1);
  const [ready, setReady] = useState(false);
  const st = useRef({ t: startMs, playing: true, speed: 1, drag: null as null | { x: number; t: number }, visible: true });

  useEffect(() => { st.current.playing = playing; }, [playing]);
  useEffect(() => { st.current.speed = SPEEDS[speedIx]; }, [speedIx]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- motion preference is only known in the browser
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { st.current.playing = false; setPlaying(false); }
    let raf = 0, alive = true, last = 0, hudAt = 0;
    const off = document.createElement("canvas");
    const io = new IntersectionObserver(([e]) => { st.current.visible = e.isIntersecting; });
    if (cv.current) io.observe(cv.current);

    loadGeometry().then(() => {
      if (!alive) return;
      const shade = makeShader(buildHeightmap());
      setReady(true);
      const frame = (ts: number) => {
        if (!alive) return;
        raf = requestAnimationFrame(frame);
        const s = st.current, canvas = cv.current;
        if (!canvas || !s.visible) { last = ts; return; }
        const dt = last ? Math.min(100, ts - last) : 16;
        last = ts;
        if (s.playing && !s.drag) s.t += (dt / 1000) * s.speed * DAY;
        if (s.t > T_MAX - DAY) s.t = T_MIN + DAY;

        const g = subLongitudes(s.t), sunEl = -g.sunLat;
        const f = shade(g.sun, sunEl);
        draw(canvas, off, f, g.sun, sunEl, g.earth);
        if (ts - hudAt > 120) {
          hudAt = ts;
          const lit = PINS.filter((p) => { const [x, y] = toWorld(p.lat, p.lon); return litAt(f, g.sun, x, y); }).length;
          setHud({ t: s.t, sunEl, lit, sunLon: g.sun });
        }
      };
      raf = requestAnimationFrame(frame);
    });
    return () => { alive = false; cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  const d = new Date(hud.t);
  const date = d.toISOString().slice(0, 10), time = d.toISOString().slice(11, 16);
  return (
    <div className={`terrain${ready ? " ready" : ""}`}>
      <canvas
        ref={cv}
        aria-label="Animated map of the lunar south pole lit by the Sun"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); st.current.drag = { x: e.clientX, t: st.current.t }; }}
        onPointerMove={(e) => {
          const dr = st.current.drag;
          if (dr) st.current.t = Math.max(T_MIN, Math.min(T_MAX - DAY, dr.t + (e.clientX - dr.x) * 3 * HOUR));
        }}
        onPointerUp={() => { st.current.drag = null; }}
      />
      <div className="terrain-hud">
        <div className="clock mono"><span>{date}</span><b>{time}</b><span>UTC</span></div>
        <div className="readouts">
          <div><span className="k">{t("l.sunAtPole")}</span><span className="v mono">{hud.sunEl >= 0 ? "+" : ""}{hud.sunEl.toFixed(2)}°</span></div>
          <div><span className="k">{t("l.sitesLit")}</span><span className="v mono">{hud.lit} / {PINS.length}</span></div>
        </div>
        <div className="terrain-ctl">
          <button type="button" className="chip-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? t("p.pause") : t("p.play")}>
            {playing ? "❚❚" : "▶"}
          </button>
          {SPEEDS.map((v, k) => (
            <button key={v} type="button" className="chip-btn" aria-pressed={k === speedIx} onClick={() => setSpeedIx(k)}>
              {t("l.speed", { n: v })}
            </button>
          ))}
        </div>
      </div>
      <p className="terrain-note">{t("l.terrainNote")}</p>
    </div>
  );
}

function draw(canvas: HTMLCanvasElement, off: HTMLCanvasElement, f: ShadeFrame, sunLon: number, sunEl: number, earthLon: number) {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const c = canvas.getContext("2d")!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = r.width, h = r.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 40;
  c.clearRect(0, 0, w, h);
  const mono = css("--mono"), sans = css("--sans");

  if (off.width !== f.M) { off.width = f.M; off.height = f.M; }
  off.getContext("2d")!.putImageData(f.image, 0, 0);

  const L = (sunLon * Math.PI) / 180;
  const dir = (lon: number, rad: number) => { const a = (lon * Math.PI) / 180; return [cx + rad * Math.sin(a), cy - rad * Math.cos(a)] as const; };

  // sunlight glow: a CSS layer outside the canvas, so it never clips at the canvas edge
  const box = canvas.parentElement;
  if (box) {
    box.style.setProperty("--sx", `${50 + 50 * Math.sin(L)}%`);
    box.style.setProperty("--sy", `${50 - 50 * Math.cos(L)}%`);
    box.style.setProperty("--glow", sunEl > -1.6 ? "0.32" : "0.12");
  }

  // terrain disc
  c.save();
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
  c.translate(cx, cy); c.rotate(L);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
  const s = R * f.E;
  c.drawImage(off, -s, -s, 2 * s, 2 * s);
  c.restore();
  // vignette to sell the sphere
  const vg = c.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.45)");
  c.fillStyle = vg; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();

  // graticule
  c.strokeStyle = "rgba(231,234,238,.10)"; c.lineWidth = 1;
  for (const deg of [0.5, 1, 1.5]) { c.beginPath(); c.arc(cx, cy, (deg / 1.8) * R, 0, Math.PI * 2); c.stroke(); }
  c.strokeStyle = "rgba(231,234,238,.35)"; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  c.font = `10px ${mono}`; c.textAlign = "center"; c.textBaseline = "middle";
  for (let lon = 0; lon < 360; lon += 30) {
    const [x1, y1] = dir(lon, R), [x2, y2] = dir(lon, R + 5), [lx, ly] = dir(lon, R + 16);
    c.strokeStyle = "rgba(231,234,238,.35)"; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.fillStyle = "rgba(231,234,238,.45)";
    c.fillText(lon === 0 ? "0°" : lon === 180 ? "180°" : lon < 180 ? `${lon}°E` : `${360 - lon}°W`, lx, ly);
  }

  // place names and site pins
  c.font = `500 13px ${sans}`; c.fillStyle = "rgba(231,234,238,.55)";
  for (const p of LABELS) { const [x, y] = toWorld(p.lat, p.lon); c.fillText(p.name, cx + x * R, cy + y * R + 26); }
  c.font = `600 11px ${sans}`;
  for (const p of PINS) {
    const [x, y] = toWorld(p.lat, p.lon), px = cx + x * R, py = cy + y * R, on = litAt(f, sunLon, x, y);
    if (on) {
      const pg = c.createRadialGradient(px, py, 0, px, py, 18);
      pg.addColorStop(0, "rgba(255,210,130,.75)"); pg.addColorStop(1, "rgba(255,210,130,0)");
      c.fillStyle = pg; c.beginPath(); c.arc(px, py, 18, 0, Math.PI * 2); c.fill();
    }
    c.beginPath(); c.arc(px, py, 4.5, 0, Math.PI * 2);
    c.fillStyle = on ? "#ffd48a" : "#0a0d11"; c.fill();
    c.strokeStyle = on ? "#fff3d6" : "rgba(231,234,238,.7)"; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = on ? "#ffe2a6" : "rgba(231,234,238,.7)"; c.textAlign = "left";
    c.fillText(p.id, px + 8, py - 7);
  }
  c.textAlign = "center";

  // Sun and Earth on the rim
  const [sx, sy] = dir(sunLon, R + 2);
  const sg = c.createRadialGradient(sx, sy, 0, sx, sy, 30);
  sg.addColorStop(0, "rgba(255,226,166,1)"); sg.addColorStop(0.3, "rgba(242,169,59,.6)"); sg.addColorStop(1, "rgba(242,169,59,0)");
  c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, 30, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#fff1cf"; c.beginPath(); c.arc(sx, sy, 7, 0, Math.PI * 2); c.fill();
  const [ex, ey] = dir(earthLon, R + 2);
  c.fillStyle = "#6ea7f2"; c.beginPath(); c.arc(ex, ey, 6, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "rgba(110,167,242,.4)"; c.beginPath(); c.arc(ex, ey, 10, 0, Math.PI * 2); c.stroke();
}
