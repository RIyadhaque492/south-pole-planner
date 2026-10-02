"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useMotionTemplate, useSpring } from "motion/react";

/** [start, length] in samples. */
export type Run = [number, number];
export type Mark = { at: number; label: string; tone: "land" | "end" };
export const SPEEDS = [1, 2, 4];

const SPRING = { stiffness: 520, damping: 46, mass: 0.6 };

/**
 * The play bar under a sky view: play/pause, speed, and a scrubbable timeline with one lane for sunlight and one
 * for Earth. A hidden range input does the real work, so keyboard and screen readers get a plain slider.
 */
export function TimeBar(p: {
  n: number; i: number; onSeek: (i: number) => void;
  playing: boolean; onToggle: () => void; speed: number; onSpeed: (v: number) => void;
  sun: Run[]; earth: Run[];
  /** Text for a sample: the readout shows it for `i`, the bubble for wherever the pointer is. */
  labelAt: (i: number) => string;
  /** Samples per Earth day, for the day ruler. */
  perDay: number;
  /** Changes when the lanes describe a different place, so they draw themselves in again. */
  laneKey: string;
  marks?: Mark[];
  playLabel: string; pauseLabel: string; speedLabel: string; sliderLabel: string;
  reset: { label: string; disabled: boolean; onClick: () => void };
  legend: ReactNode;
}) {
  const id = useId(), last = p.n - 1, pos = (k: number) => (k / last) * 100;
  const [hover, setHover] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const x = useSpring(pos(p.i), SPRING), left = useMotionTemplate`${x}%`;
  useEffect(() => { x.set(pos(p.i)); });

  const lane = (kind: "sun" | "earth", runs: Run[]) => (
    <div className={`tbar-lane ${kind}`}>
      {runs.map(([a, len], j) => (
        <motion.i key={a} style={{ left: `${(a / p.n) * 100}%`, width: `${(len / p.n) * 100}%` }}
          initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 30, delay: 0.04 * j }} />
      ))}
    </div>
  );
  const tip = held ? p.i : hover;

  return (
    <MotionConfig reducedMotion="user">
      <div className="tbar">
        <div className="tbar-head">
          <motion.button type="button" className="tbar-play" onClick={p.onToggle} aria-pressed={p.playing}
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.94 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}>
            <span className="tbar-icon" aria-hidden="true">
              <AnimatePresence mode="wait" initial={false}>
                <motion.svg key={p.playing ? "pause" : "play"} viewBox="0 0 16 16" width="14" height="14"
                  initial={{ scale: 0.3, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.3, opacity: 0, rotate: 40 }}
                  transition={{ duration: 0.13 }}>
                  {p.playing ? <path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" /> : <path d="M4 2.2v11.6a.6.6 0 0 0 .92.5l9-5.8a.6.6 0 0 0 0-1l-9-5.8A.6.6 0 0 0 4 2.2z" />}
                </motion.svg>
              </AnimatePresence>
            </span>
            {p.playing ? p.pauseLabel : p.playLabel}
          </motion.button>

          <span className="tbar-time mono">{p.labelAt(p.i)}</span>

          <div className="tbar-tools">
            <div className="tbar-speed" role="group" aria-label={p.speedLabel}>
              {SPEEDS.map((v) => (
                <button key={v} type="button" aria-pressed={p.speed === v} onClick={() => p.onSpeed(v)}>
                  {p.speed === v && <motion.span layoutId={`${id}-speed`} className="tbar-pill" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}
                  <span>{v}×</span>
                </button>
              ))}
            </div>
            <motion.button type="button" className="tbar-reset" disabled={p.reset.disabled} onClick={p.reset.onClick} whileTap={{ scale: 0.94 }}>
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.6h2.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {p.reset.label}
            </motion.button>
          </div>
        </div>

        <div className={`tbar-track${p.marks ? " marked" : ""}${p.playing ? " playing" : ""}${held ? " held" : ""}`}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / r.width) * last)))); }}
          onPointerLeave={() => setHover(null)} onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerCancel={() => setHeld(false)}>
          {p.marks?.map((m) => <span key={m.tone} className={`tbar-flag ${m.tone}`} style={{ left: `${pos(m.at)}%` }}>{m.label}</span>)}
          <div key={p.laneKey} className="tbar-lanes" style={{ backgroundSize: `${(p.perDay / last) * 100}% 100%` }}>
            {lane("sun", p.sun)}
            {lane("earth", p.earth)}
            <motion.div className="tbar-ahead" style={{ left }} />
          </div>
          {hover != null && !held && <span className="tbar-ghost" style={{ left: `${pos(hover)}%` }} />}
          <motion.span className="tbar-thumb" style={{ left }}><i /></motion.span>
          <AnimatePresence>
            {tip != null && (
              <motion.span key="tip" className="tbar-tip mono" style={{ left: `clamp(70px, ${pos(tip)}%, calc(100% - 70px))`, x: "-50%" }}
                initial={{ opacity: 0, y: 6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.96 }} transition={{ duration: 0.14 }}>
                {p.labelAt(tip)}
              </motion.span>
            )}
          </AnimatePresence>
          <input type="range" min={0} max={last} step={1} value={p.i} aria-label={p.sliderLabel} aria-valuetext={p.labelAt(p.i)}
            onChange={(e) => p.onSeek(+e.target.value)} />
        </div>

        <div className="strip-legend">{p.legend}</div>
      </div>
    </MotionConfig>
  );
}
