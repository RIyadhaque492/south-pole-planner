"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { sfx } from "@/lib/sound";
import { Bubble } from "./Bubble";
import { KIDS, SHIPS, SUITS, kidFace, kidImg, shipImg, suitImg, type Crew, type Kid, type Ship, type Suit } from "./data";

/** A card that leans toward the pointer, like picking up a trading card. */
function TiltCard({ on, onPick, label, children, className = "" }: { on: boolean; onPick: () => void; label: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const tilt = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${-y * 14}deg`); el.style.setProperty("--ry", `${x * 18}deg`);
    el.style.setProperty("--gx", `${(x + 0.5) * 100}%`); el.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
  };
  const reset = () => { ref.current?.style.setProperty("--rx", "0deg"); ref.current?.style.setProperty("--ry", "0deg"); };
  return (
    <button ref={ref} type="button" className={`mm-card ${on ? "on" : ""} ${className}`} aria-pressed={on} aria-label={label}
      onPointerMove={tilt} onPointerLeave={reset} onClick={() => { sfx("toggle"); onPick(); }}>
      <span className="mm-card-shine" aria-hidden="true" />
      {children}
    </button>
  );
}

const STEPS = ["name", "kid", "suit", "ship", "ready"] as const;

export function CrewRoom({ crew, setCrew, voice, onLaunch }: { crew: Crew; setCrew: (c: Crew) => void; voice: boolean; onLaunch: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [suiting, setSuiting] = useState(false);
  const at = STEPS[step];
  const name = crew.name.trim();
  const go = (n: number) => { sfx("send"); setStep(n); };

  // Suiting up: the child's picture flashes into the spacesuit.
  useEffect(() => {
    if (!suiting) return;
    const id = setTimeout(() => setSuiting(false), 1100);
    return () => clearTimeout(id);
  }, [suiting]);

  const line = at === "name" ? t("adv.b.hello") : at === "kid" ? t("adv.b.kid", { name }) : at === "suit" ? t("adv.b.suit") : at === "ship" ? t("adv.b.ship") : t("adv.b.ready", { name });

  return (
    <div className="mm-room">
      <header className="mm-room-head">
        <span className="eyebrow">{t("adv.kicker")}</span>
        <h1 dangerouslySetInnerHTML={{ __html: t("adv.title") }} />
        <ol className="mm-steps" aria-label={t("adv.step", { n: step + 1, total: STEPS.length })}>
          {STEPS.map((s, i) => <li key={s} className={i < step ? "done" : i === step ? "now" : ""} />)}
        </ol>
      </header>

      <section className="mm-room-stage" key={at}>
        {at === "name" && (
          <form className="mm-name" onSubmit={(e) => { e.preventDefault(); if (name) go(1); }}>
            <label htmlFor="mm-name">{t("adv.nameQ")}</label>
            <div className="mm-name-row">
              <input id="mm-name" autoFocus autoComplete="off" maxLength={18} placeholder={t("adv.namePh")} value={crew.name}
                onChange={(e) => setCrew({ ...crew, name: e.target.value.replace(/[<>]/g, "") })} />
              <button type="submit" className="mm-btn mm-go" disabled={!name}>{t("adv.next")} →</button>
            </div>
            <p className="mm-note">{t("adv.nameNote")}</p>
          </form>
        )}

        {at === "kid" && (
          <div className="mm-grid kids" role="group" aria-label={t("adv.kidQ")}>
            {KIDS.map((k, i) => (
              <TiltCard key={k} on={crew.kid === k} label={t("adv.avatar", { n: i + 1 })} onPick={() => setCrew({ ...crew, kid: k as Kid })}>
                <img src={kidImg(k)} alt="" className="mm-kid" draggable={false} />
              </TiltCard>
            ))}
          </div>
        )}

        {at === "suit" && (
          <div className="mm-suit">
            <div className={`mm-suit-hero ${suiting ? "suiting" : ""}`}>
              <img src={suitImg(crew.suit)} alt="" className="mm-suit-big" draggable={false} key={crew.suit} />
              <img src={kidImg(crew.kid)} alt="" className="mm-suit-kid" draggable={false} />
              <span className="mm-sparkles" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</span>
              <span className="mm-badge"><img src={kidFace(crew.kid)} alt="" />{t("adv.you", { name })}</span>
            </div>
            <div className="mm-list" role="group" aria-label={t("adv.suitQ")}>
              {SUITS.map((s) => (
                <TiltCard key={s} on={crew.suit === s} label={t(`adv.suits.${s}`)} className="row" onPick={() => { setCrew({ ...crew, suit: s as Suit }); setSuiting(true); sfx("chime"); }}>
                  <img src={suitImg(s)} alt="" draggable={false} />
                  <span><b>{t(`adv.suits.${s}`)}</b><small>{t(`adv.suitsD.${s}`)}</small></span>
                </TiltCard>
              ))}
            </div>
          </div>
        )}

        {at === "ship" && (
          <div className="mm-grid ships" role="group" aria-label={t("adv.shipQ")}>
            {SHIPS.map((s) => (
              <TiltCard key={s} on={crew.ship === s} label={t(`adv.ships.${s}`)} onPick={() => setCrew({ ...crew, ship: s as Ship })}>
                <img src={shipImg(s)} alt="" className="mm-ship" draggable={false} />
                <span className="mm-card-text"><b>{t(`adv.ships.${s}`)}</b><small>{t(`adv.shipsD.${s}`)}</small></span>
              </TiltCard>
            ))}
          </div>
        )}

        {at === "ready" && (
          <div className="mm-ready">
            <img src={shipImg(crew.ship)} alt="" className="mm-ready-ship" draggable={false} />
            <img src={suitImg(crew.suit)} alt="" className="mm-ready-astro" draggable={false} />
            <span className="mm-badge big"><img src={kidFace(crew.kid)} alt="" />{t("adv.you", { name })}</span>
          </div>
        )}
      </section>

      <Bubble text={line} voice={voice}>
        {step > 0 && <button type="button" className="mm-btn ghost" onClick={() => go(step - 1)}>← {t("adv.back")}</button>}
        {step > 0 && step < STEPS.length - 1 && <button type="button" className="mm-btn mm-go" onClick={() => go(step + 1)}>{t("adv.next")} →</button>}
        {at === "ready" && <button type="button" className="mm-btn mm-go big" onClick={onLaunch}>🚀 {t("adv.go")}</button>}
      </Bubble>
    </div>
  );
}
