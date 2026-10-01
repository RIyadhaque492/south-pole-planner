"use client";
import { useEffect, useRef } from "react";
import { DAY, horizonFn, type Series, type Site } from "@/lib/ephemeris";
import { css, setupCanvas, useRedrawSignal } from "@/lib/canvas";
import { useI18n } from "@/lib/i18n";

const idxAt = (o: Series, tm: number) => Math.max(0, Math.min(o.n - 1, Math.round((tm - o.t0) / o.step)));

/* ---------- horizon panorama: azimuth across, elevation up ---------- */
export function SkyPanorama({ o, site, t: tm }: { o: Series; site: Site; t: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { t, raw, lang } = useI18n();
  const sig = useRedrawSignal();

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const { c, w, h } = setupCanvas(cv, 270), hz = horizonFn(site);
    const L = 38, Rr = 10, T = 10, B = 26, pw = w - L - Rr, ph = h - T - B;
    let hmax = 0, hmin = 0;
    for (let a = 0; a < 360; a += 2) { hmax = Math.max(hmax, hz(a)); hmin = Math.min(hmin, hz(a)); }
    let smax = -90;
    for (let i = 0; i < o.n; i++) smax = Math.max(smax, o.sEl[i], o.eEl[i]);
    const yTop = Math.ceil(Math.max(smax, hmax) + 1.5), yBot = Math.floor(Math.min(-3, hmin - 1));
    const X = (az: number) => L + (az / 360) * pw, Y = (el: number) => T + ((yTop - el) / (yTop - yBot)) * ph;
    const mono = css("--mono"), body = css("--sans");

    // sky with a faint glow toward the horizon
    const sky = c.createLinearGradient(0, T, 0, T + ph);
    sky.addColorStop(0, css("--sky")); sky.addColorStop(1, css("--bg-2"));
    c.fillStyle = sky; c.fillRect(L, T, pw, ph);
    c.font = `11px ${mono}`; c.fillStyle = css("--faint"); c.strokeStyle = css("--line"); c.lineWidth = 1;
    const yStep = yTop - yBot > 24 ? 5 : 2;
    c.textAlign = "right"; c.textBaseline = "middle";
    for (let e = Math.ceil(yBot / yStep) * yStep; e <= yTop; e += yStep) {
      c.beginPath(); c.moveTo(L, Y(e) + 0.5); c.lineTo(L + pw, Y(e) + 0.5); c.stroke();
      c.fillText(e + "°", L - 6, Y(e));
    }
    c.textAlign = "center"; c.textBaseline = "top";
    raw<string[]>("compass").forEach((lab, k) => {
      const a = k * 45;
      c.beginPath(); c.moveTo(X(a) + 0.5, T); c.lineTo(X(a) + 0.5, T + ph); c.stroke();
      c.fillText(lab, X(a), T + ph + 8);
    });

    // trails over the whole period
    const trail = (azA: Float32Array, elA: Float32Array, col: string) => {
      c.fillStyle = col; c.globalAlpha = 0.3;
      const k = Math.max(1, Math.floor(o.n / 900));
      for (let i = 0; i < o.n; i += k) c.fillRect(X(azA[i]) - 1, Y(elA[i]) - 1, 2, 2);
      c.globalAlpha = 1;
    };
    trail(o.sAz, o.sEl, css("--sun")); trail(o.eAz, o.eEl, css("--earth"));

    // ground
    c.beginPath(); c.moveTo(L, T + ph);
    for (let a = 0; a <= 360; a += 0.5) c.lineTo(X(a), Y(hz(a)));
    c.lineTo(L + pw, T + ph); c.closePath(); c.fillStyle = css("--regolith"); c.fill();
    c.beginPath();
    for (let a = 0; a <= 360; a += 0.5) (a ? c.lineTo : c.moveTo).call(c, X(a), Y(hz(a)));
    c.strokeStyle = css("--regolith-edge"); c.lineWidth = 1.2; c.stroke();

    c.font = `500 11px ${mono}`; c.textAlign = "left"; c.textBaseline = "top"; c.fillStyle = css("--faint");
    c.fillText(t("p.sky").toUpperCase(), L + 10, T + 8);
    c.textBaseline = "bottom"; c.fillStyle = css("--ink"); c.globalAlpha = 0.6;
    c.fillText(t("p.ground").toUpperCase(), L + 10, T + ph - 8); c.globalAlpha = 1;

    // Sun and Earth now
    const i = idxAt(o, tm);
    const bodyAt = (az: number, el: number, col: string, r: number, label: string, glow: boolean) => {
      c.save(); c.beginPath(); c.rect(L, T, pw, ph); c.clip();
      if (glow) {
        const g = c.createRadialGradient(X(az), Y(el), r * 0.5, X(az), Y(el), r * 4.5);
        g.addColorStop(0, col + "66"); g.addColorStop(1, col + "00");
        c.fillStyle = g; c.fillRect(X(az) - r * 5, Y(el) - r * 5, r * 10, r * 10);
      }
      c.beginPath(); c.arc(X(az), Y(el), r, 0, 2 * Math.PI); c.fillStyle = col; c.fill();
      c.lineWidth = 2; c.strokeStyle = css("--panel"); c.stroke(); c.restore();
      c.fillStyle = col; c.font = `600 12.5px ${body}`; c.textAlign = "left"; c.textBaseline = "bottom";
      c.fillText(label, Math.min(X(az) + r + 5, L + pw - 64), Math.max(T + 18, Y(el) - r));
    };
    bodyAt(o.eAz[i], o.eEl[i], css("--earth"), 8, t("earth"), false);
    bodyAt(o.sAz[i], o.sEl[i], css("--sun"), 9, t("sun"), o.sFrac[i] > 0.01);
    c.strokeStyle = css("--line"); c.strokeRect(L + 0.5, T + 0.5, pw - 1, ph - 1);
  }, [o, site, tm, sig, t, raw, lang]);

  return <canvas ref={ref} aria-label="Horizon panorama with Sun and Earth" />;
}

/* ---------- timeline: elevation above the local horizon over the whole period ---------- */
export function Timeline({ o, start, span, mask, t: tm, onSeek }: {
  o: Series; start: number; span: number; mask: number; t: number; onSeek: (tm: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const geo = useRef({ L: 0, pw: 1 });
  const { t, lang } = useI18n();
  const sig = useRedrawSignal();

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const { c, w, h } = setupCanvas(cv, 310);
    const L = lang === "bn" ? 64 : 56, Rr = 10, T = 24, bandH = 10, bands = 3, gap = 6, B = 24 + bands * (bandH + gap) + 6;
    const pw = w - L - Rr, ph = h - T - B;
    geo.current = { L, pw };
    let lo = -3, hi = 3;
    for (let i = 0; i < o.n; i++) { lo = Math.min(lo, o.sAlt[i], o.eAlt[i]); hi = Math.max(hi, o.sAlt[i], o.eAlt[i]); }
    lo = Math.floor(Math.max(lo, -40)) - 1; hi = Math.ceil(Math.min(hi, 40)) + 1;
    const X = (i: number) => L + (i / (o.n - 1)) * pw, Y = (v: number) => T + ((hi - v) / (hi - lo)) * ph;
    const mono = css("--mono"), body = css("--sans");

    c.fillStyle = css("--muted"); c.textAlign = "left"; c.textBaseline = "bottom"; c.font = `11.5px ${body}`;
    c.fillText(t("p.yAxis"), L, T - 8);
    c.font = `11px ${mono}`; c.lineWidth = 1;
    const yStep = hi - lo > 30 ? 10 : hi - lo > 12 ? 5 : 2;
    c.textAlign = "right"; c.textBaseline = "middle";
    for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) {
      c.strokeStyle = css("--line"); c.beginPath(); c.moveTo(L, Y(v) + 0.5); c.lineTo(L + pw, Y(v) + 0.5); c.stroke();
      c.fillStyle = css("--faint"); c.fillText(v + "°", L - 6, Y(v));
    }
    c.fillStyle = css("--regolith"); c.globalAlpha = 0.4; c.fillRect(L, Y(0), pw, Y(lo) - Y(0)); c.globalAlpha = 1;
    c.strokeStyle = css("--regolith-edge"); c.beginPath(); c.moveTo(L, Y(0) + 0.5); c.lineTo(L + pw, Y(0) + 0.5); c.stroke();

    // pick the smallest day step that leaves room for a "Mon 12" label (~52 px) at this chart width
    const days = span / DAY, pxPerDay = pw / days;
    const tickD = [1, 2, 5, 10, 15, 30, 60, 90, 120].find((d) => d * pxPerDay >= 52) ?? 180;
    c.textAlign = "center"; c.textBaseline = "top"; c.fillStyle = css("--faint");
    const bandTop = T + ph + 24;
    for (let d = 0; d <= days; d += tickD) {
      const x = L + ((d * DAY) / span) * pw;
      c.strokeStyle = css("--line"); c.beginPath(); c.moveTo(x + 0.5, T); c.lineTo(x + 0.5, T + ph); c.stroke();
      const dt = new Date(start + d * DAY);
      c.fillText(`${dt.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${dt.getUTCDate()}`, Math.min(Math.max(x, L + 18), L + pw - 18), T + ph + 6);
    }

    const line = (arr: Float32Array, col: string, wid: number) => {
      c.beginPath();
      for (let i = 0; i < o.n; i++) (i ? c.lineTo : c.moveTo).call(c, X(i), Y(Math.max(lo, Math.min(hi, arr[i]))));
      c.strokeStyle = col; c.lineWidth = wid; c.lineJoin = "round"; c.stroke();
    };
    if (mask) {
      c.setLineDash([4, 4]); c.strokeStyle = css("--earth"); c.lineWidth = 1;
      c.beginPath(); c.moveTo(L, Y(mask)); c.lineTo(L + pw, Y(mask)); c.stroke(); c.setLineDash([]);
    }
    line(o.eAlt, css("--earth"), 1.6); line(o.sAlt, css("--sun"), 2);

    const band = (k: number, test: (i: number) => boolean, col: string, label: string) => {
      const y = bandTop + k * (bandH + gap);
      c.fillStyle = css("--bg-2"); c.fillRect(L, y, pw, bandH); c.fillStyle = col;
      let run = -1;
      for (let i = 0; i <= o.n; i++) {
        const on = i < o.n && test(i);
        if (on && run < 0) run = i;
        if (!on && run >= 0) { c.fillRect(X(run), y, Math.max(1, X(i - 1) - X(run) + pw / o.n), bandH); run = -1; }
      }
      c.fillStyle = css("--muted"); c.textAlign = "right"; c.textBaseline = "middle"; c.font = `11px ${body}`;
      c.fillText(label, L - 8, y + bandH / 2);
    };
    band(0, (i) => o.sFrac[i] >= 0.5, css("--sun"), t("p.bPower"));
    band(1, (i) => o.eAlt[i] >= mask, css("--earth"), t("p.bSignal"));
    band(2, (i) => o.sFrac[i] >= 0.5 && o.eAlt[i] >= mask, css("--both"), t("p.bBoth"));

    const ci = idxAt(o, tm), cx = X(ci);
    c.strokeStyle = css("--ink"); c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx + 0.5, T); c.lineTo(cx + 0.5, bandTop + bands * (bandH + gap) - gap); c.stroke();
    ([[o.sAlt, "--sun"], [o.eAlt, "--earth"]] as const).forEach(([a, k]) => {
      c.beginPath(); c.arc(cx, Y(Math.max(lo, Math.min(hi, a[ci]))), 4.5, 0, 7);
      c.fillStyle = css(k); c.fill(); c.strokeStyle = css("--panel"); c.lineWidth = 1.5; c.stroke();
    });
  }, [o, start, span, mask, tm, sig, t, lang]);

  const pick = (ev: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect(), f = (ev.clientX - r.left - geo.current.L) / geo.current.pw;
    if (f >= 0 && f <= 1) onSeek(start + f * span);
  };
  return (
    <canvas
      ref={ref}
      aria-label="Sun and Earth height above the horizon over time"
      style={{ cursor: "ew-resize" }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); }}
      onPointerMove={(e) => { if (e.buttons) pick(e); }}
    />
  );
}

/* ---------- mission strip under each landing window ---------- */
export function WindowStrip({ cells }: { cells: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sig = useRedrawSignal();
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const { c, w } = setupCanvas(cv, 6), n = cells.length;
    const col: Record<string, string> = { both: css("--both"), sun: css("--sun"), earth: css("--earth"), none: css("--line-2") };
    for (let j = 0; j < n; j++) { c.fillStyle = col[cells[j]]; c.fillRect((j / n) * w, 0, w / n + 0.6, 6); }
  }, [cells, sig]);
  return <canvas ref={ref} aria-hidden="true" />;
}
