"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { SkyNow } from "@/lib/sky";
import { SectionHead } from "@/components/ui";

/** Sun and Earth at every site right now, as one list. Server-rendered, refreshed from /api/now every minute. */
export function LiveBoard({ initial }: { initial: { t: number; sites: SkyNow[] } }) {
  const { t } = useI18n();
  const [data, setData] = useState(initial);
  const [clock, setClock] = useState(initial.t);

  useEffect(() => {
    const tick = setInterval(() => setClock((c) => c + 1000), 1000);
    const poll = setInterval(async () => {
      try {
        const r = await fetch("/api/now", { cache: "no-store" });
        if (r.ok) { const j = await r.json(); setData(j); setClock(j.t); }
      } catch {}
    }, 60_000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, []);

  const status = (s: SkyNow) =>
    s.power && s.link ? ["ready", t("l2.ready")] : s.power ? ["warn", t("l2.noSignal")] : s.link ? ["warn", t("l2.noPower")] : ["off", t("l2.offline")];

  return (
    <div>
      <SectionHead title={t("l2.liveT")} help={t("l2.liveH")}>
        <span className="live-clock mono" suppressHydrationWarning><span className="pulse" aria-hidden="true" />{new Date(clock).toISOString().slice(11, 19)} UTC</span>
      </SectionHead>
      <div className="livelist" role="table" aria-label={t("l2.liveT")}>
        <div className="ll-row ll-head" role="row">
          <span role="columnheader">{t("l2.colSite")}</span>
          <span role="columnheader">{t("l2.colSun")}</span>
          <span role="columnheader">{t("l2.colEarth")}</span>
          <span role="columnheader">{t("l2.colStatus")}</span>
        </div>
        {data.sites.map((s) => {
          const [cls, label] = status(s);
          return (
            <Link key={s.id} href={`/sites/${s.id}`} className="ll-row" role="row">
              <span role="cell" className="ll-name">{s.name}</span>
              <span role="cell"><span className={`lamp sun${s.power ? " on" : ""}`} />{s.power ? t("l2.up") : t("l2.down")}</span>
              <span role="cell"><span className={`lamp earth${s.link ? " on" : ""}`} />{s.link ? t("l2.visible") : t("l2.hidden")}</span>
              <span role="cell"><span className={`badge ${cls}`}>{label}</span></span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
