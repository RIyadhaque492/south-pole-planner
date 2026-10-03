"use client";
/* Game sounds, synthesised with Web Audio so there are no files to download.
   The audio context is created on the first sound, which always follows a click. */

const KEY = "rts-sound";
type Ctor = typeof AudioContext;
let ctx: AudioContext | null = null, hum: { osc: OscillatorNode; gain: GainNode } | null = null;
let muted = false;

export function soundOn() {
  try { muted = localStorage.getItem(KEY) === "off"; } catch {}
  return !muted;
}
export function setSound(on: boolean) {
  muted = !on;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  if (!on) { setHum(false); setRoar(0); }
}

function audio() {
  if (muted) return null;
  const AC: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** One note: frequency glides from `f0` to `f1` over `dur` seconds, starting `at` seconds from now. */
function note(f0: number, f1: number, dur: number, at = 0, vol = 0.12, type: OscillatorType = "sine") {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at, osc = a.createOscillator(), g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t); osc.stop(t + dur + 0.02);
}

export type Sfx = "land" | "toggle" | "sunrise" | "sunset" | "earth" | "alert" | "send" | "sleep" | "win" | "lose" | "pop" | "whoosh" | "shutter" | "chime" | "hop" | "clunk";
const PLAY: Record<Sfx, () => void> = {
  land: () => { note(140, 45, 0.5, 0, 0.2, "triangle"); note(660, 880, 0.18, 0.45); },
  toggle: () => note(520, 660, 0.07, 0, 0.08, "triangle"),
  sunrise: () => [392, 494, 587, 784].forEach((f, k) => note(f, f, 0.22, k * 0.11)),
  sunset: () => [587, 494, 392, 294].forEach((f, k) => note(f, f, 0.24, k * 0.13, 0.1)),
  earth: () => { note(660, 990, 0.16); note(990, 1320, 0.16, 0.14); },
  alert: () => { note(880, 880, 0.12, 0, 0.11, "square"); note(880, 880, 0.12, 0.2, 0.11, "square"); },
  send: () => note(1200, 1800, 0.09, 0, 0.05),
  sleep: () => note(330, 165, 0.6, 0, 0.09),
  win: () => [523, 659, 784, 1047].forEach((f, k) => note(f, f, 0.3, k * 0.14, 0.13, "triangle")),
  lose: () => note(220, 55, 1.1, 0, 0.16, "sawtooth"),
  pop: () => { note(500, 1400, 0.08, 0, 0.12); note(1400, 900, 0.06, 0.06, 0.06); },
  whoosh: () => noise(0.5, 0.18, 2400, 300),
  shutter: () => { noise(0.05, 0.25, 6000, 4000); noise(0.06, 0.2, 5000, 3000, 0.09); },
  chime: () => [784, 988, 1175].forEach((f, k) => note(f, f, 0.5, k * 0.08, 0.08)),
  hop: () => note(260, 520, 0.35, 0, 0.1, "triangle"),
  clunk: () => { noise(0.25, 0.3, 500, 120); note(110, 60, 0.3, 0, 0.18, "triangle"); },
};

/** A burst of filtered noise whose filter glides from `f0` to `f1` Hz: whooshes, clicks, thumps. */
function noise(dur: number, vol: number, f0: number, f1: number, at = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at, src = a.createBufferSource(), filt = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noiseBuffer(a);
  filt.type = "bandpass"; filt.Q.value = 0.8;
  filt.frequency.setValueAtTime(f0, t);
  filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(a.destination);
  src.start(t); src.stop(t + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(a: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

let roar: { src: AudioBufferSourceNode; gain: GainNode; filt: BiquadFilterNode } | null = null;
/** Rocket-engine roar: `level` 0 is silent, 1 is a full-thrust rumble. Keeps running until set back to 0. */
export function setRoar(level: number) {
  try {
    if (level <= 0) {
      if (roar && ctx) { roar.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); roar.src.stop(ctx.currentTime + 1.5); }
      roar = null;
      return;
    }
    const a = audio();
    if (!a) return;
    if (!roar) {
      const src = a.createBufferSource(), filt = a.createBiquadFilter(), gain = a.createGain();
      src.buffer = noiseBuffer(a); src.loop = true;
      filt.type = "lowpass"; filt.frequency.value = 300;
      gain.gain.value = 0.0001;
      src.connect(filt).connect(gain).connect(a.destination);
      src.start();
      roar = { src, gain, filt };
    }
    roar.gain.gain.setTargetAtTime(0.32 * level, a.currentTime, 0.15);
    roar.filt.frequency.setTargetAtTime(160 + 500 * level, a.currentTime, 0.2);
  } catch {}
}
export const sfx = (name: Sfx) => { try { PLAY[name](); } catch {} };

/** A quiet low hum while the lander is awake and time is running. */
export function setHum(on: boolean) {
  try {
    if (!on) {
      if (hum && ctx) { hum.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15); hum.osc.stop(ctx.currentTime + 0.6); }
      hum = null;
      return;
    }
    const a = audio();
    if (!a || hum) return;
    const osc = a.createOscillator(), gain = a.createGain();
    osc.type = "sine"; osc.frequency.value = 62;
    gain.gain.setValueAtTime(0.0001, a.currentTime);
    gain.gain.setTargetAtTime(0.035, a.currentTime, 0.4);
    osc.connect(gain).connect(a.destination);
    osc.start();
    hum = { osc, gain };
  } catch {}
}
