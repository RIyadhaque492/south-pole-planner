"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

const VOICE_KEY = "mm-voice";
const VOICE_LANG: Record<string, string> = { en: "en", bn: "bn", es: "es" };

export function voicePref() {
  try { return localStorage.getItem(VOICE_KEY) !== "off"; } catch { return true; }
}
export function saveVoicePref(on: boolean) {
  try { localStorage.setItem(VOICE_KEY, on ? "on" : "off"); } catch {}
  if (!on) try { speechSynthesis.cancel(); } catch {}
}

/** Read a line aloud, but only with a voice that really speaks the language (no English voice reading Bengali). */
function speak(text: string, lang: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const want = VOICE_LANG[lang] ?? "en";
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(want));
    if (!voice) return;
    const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, ""));
    u.voice = voice; u.lang = voice.lang; u.rate = 1.02; u.pitch = 1.1;
    synth.speak(u);
  } catch {}
}

/**
 * Mission Control talking: a speech bubble that pops in and types its words out. Tapping it finishes the
 * typing; `onOk` adds a button to carry on. A spinning Earth is the speaker, because that's where Mission Control is.
 */
export function Bubble({ text, onOk, okLabel, voice, children }: { text: string; onOk?: () => void; okLabel?: string; voice: boolean; children?: React.ReactNode }) {
  const { t, lang } = useI18n();
  const [shown, setShown] = useState(0);
  const timer = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restart the typing for each new line
    setShown(0);
    const step = () => setShown((n) => {
      if (n >= text.length) return n;
      timer.current = window.setTimeout(step, text[n] === " " ? 12 : 24);
      return n + 1;
    });
    timer.current = window.setTimeout(step, 260);
    if (voice) speak(text, lang);
    return () => clearTimeout(timer.current);
  }, [text, voice, lang]);

  const done = shown >= text.length;
  return (
    <div className="mm-bubble" key={text} role="status" aria-live="polite" onClick={() => { clearTimeout(timer.current); setShown(text.length); }}>
      <div className="mm-mc" aria-hidden="true"><span className="mm-mc-earth" /></div>
      <div className="mm-bubble-body">
        <span className="mm-mc-name">{t("adv.mc")}</span>
        <p><span>{text.slice(0, shown)}</span><span className="mm-ghost" aria-hidden="true">{text.slice(shown)}</span></p>
        {(children || onOk) && (
          <div className={`mm-bubble-actions ${done ? "on" : ""}`}>
            {children}
            {onOk && <button type="button" className="mm-btn mm-ok" onClick={(e) => { e.stopPropagation(); onOk(); }}>{okLabel ?? t("adv.ok")}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

/** A big round button for press-and-hold tasks (ignite, brake, thrust); `progress` fills its ring. */
export function HoldButton({ label, onHold, progress = 0, tone = "red" }: { label: string; onHold: (down: boolean) => void; progress?: number; tone?: "red" | "blue" | "gold" }) {
  const [down, setDown] = useState(false);
  const set = (v: boolean) => { if (v !== down) { setDown(v); onHold(v); } };
  return (
    <button
      type="button" className={`mm-hold ${tone} ${down ? "down" : ""}`} style={{ "--p": progress } as React.CSSProperties}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(true); }}
      onPointerUp={() => set(false)} onPointerCancel={() => set(false)} onLostPointerCapture={() => set(false)}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); set(true); } }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") set(false); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span>{label}</span>
    </button>
  );
}

/** A big round button for one-tap tasks (fire, drop, photo, jump). */
export function TapButton({ label, onTap, tone = "red", disabled }: { label: string; onTap: () => void; tone?: "red" | "blue" | "gold" | "blue emoji"; disabled?: boolean }) {
  return <button type="button" className={`mm-hold tap ${tone}`} onClick={onTap} disabled={disabled}><span>{label}</span></button>;
}
