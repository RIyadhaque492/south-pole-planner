"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { latlon } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { SkyNow } from "@/lib/sky";

/** Sun and Earth at every site right now. Server-rendered, then refreshed from /api/now every minute. */
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

  const both = data.sites.filter((s) => s.power && s.link).length;
  return (
    <div className="live">
      <div className="live-head">
        <div>
          <div className="eyebrow"><span className="pulse" aria-hidden="true" />{t("l.liveKicker")}</div>
          <h2 className="title big">{t("l.liveTitle", { n: both, total: data.sites.length })}</h2>
        </div>
        <div className="live-clock mono" suppressHydrationWarning>{new Date(clock).toISOString().replace("T", " ").slice(0, 19)} UTC</div>
      </div>
      <div className="live-grid">
        {data.sites.map((s) => (
          <Link key={s.id} href={`/sites/${s.id}`} className={`live-card${s.power && s.link ? " good" : ""}`}>
            <div className="lc-top">
              <b>{s.name}</b>
              <span className="lc-id mono">{s.id}</span>
            </div>
            <small className="mono">{latlon(s)}</small>
            <div className="lc-row">
              <span className={`lamp sun${s.power ? " on" : ""}`} />
              <span>{s.power ? t("l.sunUp") : t("l.sunDown")}</span>
              <span className="mono lc-v">{s.sunEl.toFixed(2)}°</span>
            </div>
            <div className="lc-row">
              <span className={`lamp earth${s.link ? " on" : ""}`} />
              <span>{s.link ? t("l.earthUp") : t("l.earthDown")}</span>
              <span className="mono lc-v">{s.earthEl.toFixed(2)}°</span>
            </div>
            <span className="lc-more">{t("l.details")} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
