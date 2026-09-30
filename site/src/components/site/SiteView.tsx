"use client";
import Link from "next/link";
import type { Stats } from "@/lib/ephemeris";
import { latlon, pct } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Outlook, SiteSeed, SkyNow } from "@/lib/sky";
import { Reveal, Sparkline } from "@/components/landing/bits";

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

function StatRow({ k }: { k: Stats }) {
  const { t, dur } = useI18n();
  return (
    <div className="kpis">
      <div className="kpi sun"><div className="k">{t("p.kSun")}</div><div className="v">{pct(k.sun)}<small>%</small></div><div className="meter"><i style={{ width: `${k.sun * 100}%` }} /></div></div>
      <div className="kpi sun"><div className="k">{t("p.kDark")}</div><div className="v">{dur(k.maxDarkH)}</div></div>
      <div className="kpi earth"><div className="k">{t("p.kEarth")}</div><div className="v">{pct(k.earth)}<small>%</small></div><div className="meter"><i style={{ width: `${k.earth * 100}%` }} /></div></div>
      <div className="kpi both"><div className="k">{t("p.kBoth")}</div><div className="v">{pct(k.both)}<small>%</small></div><div className="meter"><i style={{ width: `${k.both * 100}%` }} /></div></div>
    </div>
  );
}

export function SiteView({ site, now, month, year, others }: {
  site: SiteSeed; now: SkyNow; month: Outlook; year: { stats: Stats; sun: number[]; earth: number[] };
  others: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  return (
    <main>
      <section className="space site-hero">
        <div className="starfield" aria-hidden="true" />
        <div className="wrap">
          <Link href="/" className="crumb">← {t("s.back")}</Link>
          <div className="site-hero-grid">
            <div>
              <div className="eyebrow">{t("s.kicker")} · {site.id}</div>
              <h1>{site.name}</h1>
              <p className="mono coords">{latlon(site)}{site.pub ? ` · ${t("s.pub", { p: site.pub })}` : ""}</p>
              <div className="cta-row">
                <Link href={`/planner?site=${site.id}`} className="btn accent lg">{t("s.open")} →</Link>
                <a href={`/api/sky?site=${site.id}&days=30`} className="btn ghost lg">JSON</a>
              </div>
            </div>
            <div className="now-card">
              <div className="eyebrow"><span className="pulse" aria-hidden="true" />{t("s.now")} · {iso(month.from)} UTC</div>
              <div className={`now-row${now.power ? " on sun" : ""}`}>
                <span className={`lamp sun${now.power ? " on" : ""}`} />
                <div><b>{now.power ? t("l.sunUp") : t("l.sunDown")}</b><small className="mono">el {now.sunEl.toFixed(2)}° · az {now.sunAz.toFixed(0)}°</small></div>
              </div>
              <div className={`now-row${now.link ? " on earth" : ""}`}>
                <span className={`lamp earth${now.link ? " on" : ""}`} />
                <div><b>{now.link ? t("l.earthUp") : t("l.earthDown")}</b><small className="mono">el {now.earthEl.toFixed(2)}° · az {now.earthAz.toFixed(0)}°</small></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <Reveal>
          <section className="band">
            <div className="eyebrow">{t("s.monthKicker")}</div>
            <h2 className="title big">{t("s.monthTitle")}</h2>
            <div className="panel" style={{ marginTop: 18 }}>
              <div className="panel-head">
                <span className="legend"><span><i style={{ background: "var(--sun)" }} />{t("sun")}</span><span><i style={{ background: "var(--earth)" }} />{t("earth")}</span><span><i style={{ background: "var(--regolith)" }} />{t("p.ground")}</span></span>
                <span className="hint">{t("p.yAxis")}</span>
              </div>
              <Sparkline sun={month.sun} earth={month.earth} height={170} />
            </div>
            <div style={{ marginTop: 16 }}><StatRow k={month.stats} /></div>
          </section>
        </Reveal>

        <div className="two">
          <Reveal>
            <section className="panel">
              <div className="eyebrow">{t("s.eventsTitle")}</div>
              {month.events.length === 0 ? <p className="sub">{t("s.noEvents")}</p> : (
                <ol className="timeline-list">
                  {month.events.slice(0, 12).map((e) => (
                    <li key={e.kind + e.t}>
                      <span className={`ev-dot ${e.kind.startsWith("sun") ? "sun" : "earth"}`} />
                      <span>{t("s.ev." + e.kind)}</span>
                      <time className="mono">{iso(e.t)}</time>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </Reveal>
          <Reveal delay={100}>
            <section className="panel">
              <div className="eyebrow">{t("s.yearTitle")}</div>
              <div style={{ margin: "14px 0" }}><Sparkline sun={year.sun} earth={year.earth} height={110} /></div>
              <StatRow k={year.stats} />
              <p className="hint" style={{ marginTop: 12 }}>{t("p.vTerrain")}</p>
            </section>
          </Reveal>
        </div>

        <Reveal>
          <nav className="band other-sites" aria-label={t("s.others")}>
            <div className="eyebrow">{t("s.others")}</div>
            <div className="chips">
              {others.map((o) => <Link key={o.id} href={`/sites/${o.id}`} className="site-chip"><span className="mono">{o.id}</span>{o.name}</Link>)}
            </div>
          </nav>
        </Reveal>
        <footer className="foot">{t("footer")}</footer>
      </div>
    </main>
  );
}
