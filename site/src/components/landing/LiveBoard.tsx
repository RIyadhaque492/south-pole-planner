"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { HOUR } from "@/lib/ephemeris";
import { fmt, pct } from "@/lib/format";
import { useAnimCanvas } from "@/lib/canvas";
import { useI18n } from "@/lib/i18n";
import type { Board, BoardSite } from "@/lib/sky";
import { SectionHead } from "@/components/ui";
import { drawSkyNow } from "@/components/game/art";

const POWER = 1, LINK = 2;
const flag = (s: BoardSite, i: number) => +s.flags[i];
/** [start, length] of every stretch where `bit` is set. */
function runs(s: BoardSite, bit: number) {
  const out: [number, number][] = [];
  for (let i = 0, from = -1; i <= s.flags.length; i++) {
    const on = i < s.flags.length && (flag(s, i) & bit) !== 0;
    if (on && from < 0) from = i;
    if (!on && from >= 0) { out.push([from, i - from]); from = -1; }
  }
  return out;
}

/** The lander's view from the chosen site, redrawn every frame. */
function SiteSky({ site, i }: { site: BoardSite; i: number }) {
  const { t, lang } = useI18n();
  const f = flag(site, i);
  const ref = useAnimCanvas((cv, now) => drawSkyNow(cv, {
    sunEl: site.sunEl[i], sunAz: site.sunAz[i], earthEl: site.earthEl[i], earthAz: site.earthAz[i],
    power: (f & POWER) !== 0, link: (f & LINK) !== 0, center: site.earthAz[0],
  }, { sun: t("sun"), earth: t("earth"), exag: (k) => t("g.exag", { k }), below: t("l3.below"), hill: t("l3.hill") }, now), [site, i, lang]);
  return <canvas ref={ref} className="board-sky" role="img" aria-label={t("l3.skyAlt", { site: site.name })} />;
}

/**
 * "Right now on the Moon": pick a site to see its sky, and slide forward to watch the next 30 days.
 * The whole month is computed on the server for the moment the page loads, so scrubbing needs no requests.
 */
export function LiveBoard({ board }: { board: Board }) {
  const { t, dur } = useI18n();
  const { sites, n, stepH } = board;
  const [i, setI] = useState(0);
  const [sel, setSel] = useState(sites[0].id);
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState(board.from);

  useEffect(() => {
    const tick = setInterval(() => setClock((c) => c + 1000), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setI((v) => (v + 1) % n), 110);
    return () => clearInterval(id);
  }, [playing, n]);

  const site = sites.find((s) => s.id === sel) ?? sites[0];
  const f = flag(site, i), power = (f & POWER) !== 0, link = (f & LINK) !== 0;
  const ready = sites.filter((s) => flag(s, i) === (POWER | LINK)).length;
  const status = (v: number) =>
    v === 3 ? ["ready", t("l2.ready")] : v === 1 ? ["warn", t("l2.noSignal")] : v === 2 ? ["warn", t("l2.noPower")] : ["off", t("l2.offline")];
  /** Hours until `bit` next changes at this site, or null if it holds for the rest of the month. */
  const nextChange = (bit: number) => {
    for (let j = i + 1; j < n; j++) if ((flag(site, j) & bit) !== (f & bit)) return (j - i) * stepH;
    return null;
  };
  const sunNext = nextChange(POWER), earthNext = nextChange(LINK);
  let both = 0;
  for (let j = 0; j < n; j++) both += +(flag(site, j) === 3);
  const share = both / n, blocked = !power && site.sunEl[i] > 0.4;
  const [cls, label] = status(f);

  return (
    <div>
      <SectionHead title={t("l2.liveT")} help={t("l3.help")}>
        <span className="live-clock mono" suppressHydrationWarning><span className="pulse" aria-hidden="true" />{new Date(clock).toISOString().slice(11, 19)} UTC</span>
      </SectionHead>

      <p className="board-count" aria-live="polite">
        <b>{ready}</b><span>{t("l3.count", { m: sites.length })} <em>{i === 0 ? t("l3.now") : t("l3.at", { d: dur(i * stepH) })}</em></span>
      </p>

      <div className="tiles" role="group" aria-label={t("l3.pick")}>
        {sites.map((s) => {
          const v = flag(s, i), [c, l] = status(v);
          return (
            <button key={s.id} type="button" className={`tile ${c}`} aria-pressed={s.id === sel} onClick={() => setSel(s.id)}>
              <b>{s.name}</b>
              <span className="tile-state">
                <span className={`lamp sun${v & POWER ? " on" : ""}`} title={t("sun")} /><span className={`lamp earth${v & LINK ? " on" : ""}`} title={t("earth")} />
                {l}
              </span>
            </button>
          );
        })}
      </div>

      <div className="board-detail panel">
        <SiteSky site={site} i={i} />
        <div className="board-facts">
          <div className="board-title"><h3>{site.name}</h3><span className={`badge ${cls}`}>{label}</span></div>
          <div className={`fact sun${power ? " on" : ""}`}>
            <span className={`lamp sun${power ? " on" : ""}`} />
            <div>
              <b>{power ? t("l3.sunOn") : blocked ? t("l3.sunBlocked") : t("l3.sunOff")}</b>
              <small>{sunNext == null ? t("l3.noChange") : t(power ? "l3.sunEnds" : "l3.sunBack", { d: dur(sunNext) })}</small>
            </div>
          </div>
          <div className={`fact earth${link ? " on" : ""}`}>
            <span className={`lamp earth${link ? " on" : ""}`} />
            <div>
              <b>{link ? t("l3.earthOn") : t("l3.earthOff")}</b>
              <small>{earthNext == null ? t("l3.noChange") : t(link ? "l3.earthEnds" : "l3.earthBack", { d: dur(earthNext) })}</small>
            </div>
          </div>
          <div className="board-share">
            <div className="share-line"><span>{t("l3.share")}</span><b>{pct(share)}%</b></div>
            <div className="share-bar"><i style={{ width: `${share * 100}%` }} /></div>
          </div>
          <div className="row">
            <Link href={`/sites/${site.id}`} className="btn small">{t("l3.details")} →</Link>
            <Link href={`/planner?site=${site.id}`} className="btn small">{t("l3.plan")} →</Link>
          </div>
        </div>

        <div className="board-time">
          <div className="time-head">
            <button type="button" className="btn small" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? "❚❚" : "▶"} {t(playing ? "l3.pause" : "l3.play")}</button>
            <span className="mono time-now">{fmt(board.from + i * stepH * HOUR)} UTC</span>
            <button type="button" className="btn small" disabled={i === 0 && !playing} onClick={() => { setPlaying(false); setI(0); }}>{t("l3.reset")}</button>
          </div>
          <div className="strip">
            <svg viewBox={`0 0 ${n} 26`} preserveAspectRatio="none" aria-hidden="true">
              <rect className="track" x="0" y="0" width={n} height="11" /><rect className="track" x="0" y="15" width={n} height="11" />
              {runs(site, POWER).map(([a, w]) => <rect key={"s" + a} className="sun" x={a} y="0" width={w} height="11" />)}
              {runs(site, LINK).map(([a, w]) => <rect key={"e" + a} className="earth" x={a} y="15" width={w} height="11" />)}
            </svg>
            <span className="strip-mark" style={{ left: `${(i / (n - 1)) * 100}%` }} />
            <input type="range" min={0} max={n - 1} step={1} value={i} aria-label={t("l3.slider")}
              aria-valuetext={`${fmt(board.from + i * stepH * HOUR)} UTC`}
              onChange={(e) => { setPlaying(false); setI(+e.target.value); }} />
          </div>
          <div className="strip-legend">
            <span><i className="sun" />{t("l3.legSun")}</span><span><i className="earth" />{t("l3.legEarth")}</span>
            <span className="ends"><span>{t("l3.now")}</span><span>{t("l3.end", { d: dur((n - 1) * stepH) })}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
