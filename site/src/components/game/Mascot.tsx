"use client";
import { useAnimCanvas } from "@/lib/canvas";
import { drawMascot, type Mood } from "./art";

/** The lander character on a small patch of Moon. */
export function Mascot({ mood, height }: { mood: Mood; height?: number }) {
  const ref = useAnimCanvas((cv, t) => drawMascot(cv, mood, t, height), [mood, height]);
  return <canvas ref={ref} className="mascot" aria-hidden="true" />;
}
