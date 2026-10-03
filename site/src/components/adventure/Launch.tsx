"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { setRoar, sfx } from "@/lib/sound";
import { Bubble, HoldButton, TapButton } from "./Bubble";
import { shipImg, type Crew } from "./data";

type Stage = "pad" | "count" | "climb" | "stage" | "coast" | "out";
const IGNITE_S = 1.6;

/** Smoke from the pad: soft grey puffs that billow sideways and fade. */
class Smoke {
  puffs: { x: number; y: number; vx: number; vy: number; r: number; a: number }[] = [];
  constructor(private c: HTMLCanvasElement) {}
  emit(x: number, y: number, n: number, spread: number) {
    for (let i = 0; i < n; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.puffs.push({ x, y, vx: dir * (40 + Math.random() * spread), vy: -10 - Math.random() * 30, r: 20 + Math.random() * 30, a: 0.55 });
    }
  }
  draw(dt: number, scroll: number) {
    const g = this.c.getContext("2d")!, w = this.c.width = this.c.clientWidth, h = this.c.height = this.c.clientHeight;
    g.clearRect(0, 0, w, h);
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.x += p.vx * dt; p.y += p.vy * dt + scroll; p.vx *= 0.985; p.r += dt * 26; p.a -= dt * 0.09;
      if (p.a <= 0 || p.y > h + 200) { this.puffs.splice(i, 1); continue; }
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      gr.addColorStop(0, `rgba(235,232,226,${p.a})`); gr.addColorStop(1, "rgba(210,205,198,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
  }
}

export function Launch({ crew, voice, onDone }: { crew: Crew; voice: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>("pad");
  const [count, setCount] = useState(3);
  const [ignite, setIgnite] = useState(0);
  const [hud, setHud] = useState({ alt: 0, v: 0 });
  const [line, setLine] = useState("pad");
  const root = useRef<HTMLDivElement>(null), smokeC = useRef<HTMLCanvasElement>(null);
  const st = useRef({ stage: "pad" as Stage, holding: false, ignite: 0, p: 0, v: 0, dropT: -1 });
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });

  useEffect(() => { st.current.stage = stage; }, [stage]);

  // The animation loop: altitude `p` (0 on the pad, 1 in space) drives every layer through CSS variables.
  useEffect(() => {
    const smoke = new Smoke(smokeC.current!);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = performance.now(), hudT = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const real = Math.min(0.25, (now - last) / 1000), dt = Math.min(0.05, real); last = now;
      const s = st.current, el = root.current;
      if (!el) return;
      if (s.stage === "pad") {
        s.ignite = s.holding ? Math.min(IGNITE_S, s.ignite + real) : Math.max(0, s.ignite - real * 2);
        setRoar(s.ignite / IGNITE_S * 0.35);
        if (s.holding && Math.random() < s.ignite) smoke.emit(el.clientWidth / 2, el.clientHeight * 0.86, 1, 120);
        if (s.ignite >= IGNITE_S) { s.stage = "count"; setStage("count"); }
        setIgnite(s.ignite / IGNITE_S);
      }
      if (s.stage === "count") { setRoar(0.5); if (Math.random() < 0.7) smoke.emit(el.clientWidth / 2, el.clientHeight * 0.86, 2, 220); }
      let scroll = 0;
      if (s.stage === "climb" || s.stage === "coast" || s.stage === "stage") {
        const accel = s.stage === "stage" ? 0.004 : 0.03 + s.p * 0.05;
        s.v = Math.min(s.stage === "stage" ? 0.03 : 0.14, s.v + accel * real);
        const dp = s.v * real;
        s.p = Math.min(1, s.p + dp);
        scroll = dp * el.clientHeight * 3;
        if (s.p < 0.12 && Math.random() < 0.9) smoke.emit(el.clientWidth / 2, el.clientHeight * (0.86 + s.p * 3), 2, 260);
        setRoar(s.p > 0.75 ? Math.max(0, 1 - (s.p - 0.75) * 4) : 1);
        if (s.stage === "climb" && s.p > 0.46) { s.stage = "stage"; setStage("stage"); setLine("stage"); }
        if (s.stage === "climb" && s.p > 0.2 && line !== "sky") setLine((l) => (l === "liftoff" ? "sky" : l));
        if (s.stage === "coast" && s.p >= 1) { s.stage = "out"; setStage("out"); setRoar(0); setTimeout(() => done.current(), 900); }
      }
      if (s.dropT >= 0) s.dropT += real;
      el.style.setProperty("--p", s.p.toFixed(4));
      el.style.setProperty("--drop", s.dropT < 0 ? "0" : Math.min(1, s.dropT / 2.4).toFixed(3));
      const shake = reduce ? 0 : s.stage === "count" ? 2 : s.stage === "climb" ? 5 * (1 - s.p) + 1.5 : s.stage === "pad" ? s.ignite * 1.5 : 0;
      el.style.setProperty("--sx", `${(Math.random() - 0.5) * shake}px`);
      el.style.setProperty("--sy", `${(Math.random() - 0.5) * shake}px`);
      smoke.draw(dt, scroll);
      hudT += dt;
      if (hudT > 0.1) { hudT = 0; setHud({ alt: Math.round(s.p ** 1.6 * 200), v: Math.round(s.p ** 1.2 * 28000) }); }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); setRoar(0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3, 2, 1, liftoff.
  useEffect(() => {
    if (stage !== "count") return;
    sfx("alert");
    const id = setTimeout(() => {
      if (count > 1) { setCount(count - 1); return; }
      st.current.stage = "climb"; setStage("climb"); setLine("liftoff"); sfx("win");
    }, 900);
    return () => clearTimeout(id);
  }, [stage, count]);

  const drop = () => {
    st.current.dropT = 0; st.current.stage = "coast"; setStage("coast"); setLine("coast"); sfx("clunk");
  };

  const text = line === "pad" ? (ignite > 0.05 ? t("adv.b.holdOn") : t("adv.b.pad")) : line === "liftoff" ? t("adv.b.liftoff") : line === "sky" ? t("adv.b.sky") : line === "stage" ? t("adv.b.stage") : t("adv.b.sky");

  return (
    <div className={`mm-launch s-${stage}`} ref={root}>
      <div className="mm-sky day" /><div className="mm-sky dusk" /><div className="mm-sky space" />
      <div className="mm-stars" />
      <div className="mm-limb" />
      <div className="mm-world">
        <div className="mm-clouds">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div>
        <div className="mm-hills" />
        <div className="mm-pad"><div className="mm-tower" /><div className="mm-deck" /></div>
      </div>
      <canvas ref={smokeC} className="mm-smoke" aria-hidden="true" />
      <div className="mm-rocket">
        <div className="mm-spent" />
        <img src={shipImg(crew.ship)} alt="" draggable={false} />
        <div className="mm-fire" style={{ "--f": stage === "pad" ? ignite * 0.4 : stage === "out" ? 0 : 1 } as React.CSSProperties}><i /><i /><i /></div>
      </div>
      {stage === "count" && <div className="mm-count" key={count}>{count}</div>}
      <div className="mm-hud">
        <span><small>{t("adv.alt")}</small>{t("adv.km", { n: hud.alt })}</span>
        <span><small>{t("adv.speed")}</small>{t("adv.kmh", { n: hud.v.toLocaleString() })}</span>
      </div>
      <div className="mm-flash" />

      {stage !== "out" && stage !== "count" && <Bubble text={text} voice={voice} />}
      <div className="mm-actions">
        {stage === "pad" && <HoldButton label={t("adv.hold")} progress={ignite} onHold={(d) => { st.current.holding = d; if (d) sfx("toggle"); }} />}
        {stage === "stage" && <TapButton label={t("adv.drop")} tone="gold" onTap={drop} />}
      </div>
    </div>
  );
}
