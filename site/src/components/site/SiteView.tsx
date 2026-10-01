"use client";
import Link from "next/link";
import type { Stats } from "@/lib/ephemeris";
import { latlon } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Outlook, SiteSeed, SkyNow } from "@/lib/sky";
import { SectionHead, StatChips } from "@/components/ui";
import { Reveal, Sparkline } from "@/components/landing/bits";

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

export function SiteView({ site, now, month, year, others }: {
  site: SiteSeed; now: SkyNow; month: Outlook; year: Stats; others: { id: string; name: string }[];
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
              <h1>{site.name}</h1>
              <p className="mono coords">{latlon(now)}</p>
              <p className="coords-note">{now.terrain ? (now.movedM ? t("s2.movedNote", { m: now.movedM }) : t("p2.terrainOn")) : t("p2.terrainOff")}</p>
              <div className="cta-row">
                <Link href={`/planner?site=${site.id}`} className="btn accent lg">{t("s.open")} →</Link>
              </div>
            </div>
            <div className="now-card">
              <div className="eyebrow"><span className="pulse" aria-hidden="true" />{t("s.now")}</div>
              <div className={`now-row${now.power ? " on sun" : ""}`}>
                <span className={`lamp sun${now.power ? " on" : ""}`} />
                <b>{now.power ? t("l.sunUp") : t("l.sunDown")}</b>
              </div>
              <div className={`now-row${now.link ? " on earth" : ""}`}>
                <span className={`lamp earth${now.link ? " on" : ""}`} />
                <b>{now.link ? t("l.earthUp") : t("l.earthDown")}</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <Reveal>
          <section className="band panel">
            <SectionHead title={t("s.monthKicker")} help={t("s2.monthH")}>
              <span className="legend"><span><i style={{ background: "var(--sun)" }} />{t("sun")}</span><span><i style={{ background: "var(--earth)" }} />{t("earth")}</span></span>
            </SectionHead>
            <Sparkline sun={month.sun} earth={month.earth} height={150} />
            <StatChips k={month.stats} />
          </section>
        </Reveal>

        <div className="two">
          <Reveal>
            <section className="panel">
              <SectionHead title={t("s.eventsTitle")} help={t("s2.eventsH")} />
              {month.events.length === 0 ? <p className="sub">{t("s.noEvents")}</p> : (
                <ol className="timeline-list">
                  {month.events.slice(0, 6).map((e) => (
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
              <SectionHead title={t("s2.yearT")} help={t("s2.yearH")} />
              <StatChips k={year} />
            </section>
          </Reveal>
        </div>

        <nav className="band" aria-label={t("s.others")}>
          <SectionHead title={t("s.others")} />
          <div className="chips">
            {others.map((o) => <Link key={o.id} href={`/sites/${o.id}`} className="site-chip">{o.name}</Link>)}
          </div>
        </nav>
        <footer className="foot">{t("footer")}</footer>
      </div>
    </main>
  );
}
