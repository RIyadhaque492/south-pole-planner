"use client";
import type { Stats } from "@/lib/ephemeris";
import { pct } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/** Every section opens the same way: optional step number, a title, one short line on what it shows. */
export function SectionHead({ step, title, help, children }: { step?: number; title: string; help?: string; children?: React.ReactNode }) {
  return (
    <div className="shead">
      <div>
        <h2 className="shead-t">{step != null && <span className="step">{step}</span>}{title}</h2>
        {help && <p className="shead-h">{help}</p>}
      </div>
      {children}
    </div>
  );
}

/** The four numbers that answer "can a lander work here?", shown plainly. */
export function StatChips({ k }: { k: Stats }) {
  const { t, dur } = useI18n();
  const items: [string, string, string][] = [
    ["sun", t("p2.cSun"), pct(k.sun) + "%"],
    ["dark", t("p2.cDark"), k.maxDarkH < 0.5 ? t("zero") : dur(k.maxDarkH)],
    ["earth", t("p2.cEarth"), pct(k.earth) + "%"],
    ["both", t("p2.cBoth"), pct(k.both) + "%"],
  ];
  return (
    <dl className="chips4">
      {items.map(([cls, label, value]) => (
        <div key={cls} className={cls}>
          <dt><span className="dot" />{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
