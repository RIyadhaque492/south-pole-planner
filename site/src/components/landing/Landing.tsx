"use client";
import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { SkyNow } from "@/lib/sky";
import { SectionHead } from "@/components/ui";
import { TerrainHero } from "./TerrainHero";
import { LiveBoard } from "./LiveBoard";
import { HorizonStory } from "./HorizonStory";
import { Reveal } from "./bits";

export function Landing({ now, live }: { now: number; live: { t: number; sites: SkyNow[] } }) {
  const { t } = useI18n();
  return (
    <main>
      {/* ---------- hero ---------- */}
      <section className="space hero-x">
        <div className="starfield" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span className="pulse" aria-hidden="true" />{t("l.kicker")}</div>
            <h1 dangerouslySetInnerHTML={{ __html: t("l.title") }} />
            <p className="lede">{t("l2.lede")}</p>
            <div className="cta-row">
              <Link href="/planner" className="btn accent lg">{t("l.ctaPlanner")} →</Link>
              <Link href="/game" className="btn ghost lg">{t("l.ctaGame")}</Link>
            </div>
          </div>
          <TerrainHero startMs={now} />
        </div>
      </section>

      <div className="wrap">
        {/* ---------- 1. live status ---------- */}
        <Reveal><section className="band"><LiveBoard initial={live} /></section></Reveal>

        {/* ---------- 2. why it's hard: a scene you can play with, then the real thing ---------- */}
        <section className="band">
          <Reveal><SectionHead title={t("w.title")} help={t("w.help")} /></Reveal>
          <Reveal><HorizonStory startMs={now} /></Reveal>
          <Reveal>
            <figure className="photo">
              <div className="photo-img">
                <Image src="/img/lroc-south-pole.jpg" alt={t("w.photoT")} width={900} height={900} sizes="(max-width: 900px) 100vw, 520px" />
                <span className="pin" style={{ left: "50%", top: "50%" }}><i />{t("w.photoPin")}</span>
                <span className="pin dark" style={{ left: "72%", top: "32%" }}><i />{t("w.photoDark")}</span>
              </div>
              <figcaption>
                <h3>{t("w.photoT")}</h3>
                <p>{t("w.photoD")}</p>
                <small>{t("w.photoCredit")}</small>
              </figcaption>
            </figure>
          </Reveal>
        </section>

        {/* ---------- 3. how to use the Planner ---------- */}
        <Reveal>
          <section className="band">
            <SectionHead title={t("l2.howT")} help={t("l2.howH")}>
              <Link href="/planner" className="btn accent">{t("l.ctaPlanner")} →</Link>
            </SectionHead>
            <ol className="how3">
              {(["h1", "h2", "h3"] as const).map((k, i) => (
                <li key={k}><span className="step">{i + 1}</span><div><b>{t(`l2.${k}`)}</b><p>{t(`l2.${k}d`)}</p></div></li>
              ))}
            </ol>
          </section>
        </Reveal>

        {/* ---------- 4. game ---------- */}
        <Reveal>
          <section className="band game-band space">
            <div className="starfield" aria-hidden="true" />
            <div>
              <h2 className="shead-t">{t("l2.gameT")}</h2>
              <p>{t("l2.gameD")}</p>
            </div>
            <Link href="/game" className="btn accent lg">{t("l.ctaGame")} →</Link>
          </section>
        </Reveal>

        <footer className="foot">
          {t("footer")} · <a href="/api/sky?site=B&days=30">{t("l2.api")}</a>
        </footer>
      </div>
    </main>
  );
}
