"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { Outlook, SkyNow } from "@/lib/sky";
import { pct } from "@/lib/format";
import { TerrainHero } from "./TerrainHero";
import { LiveBoard } from "./LiveBoard";
import { CountUp, LinkArt, PowerArt, Reveal, Sparkline } from "./bits";

export function Landing({ now, live, featured }: {
  now: number;
  live: { t: number; sites: SkyNow[] };
  featured: { id: string; name: string; outlook: Outlook };
}) {
  const { t, dur } = useI18n();
  const k = featured.outlook.stats;
  const nextEv = featured.outlook.events.slice(0, 4);
  return (
    <main>
      {/* ---------- hero: always night-sky dark ---------- */}
      <section className="space hero-x">
        <div className="starfield" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span className="pulse" aria-hidden="true" />{t("l.kicker")}</div>
            <h1 dangerouslySetInnerHTML={{ __html: t("l.title") }} />
            <p className="lede">{t("l.lede")}</p>
            <div className="cta-row">
              <Link href="/planner" className="btn accent lg">{t("l.ctaPlanner")} →</Link>
              <Link href="/game" className="btn ghost lg">{t("l.ctaGame")}</Link>
            </div>
            <dl className="facts">
              <div><dt><CountUp to={1.54} decimals={2} suffix="°" /></dt><dd>{t("l.f1")}</dd></div>
              <div><dt><CountUp to={29.5} decimals={1} suffix=" d" /></dt><dd>{t("l.f2")}</dd></div>
              <div><dt>±<CountUp to={6.8} decimals={1} suffix="°" /></dt><dd>{t("l.f3")}</dd></div>
            </dl>
          </div>
          <TerrainHero startMs={now} />
        </div>
        <div className="scroll-cue" aria-hidden="true"><span /></div>
      </section>

      <div className="wrap">
        {/* ---------- live board ---------- */}
        <Reveal><section className="band"><LiveBoard initial={live} /></section></Reveal>

        {/* ---------- the two constraints ---------- */}
        <section className="band">
          <Reveal><div className="eyebrow">{t("l.needKicker")}</div><h2 className="title big">{t("l.needTitle")}</h2></Reveal>
          <div className="need-grid">
            <Reveal delay={60}>
              <article className="need sun">
                <PowerArt />
                <div className="need-body">
                  <span className="need-tag">{t("l.powerTag")}</span>
                  <h3>{t("l.powerTitle")}</h3>
                  <p>{t("l.powerText")}</p>
                </div>
              </article>
            </Reveal>
            <Reveal delay={160}>
              <article className="need earth">
                <LinkArt />
                <div className="need-body">
                  <span className="need-tag">{t("l.linkTag")}</span>
                  <h3>{t("l.linkTitle")}</h3>
                  <p>{t("l.linkText")}</p>
                </div>
              </article>
            </Reveal>
          </div>
        </section>

        {/* ---------- bento: what the Planner does ---------- */}
        <section className="band">
          <Reveal><div className="eyebrow">{t("l.toolKicker")}</div><h2 className="title big">{t("l.toolTitle")}</h2></Reveal>
          <div className="bento">
            <Reveal className="b-wide">
              <Link href={`/sites/${featured.id}`} className="tile tile-feature">
                <div className="tile-head">
                  <span className="eyebrow">{t("l.next30", { site: featured.name })}</span>
                  <span className="legend"><span><i style={{ background: "var(--sun)" }} />{t("sun")}</span><span><i style={{ background: "var(--earth)" }} />{t("earth")}</span></span>
                </div>
                <Sparkline sun={featured.outlook.sun} earth={featured.outlook.earth} height={120} />
                <div className="tile-stats">
                  <div><b className="c-sun">{pct(k.sun)}%</b><span>{t("p.kSun")}</span></div>
                  <div><b className="c-earth">{pct(k.earth)}%</b><span>{t("p.kEarth")}</span></div>
                  <div><b className="c-both">{pct(k.both)}%</b><span>{t("p.kBoth")}</span></div>
                  <div><b>{dur(k.maxDarkH)}</b><span>{t("p.kDark")}</span></div>
                </div>
                {nextEv.length > 0 && (
                  <ul className="events">
                    {nextEv.map((e) => (
                      <li key={e.kind + e.t}><span className={`ev-dot ${e.kind.startsWith("sun") ? "sun" : "earth"}`} />{t("s.ev." + e.kind)}<time className="mono">{new Date(e.t).toISOString().slice(0, 16).replace("T", " ")}</time></li>
                    ))}
                  </ul>
                )}
              </Link>
            </Reveal>
            {[["compare", "/planner#compare"], ["scrub", "/planner"], ["windows", "/planner#windows"], ["terrain", "/planner"]].map(([key, href], i) => (
              <Reveal key={key} delay={80 * i}>
                <Link href={href} className="tile">
                  <span className="tile-n mono">0{i + 1}</span>
                  <h3>{t(`l.tools.${key}.t`)}</h3>
                  <p>{t(`l.tools.${key}.d`)}</p>
                  <span className="tile-go">→</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- game teaser ---------- */}
        <Reveal>
          <section className="band game-band space">
            <div className="starfield" aria-hidden="true" />
            <div className="gb-copy">
              <div className="eyebrow">{t("l.gameKicker")}</div>
              <h2 className="title big">{t("l.gameTitle")}</h2>
              <p>{t("l.gameText")}</p>
              <Link href="/game" className="btn accent lg">{t("l.ctaGame")} →</Link>
            </div>
            <ul className="gb-list">
              {(["vikram", "tipped", "peak"] as const).map((s) => (
                <li key={s}><b>{t(`g.scn.${s}.t`)}</b><span>{t(`g.scn.${s}.goal`, { g: 120 })}</span></li>
              ))}
            </ul>
          </section>
        </Reveal>

        {/* ---------- developers ---------- */}
        <Reveal>
          <section className="band api">
            <div>
              <div className="eyebrow">{t("l.apiKicker")}</div>
              <h2 className="title">{t("l.apiTitle")}</h2>
              <p className="sub">{t("l.apiText")}</p>
            </div>
            <pre className="mono"><code>{`GET /api/now
GET /api/sky?site=B&start=2026-12-01&days=30
GET /api/sky?site=-89.5,-140&days=90`}</code></pre>
          </section>
        </Reveal>
        <footer className="foot">{t("footer")}</footer>
      </div>
    </main>
  );
}
