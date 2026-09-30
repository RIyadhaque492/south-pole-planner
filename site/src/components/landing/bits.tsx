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
