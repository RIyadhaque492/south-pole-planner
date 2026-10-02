"use client";
import { useEffect, useId, useRef } from "react";

export type LunaMood = "idle" | "thinking" | "happy";

/**
 * Luna herself: a small moon-robot who floats, blinks and wears a satellite in orbit. Her eyes follow the pointer;
 * while she thinks they scan the sky, and a new answer makes her hop. `still` draws her without motion, for chat avatars.
 */
export function LunaFace({ size = 120, mood = "idle", still = false }: { size?: number; mood?: LunaMood; still?: boolean }) {
  const ref = useRef<SVGSVGElement>(null), id = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el || still) return;
    const look = (e: PointerEvent) => {
      const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const far = Math.hypot(dx, dy) || 1, pull = Math.min(1, far / 160);
      el.style.setProperty("--lx", ((dx / far) * 4 * pull).toFixed(2));
      el.style.setProperty("--ly", ((dy / far) * 3 * pull).toFixed(2));
    };
    window.addEventListener("pointermove", look, { passive: true });
    return () => window.removeEventListener("pointermove", look);
  }, [still]);

  return (
    <svg ref={ref} className={`lunabot ${mood}${still ? " still" : ""}`} viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-moon`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#fbf8ee" /><stop offset="0.6" stopColor="#d9d3c2" /><stop offset="1" stopColor="#aaa391" />
        </radialGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0.55" stopColor="#f2a93b" stopOpacity="0.28" /><stop offset="1" stopColor="#f2a93b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="luna-glow" cx="60" cy="62" r="56" fill={`url(#${id}-glow)`} />
      <g transform="rotate(-18 60 64)">
        <ellipse className="luna-ring" cx="60" cy="64" rx="54" ry="17" />
      </g>
      <g className="luna-body">
        <line x1="60" y1="27" x2="60" y2="15" stroke="#8b8676" strokeWidth="2.5" strokeLinecap="round" />
        <circle className="luna-beacon" cx="60" cy="12" r="4.5" />
        <rect x="19" y="55" width="7" height="15" rx="3.5" fill="#8b8676" />
        <rect x="94" y="55" width="7" height="15" rx="3.5" fill="#8b8676" />
        <circle cx="60" cy="62" r="36" fill={`url(#${id}-moon)`} stroke="#8b8676" strokeWidth="1.5" />
        <circle cx="37" cy="42" r="4.5" fill="#000" opacity="0.09" /><circle cx="85" cy="84" r="4" fill="#000" opacity="0.09" /><circle cx="82" cy="38" r="2.5" fill="#000" opacity="0.09" />
        <rect x="33" y="47" width="54" height="31" rx="15.5" fill="#0b1018" stroke="#2a333d" strokeWidth="1.5" />
        <g className="luna-eyes">
          {mood === "happy" ? (
            <path d="M43.5 63q5.5-7 11 0M65.5 63q5.5-7 11 0" fill="none" stroke="#7fd4ff" strokeWidth="3" strokeLinecap="round" />
          ) : (
            <>
              <ellipse className="luna-eye" cx="49" cy="61" rx="4.8" ry="5.8" fill="#7fd4ff" />
              <ellipse className="luna-eye" cx="71" cy="61" rx="4.8" ry="5.8" fill="#7fd4ff" />
              <circle cx="50.6" cy="58.8" r="1.5" fill="#fff" /><circle cx="72.6" cy="58.8" r="1.5" fill="#fff" />
            </>
          )}
        </g>
        {mood === "thinking"
          ? <circle cx="60" cy="72" r="2.2" fill="#7fd4ff" />
          : <path d={mood === "happy" ? "M53 70q7 6.5 14 0" : "M55 71q5 3.5 10 0"} fill="none" stroke="#7fd4ff" strokeWidth="2.2" strokeLinecap="round" />}
      </g>
      <g transform="rotate(-18 60 64)">
        <g className="luna-sat">
          <rect x="-6.5" y="-1.6" width="4" height="3.2" fill="#6ea7f2" /><rect x="2.5" y="-1.6" width="4" height="3.2" fill="#6ea7f2" />
          <rect x="-2.5" y="-2.5" width="5" height="5" rx="1" fill="#eef0f3" stroke="#8b8676" strokeWidth="0.8" />
        </g>
      </g>
      {mood === "thinking" && (
        <g className="luna-dots" fill="#f2a93b"><circle cx="92" cy="22" r="3" /><circle cx="102" cy="22" r="3" /><circle cx="112" cy="22" r="3" /></g>
      )}
    </svg>
  );
}
