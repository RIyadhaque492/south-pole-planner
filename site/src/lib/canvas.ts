"use client";
import { useEffect, useRef, useState } from "react";

/** Size a canvas to its CSS width at device pixel ratio; returns a context in CSS pixels. */
export function setupCanvas(cv: HTMLCanvasElement, h: number) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.style.height = h + "px";
  const W = Math.round(r.width * dpr), H = Math.round(h * dpr);
  // Only reallocate the bitmap when the size changes; reassigning width/height clears it and causes flicker.
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  const c = cv.getContext("2d")!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, r.width, h);
  return { c, w: r.width, h };
}

/** Read a design token from :root. */
export const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** Bumps when the canvas needs a redraw for reasons outside React state: resize, theme or font load. */
export function useRedrawSignal() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const bump = () => setN((x) => x + 1);
    const onResize = () => { clearTimeout(timer); timer = setTimeout(bump, 100); };
    window.addEventListener("resize", onResize);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "lang"] });
    document.fonts?.ready.then(bump);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      mq.removeEventListener("change", bump);
      mo.disconnect();
    };
  }, []);
  return n;
}

/** True when the visitor asked for less motion; canvases then draw still frames. */
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A canvas ref that redraws every frame with the clock in seconds. With reduced motion it draws still frames when `deps` change. */
export function useAnimCanvas(draw: (cv: HTMLCanvasElement, t: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null), fn = useRef(draw);
  const sig = useRedrawSignal();
  useEffect(() => { fn.current = draw; });
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = requestAnimationFrame(function loop(ts) {
      if (ref.current) fn.current(ref.current, ts / 1000);
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (ref.current && reducedMotion()) fn.current(ref.current, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the values the drawing reads
  }, [sig, ...deps]);
  return ref;
}
