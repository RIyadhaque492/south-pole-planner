"use client";
import Image from "next/image";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

/** Hotspots on the illustrated south-pole scene, as percentages of the picture. */
const SPOTS = [
  { id: "sun", x: 6, y: 39.5, tone: "sun" },
  { id: "earth", x: 52.6, y: 35, tone: "earth" },
  { id: "ridge", x: 27, y: 41, tone: "sun" },
  { id: "shadow", x: 31, y: 49, tone: "both" },
  { id: "crater", x: 85, y: 55, tone: "earth" },
] as const;

/** "Why is the south pole tricky?": tap a dot on the picture to read one idea at a time. */
export function PoleExplainer() {
  const { t } = useI18n();
  const [open, setOpen] = useState<(typeof SPOTS)[number]["id"]>("sun");
  const spot = SPOTS.find((s) => s.id === open)!;
  return (
    <section className="explainer">
      <h2 className="title">{t("g2.x.title")}</h2>
      <p className="sub">{t("g2.x.sub")}</p>
      <div className="explainer-scroll">
        <div className="explainer-pic">
          <Image src="/img/south-pole-full.jpg" alt={t("g2.x.alt")} width={1672} height={941} sizes="(max-width: 760px) 760px, 1300px" />
          {SPOTS.map((s, k) => (
            <button key={s.id} type="button" className={`spot ${s.tone}`} style={{ left: `${s.x}%`, top: `${s.y}%` }}
              aria-pressed={open === s.id} aria-label={t(`g2.x.${s.id}.t`)} onClick={() => setOpen(s.id)}>{k + 1}</button>
          ))}
        </div>
      </div>
      <div className={`explainer-card ${spot.tone}`} key={open} aria-live="polite">
        <span className="n">{SPOTS.indexOf(spot) + 1}</span>
        <div><b>{t(`g2.x.${open}.t`)}</b><p>{t(`g2.x.${open}.d`)}</p></div>
      </div>
    </section>
  );
}
