"use client";
import { useEffect, useRef, useState } from "react";

/** Fades and lifts its children into view the first time they scroll on screen. */
export function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal${shown ? " in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Counts up to `to` once visible. */
export function CountUp({ to, decimals = 0, suffix = "" }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 1200), ease = 1 - Math.pow(1 - k, 3);
        setV(to * ease);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{v.toFixed(decimals)}{suffix}</span>;
}

/** Sun and Earth elevation traces as one SVG, zero line = flat horizon. */
export function Sparkline({ sun, earth, height = 90 }: { sun: number[]; earth: number[]; height?: number }) {
  const W = 600, H = height, all = [...sun, ...earth, 0];
  const lo = Math.min(...all) - 0.5, hi = Math.max(...all) + 0.5;
  const X = (i: number, n: number) => (i / (n - 1)) * W, Y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const path = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${X(i, a.length).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
  const y0 = Y(0);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y={y0} width={W} height={Math.max(0, H - y0)} fill="var(--regolith)" opacity="0.35" />
      <line x1="0" x2={W} y1={y0} y2={y0} stroke="var(--regolith-edge)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={path(earth)} fill="none" stroke="var(--earth)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <path d={path(sun)} fill="none" stroke="var(--sun)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Power: the Sun skims along a jagged horizon, dipping behind a peak. */
export function PowerArt() {
  return (
    <svg className="cart" viewBox="0 0 320 140" aria-hidden="true">
      <defs>
        <radialGradient id="sg"><stop offset="0" stopColor="#ffe2a6" /><stop offset=".35" stopColor="#f2a93b" stopOpacity=".7" /><stop offset="1" stopColor="#f2a93b" stopOpacity="0" /></radialGradient>
        <linearGradient id="gnd" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--regolith)" /><stop offset="1" stopColor="var(--bg-2)" /></linearGradient>
      </defs>
      <g className="sun-skim"><circle r="26" fill="url(#sg)" /><circle r="7" fill="#fff1cf" /></g>
      <path d="M0 96 L40 92 L70 84 L96 90 L130 70 L150 60 L168 74 L200 86 L240 80 L270 90 L320 88 L320 140 L0 140Z" fill="url(#gnd)" />
      <path d="M0 96 L40 92 L70 84 L96 90 L130 70 L150 60 L168 74 L200 86 L240 80 L270 90 L320 88" fill="none" stroke="var(--regolith-edge)" />
      <g className="panel-lamp"><rect x="146" y="46" width="8" height="14" rx="1" /></g>
    </svg>
  );
}

/** Link: Earth bobs above and below the horizon as the Moon librates. */
export function LinkArt() {
  return (
    <svg className="cart" viewBox="0 0 320 140" aria-hidden="true">
      <g className="earth-bob"><circle cx="210" cy="0" r="13" fill="#6ea7f2" /><circle cx="205" cy="-4" r="4" fill="#fff" opacity=".5" /></g>
      <rect x="0" y="92" width="320" height="48" fill="var(--bg-2)" />
      <line x1="0" x2="320" y1="92" y2="92" stroke="var(--regolith-edge)" />
      <g stroke="var(--muted)" strokeWidth="2" fill="none">
        <path d="M90 92 L96 72 L102 92 M96 72 L96 64" />
        <path d="M96 64 q10 -6 14 4" />
      </g>
      <path className="beam" d="M104 64 L210 30" stroke="#6ea7f2" strokeWidth="1.5" strokeDasharray="4 5" fill="none" />
    </svg>
  );
}
