"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DAY, HOUR, type Series } from "@/lib/ephemeris";
import { fmt, fmtD, latlon } from "@/lib/format";
import { useAnimCanvas } from "@/lib/canvas";
import { useI18n } from "@/lib/i18n";
import { MISSIONS, replay, type Mission, type Replay } from "@/lib/missions";
import { SectionHead } from "@/components/ui";
import { drawSkyNow } from "@/components/game/art";
import { TimeBar, type Run } from "@/components/TimeBar";

/** [start, length] of every stretch where `test` holds. */
function runs(n: number, test: (i: number) => boolean) {
  const out: Run[] = [];
  for (let i = 0, from = -1; i <= n; i++) {
    const on = i < n && test(i);
    if (on && from < 0) from = i;
    if (!on && from >= 0) { out.push([from, i - from]); from = -1; }
  }
  return out;
}
const sunUp = (o: Series, i: number) => o.sFrac[i] >= 0.5, earthUp = (o: Series, i: number) => o.eEl[i] >= 0;

export function Missions() {
  const { t, lang } = useI18n();
  const [id, setId] = useState<Mission["id"]>("bg1");
  const r = useMemo(() => replay(MISSIONS.find((m) => m.id === id)!), [id]);
  return (
    <main className="wrap">
      <header className="page-head">
        <h1>{t("m.title")}</h1>
        <p>{t("m.intro")}</p>
      </header>
      <div className="tiles tiles3" role="group" aria-label={t("m.pick")}>
        {MISSIONS.map((m) => (
          <button key={m.id} type="button" className={`tile ${m.id === "bg1" ? "ready" : "warn"}`} aria-pressed={m.id === id} onClick={() => setId(m.id)}>
            <b>{m.name} · {m.lander}</b>
            <span className="tile-state">{m.org} · {fmtD(m.land)}</span>
            <span className="tile-state"><span className={`badge ${m.id === "bg1" ? "ready" : "warn"}`}>{t(`m.${m.id}.tag`)}</span></span>
          </button>
        ))}
      </div>
      <Replayer key={id} r={r} />
      <p className="hint" style={{ marginTop: 16 }}>{t("m.smooth")} {t("m.src")}</p>
      <footer className="foot" lang={lang}>{t("footer")}</footer>
    </main>
  );
}

function Replayer({ r }: { r: Replay }) {
  const { t, dur, lang } = useI18n();
  const { m, o } = r;
  const [i, setI] = useState(r.iLand);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setI((v) => (v + 6 * speed >= o.n ? r.iLand : v + 6 * speed)), 80);
    return () => clearInterval(timer);
  }, [playing, o.n, r.iLand, speed]);

  const landed = i >= r.iLand, over = i > r.iEnd;
  const power = sunUp(o, i) && !(m.shaded && landed), link = earthUp(o, i);
  const sky = useAnimCanvas((cv, now) => drawSkyNow(cv, {
    sunEl: o.sEl[i], sunAz: o.sAz[i], earthEl: o.eEl[i], earthAz: o.eAz[i], power, link, center: o.eAz[r.iLand],
    tilt: m.tilt, over, lander: landed,
  }, { sun: t("sun"), earth: t("earth"), exag: (k) => t("g.exag", { k }), below: t("l3.below"), hill: t("l3.hill") }, now), [r, i, lang]);

  const ms = (k: number) => o.t0 + k * o.step;
  const hours = (a: number, b: number) => dur(Math.abs(a - b) / HOUR);
  const deg = (v: number) => t("m.above", { x: v.toFixed(1) });
  const facts: [string, string, string?][] = [
    [t("m.fSun"), deg(r.sunAtLanding)],
    [t("m.fEarth"), deg(r.earthAtLanding)],
  ];
  if (r.sunrise) facts.push([t("m.fSunrise"), `${fmt(r.sunrise)} UTC`, t("m.afterSunrise", { d: hours(m.land, r.sunrise) })]);
  if (r.sunset) facts.push([t("m.fSunset"), `${fmt(r.sunset)} UTC`, t(m.end >= r.sunset ? "m.endAfter" : "m.endBefore", { d: hours(m.end, r.sunset) })]);
  if (r.eclipse) facts.push([t("m.fEclipse"), `${fmt(r.eclipse[0])} → ${fmt(r.eclipse[1]).slice(11)} UTC`, t("m.eclipseNote")]);
  const state = !landed ? t("m.stBefore") : over ? t("m.stOver") : power && link ? t("l2.ready") : power ? t("l2.noSignal") : link ? t("l2.noPower") : t("l2.offline");

  return (
    <>
      <div className="board-detail panel">
        <canvas ref={sky} className="board-sky" role="img" aria-label={t("m.skyAlt", { name: m.name })} />
        <div className="board-facts">
          <div className="board-title"><h3>{m.lander}</h3><span className={`badge ${landed && !over && power ? "ready" : over ? "off" : "warn"}`}>{state}</span></div>
          <p className="mission-where mono">{m.place} · {latlon(m)}</p>
          <p className="mission-text">{t(`m.${m.id}.what`)}</p>
          <div className="row">
            <Link href={`/planner?site=${m.lat},${m.lon}&name=${encodeURIComponent(m.name)}&start=${fmtD(m.land)}`} className="btn small">{t("m.open")} →</Link>
          </div>
        </div>
        <div className="board-time">
          <TimeBar n={o.n} i={i} onSeek={(v) => { setPlaying(false); setI(v); }}
            playing={playing} onToggle={() => setPlaying((v) => !v)} speed={speed} onSpeed={setSpeed}
            sun={runs(o.n, (k) => sunUp(o, k))} earth={runs(o.n, (k) => earthUp(o, k))} laneKey={m.id} perDay={DAY / o.step}
            labelAt={(k) => `${fmt(ms(k))} UTC`}
            marks={[{ at: r.iLand, label: t("m.landed"), tone: "land" }, { at: r.iEnd, label: t("m.lastContact"), tone: "end" }]}
            playLabel={t("p.play")} pauseLabel={t("p.pause")} speedLabel={t("p.speed")} sliderLabel={t("m.slider")}
            reset={{ label: t("m.toLanding"), disabled: i === r.iLand && !playing, onClick: () => { setPlaying(false); setI(r.iLand); } }}
            legend={<>
              <span><i className="sun" />{t("l3.legSun")}</span><span><i className="earth" />{t("l3.legEarth")}</span>
              <span className="ends"><span>{fmtD(ms(0))}</span><span>{fmtD(ms(o.n - 1))}</span></span>
            </>} />
        </div>
      </div>

      <div className="two">
        <section className="panel">
          <SectionHead title={t("m.checkT")} help={t("m.checkH")} />
          <dl className="mission-facts">
            {facts.map(([k, v, note]) => (
              <div key={k}><dt>{k}</dt><dd><b className="mono">{v}</b>{note && <small>{note}</small>}</dd></div>
            ))}
          </dl>
        </section>
        <section className="panel">
          <SectionHead title={t("m.showsT")} />
          <p className="mission-text">{t(`m.${m.id}.shows`, { sun: r.sunAtLanding.toFixed(1), earth: r.earthAtLanding.toFixed(1) })}</p>
        </section>
      </div>
    </>
  );
}
