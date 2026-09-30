"use client";
import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  DAY, HOUR, T_MAX, T_MIN, parseHorizonCsv, series, stats, stepFor, subLongitudes,
  type HorizonModel, type Series, type Site, type Stats,
} from "@/lib/ephemeris";
import { fmt, fmtD, latlon, pct } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { initialSites } from "@/lib/sites";
import { PolarMap } from "./PolarMap";
import { SkyPanorama, Timeline, WindowStrip } from "./Charts";

const SPANS = [["14", "opt14"], ["29.53", "opt29"], ["60", "opt60"], ["180", "opt180"], ["365.25", "opt365"]] as const;
const START_MAX = T_MAX - 370 * DAY;
/** Comparison stats keyed by site + settings; survives re-renders and remounts. */
const cmpCache = new Map<string, Stats>();
const clampStart = (v: number, span: number) => Math.max(T_MIN, Math.min(v, T_MAX - span));

/** Deep links from the game and site pages: /planner?site=C3&start=2026-10-12 */
function initialFromUrl() {
  let start = Date.UTC(2026, 8, 30);
  const now = Date.now();
  if (now > T_MIN && now < START_MAX) {
    const d = new Date(now);
    start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const q = new URLSearchParams(window.location.search);
  const s = Date.parse((q.get("start") ?? "") + "T00:00:00Z");
  if (!isNaN(s)) start = clampStart(s, 60 * DAY);
  return { start, site: q.get("site") ?? "B" };
}

export function Planner() {
  const { t, raw, lang } = useI18n();
  const [init] = useState(initialFromUrl);
  const [sites, setSites] = useState<Site[]>(initialSites);
  const [selId, setSelId] = useState(() => (sites.some((s) => s.id === init.site) ? init.site : "B"));
  const [start, setStart] = useState(init.start);
  const [spanDays, setSpanDays] = useState("60");
  const [mission, setMission] = useState(10);
  const [mask, setMask] = useState(0);
  const [tm, setTm] = useState(init.start);
  const [playing, setPlaying] = useState(false);
  const [secsPerPeriod, setSecsPerPeriod] = useState(20);
  const [picking, setPicking] = useState(false);
  const [csvMsg, setCsvMsg] = useState<{ bad: boolean; text: string } | null>(null);
  const [cLat, setCLat] = useState("-87.5");
  const [cLon, setCLon] = useState("-10");
  const nCustom = useRef(0);

  const span = +spanDays * DAY;
  const site = sites.find((s) => s.id === selId)!;
  const tEnd = start + span - 1;
  const clampT = (v: number) => Math.max(start, Math.min(v, tEnd));
  const tNow = clampT(tm);

  const cur = useMemo(() => series(site, start, start + span, stepFor(span)), [site, start, span]);
  const curStats = useMemo(() => stats(cur, mask), [cur, mask]);

  /* comparison stats per site, cached across renders */
  const cmp = useMemo(() => {
    const step = stepFor(span) * 2;
    return sites.map((s) => {
      const key = [s.id, s.lat, s.lon, s.model, s.raised, s.maskName, start, span, mask].join("|");
      if (cmpCache.size > 400) cmpCache.clear();
      if (!cmpCache.has(key)) cmpCache.set(key, stats(series(s, start, start + span, step), mask));
      return { s, ...cmpCache.get(key)! };
    });
  }, [sites, start, span, mask]);
  const bothBySite = useMemo(() => new Map(cmp.map((r) => [r.s.id, r.both])), [cmp]);

  const subLon = useMemo(() => subLongitudes(tNow), [tNow]);

  /* ---------- playback ---------- */
  const tmRef = useRef(tNow);
  useEffect(() => { tmRef.current = tNow; }, [tNow]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = 0;
    const tick = (ts: number) => {
      const dt = last ? ts - last : 16;
      last = ts;
      const next = tmRef.current + (span * dt) / (secsPerPeriod * 1000);
      if (next >= tEnd) { setTm(tEnd); setPlaying(false); return; }
      tmRef.current = next;
      setTm(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, span, tEnd, secsPerPeriod]);

  const togglePlay = () => {
    if (!playing && tNow >= tEnd - 2 * cur.step) setTm(start);
    setPlaying(!playing);
  };
  const seek = (v: number) => { setPlaying(false); setTm(clampT(v)); };

  /* ---------- site edits ---------- */
  const patchSite = (patch: Partial<Site>) => setSites((all) => all.map((s) => (s.id === selId ? { ...s, ...patch } : s)));
  const select = (id: string) => { setSelId(id); setCsvMsg(null); };
  const addSite = (lat: number, lon: number) => {
    const id = "X" + ++nCustom.current;
    setSites((all) => [...all, { id, name: `${t("p.custom")} ${nCustom.current}`, lat, lon: lon > 180 ? lon - 360 : lon, model: "smooth", raised: 1000, mask: null, maskName: "" }]);
    setSelId(id);
    setPicking(false);
  };
  const loadCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const parsed = parseHorizonCsv(await f.text());
    if (!parsed) { setCsvMsg({ bad: true, text: t("p.csvBad") }); return; }
    const { mask: m, meta } = parsed;
    patchSite({ mask: m, model: "terrain", maskName: meta.source ? `${f.name} (${meta.source})` : f.name });
    const far = meta.lat && meta.lon && (Math.abs(+meta.lat - site.lat) > 0.05 || Math.abs(((+meta.lon - site.lon + 540) % 360) - 180) > 0.5);
    setCsvMsg(far ? { bad: true, text: t("p.csvFar", { lat: meta.lat, lon: meta.lon, site: site.name }) } : { bad: false, text: "✓ " + f.name });
  };

  const modelLabel = site.model === "terrain" ? t("p.hTerrainS") : site.model === "raised" ? t("p.hRaisedS", { h: site.raised }) : t("p.hSmoothS");

  return (
    <main className="wrap">
      <section className="hero">
        <div>
          <div className="eyebrow">{t("p.kicker")}</div>
          <h1 dangerouslySetInnerHTML={{ __html: t("p.question") }} />
        </div>
        <ol className="steps">
          <li><span>01</span><span>{t("p.step1")}</span></li>
          <li><span>02</span><span>{t("p.step2")}</span></li>
          <li><span>03</span><span>{t("p.step3")}</span></li>
        </ol>
      </section>

      <div className="planner">
        {/* ---------- left rail: site + dates ---------- */}
        <aside className="rail" aria-label={t("p.setup")}>
          <section className="panel">
            <div className="eyebrow"><span className="num">01</span>{t("p.mapTitle")}</div>
            <p className="hint" style={{ margin: "6px 0 8px" }}>{t("p.mapSub")}</p>
            <PolarMap sites={sites} selId={selId} both={bothBySite} sunLon={subLon.sun} earthLon={subLon.earth}
              picking={picking} onSelect={select} onPick={addSite} />
            <div className="map-tools">
              <span className="hint">{picking ? t("p.dropHint") : latlon(site)}</span>
              <button type="button" className="btn small" aria-pressed={picking} onClick={() => setPicking(!picking)}>
                {picking ? t("p.cancel") : "+ " + t("p.dropPin")}
              </button>
            </div>
            <div className="sites" style={{ marginTop: 12 }}>
              {sites.map((s) => (
                <button key={s.id} type="button" className="site" aria-pressed={s.id === selId} onClick={() => select(s.id)}>
                  <span className="sw" />
                  <b>{s.name}</b>
                  {s.model === "terrain" ? <span className="chip terrain">{t("p.hTerrainS")}</span>
                    : s.model === "raised" ? <span className="chip">{t("p.hRaisedS", { h: s.raised })}</span>
                    : <span className="val" title={t("p.cBoth")}>{pct(bothBySite.get(s.id) ?? 0)}%</span>}
                  <small>{latlon(s)}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="eyebrow"><span className="num">02</span>{t("p.pickDates")}</div>
            <div className="row2" style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="start">{t("p.startDate")}</label>
                <input type="date" id="start" min={fmtD(T_MIN)} max={fmtD(START_MAX)} value={fmtD(start)}
                  onChange={(e) => {
                    const v = Date.parse(e.target.value + "T00:00:00Z");
                    if (!isNaN(v)) { const s = clampStart(v, span); setPlaying(false); setStart(s); setTm(s); }
                  }} />
              </div>
              <div className="field">
                <label htmlFor="span">{t("p.howLong")}</label>
                <select id="span" value={spanDays} onChange={(e) => {
                  const sp = +e.target.value * DAY;
                  setPlaying(false); setSpanDays(e.target.value);
                  if (start + sp > T_MAX) setStart(T_MAX - sp);
                }}>
                  {SPANS.map(([v, k]) => <option key={v} value={v}>{t("p." + k)}</option>)}
                </select>
              </div>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>{t("p.dateHint")}</p>

            <details className="adv">
              <summary>{t("p.advanced")}</summary>
              <div className="field">
                <label htmlFor="mission">{t("p.missionLen")}</label>
                <input type="number" id="mission" min={1} max={60} step={1} value={mission}
                  onChange={(e) => setMission(Math.max(1, Math.min(60, +e.target.value || 10)))} />
                <p className="hint">{t("p.missionHint")}</p>
              </div>
              <div className="field">
                <label htmlFor="mask">{t("p.maskLbl")}</label>
                <input type="number" id="mask" min={-5} max={10} step={0.5} value={mask}
                  onChange={(e) => setMask(+e.target.value || 0)} />
                <p className="hint">{t("p.maskHint")}</p>
              </div>
              <div className="field">
                <label htmlFor="hmodel">{t("p.horizonLbl")}</label>
                <select id="hmodel" value={site.model} onChange={(e) => patchSite({ model: e.target.value as HorizonModel })}>
                  <option value="smooth">{t("p.hSmooth")}</option>
                  <option value="raised">{t("p.hRaised")}</option>
                  <option value="terrain" disabled={!site.mask}>{t("p.hTerrain")}</option>
                </select>
                {site.model === "raised" && (
                  <div className="row2">
                    <input type="number" min={0} max={6000} step={50} value={site.raised} aria-label="Height above surrounding ground, metres"
                      onChange={(e) => patchSite({ raised: Math.max(0, +e.target.value || 0) })} />
                    <span className="hint" style={{ alignSelf: "center" }}>{t("p.metres")}</span>
                  </div>
                )}
                <label className="file">
                  <input type="file" accept=".csv,.txt" aria-label="Load terrain horizon file" onChange={loadCsv} />
                  <span>{t("p.loadCsv")}</span>
                </label>
                {csvMsg ? <div className={`msg${csvMsg.bad ? " bad" : ""}`}>{csvMsg.text}</div>
                  : site.mask && <div className="msg">✓ {site.maskName}</div>}
              </div>
              <div className="field">
                <span className="lbl">{t("p.addSite")}</span>
                <div className="row2">
                  <input type="number" step={0.01} min={-90} max={90} value={cLat} onChange={(e) => setCLat(e.target.value)} aria-label="Latitude, degrees (south is negative)" />
                  <input type="number" step={0.01} min={-180} max={360} value={cLon} onChange={(e) => setCLon(e.target.value)} aria-label="Longitude, degrees east" />
                </div>
                <p className="hint">{t("p.latlonHint")}</p>
                <button type="button" className="btn" onClick={() => {
                  const lat = +cLat, lon = +cLon;
                  if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 360) addSite(lat, lon);
                }}>{t("p.addBtn")}</button>
              </div>
            </details>
          </section>
        </aside>

        {/* ---------- results ---------- */}
        <div className="stack">
          <Verdict site={site} k={curStats} start={start} span={span} />
          <Kpis k={curStats} />

          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow"><span className="num">03</span>{site.name} · {modelLabel}</div>
                <h2 className="title">{t("p.skyTitle")}</h2>
                <p className="sub">{t("p.skySub")}</p>
              </div>
              <div className="legend">
                <span><i style={{ background: "var(--sun)" }} />{t("sun")}</span>
                <span><i style={{ background: "var(--earth)" }} />{t("earth")}</span>
                <span><i style={{ background: "var(--regolith)" }} />{t("p.ground")}</span>
              </div>
            </div>
            <SkyPanorama o={cur} site={site} t={tNow} />
            <div className="player">
              <button type="button" className="btn solid play" onClick={togglePlay}>
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d={playing ? "M2 1h3v10H2zM7 1h3v10H7z" : "M2 1l9 5-9 5z"} /></svg>
                {playing ? t("p.pause") : t("p.play")}
              </button>
              <select className="speed" aria-label={t("p.speed")} value={secsPerPeriod} onChange={(e) => setSecsPerPeriod(+e.target.value)}>
                <option value={40}>0.5×</option><option value={20}>1×</option><option value={8}>2.5×</option>
              </select>
              <input type="range" min={0} max={1000} aria-label={t("p.time")} value={Math.round(((tNow - start) / span) * 1000)}
                onChange={(e) => seek(start + (+e.target.value / 1000) * span)} />
              <span className="now">{fmt(cur.t0 + Math.round((tNow - cur.t0) / cur.step) * cur.step)} {t("utc")}</span>
            </div>
            <Status o={cur} t={tNow} mask={mask} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow"><span className="num">04</span>{fmtD(start)} → {fmtD(start + span)}</div>
                <h2 className="title">{t("p.tlTitle")}</h2>
                <p className="sub">{t("p.tlSub")}</p>
              </div>
            </div>
            <Timeline o={cur} start={start} span={span} mask={mask} t={tNow} onSeek={seek} />
          </section>
        </div>
      </div>

      <div className="two">
        <Compare rows={cmp} selId={selId} onSelect={select} />
        <Windows site={site} start={start} span={span} mission={mission} mask={mask}
          onPick={(v) => { seek(v); document.querySelector(".player")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
      </div>

      <div className="cta">
        <div>
          <h3>{t("p.gameCta")}</h3>
          <p>{t("p.gameCtaSub")}</p>
        </div>
        <Link href="/game" className="btn accent">{t("p.gameCta")} →</Link>
      </div>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="eyebrow">{t("p.glossTitle")}</div>
        <dl className="gloss" style={{ marginTop: 14 }}>
          {raw<string[][]>("p.gloss").map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}
        </dl>
      </section>
      <section className="panel" style={{ marginTop: 20 }}>
        <details className="how">
          <summary className="eyebrow">{t("p.howTitle")} ↓</summary>
          <div className="notes">
            {raw<string[]>("p.notes").map((p) => <p key={p} dangerouslySetInnerHTML={{ __html: p }} />)}
          </div>
        </details>
      </section>
      <footer className="foot" lang={lang}>{t("footer")}</footer>
    </main>
  );
}

/* ---------- verdict + KPIs ---------- */
function Verdict({ site, k, start, span }: { site: Site; k: Stats; start: number; span: number }) {
  const { t, dur } = useI18n();
  const level = k.both >= 0.55 && k.maxDarkH <= 96 ? "great" : k.both >= 0.3 ? "ok" : "hard";
  const tag = { great: t("p.vGreat"), ok: t("p.vOk"), hard: t("p.vHard") }[level];
  const head = { great: "p.vHeadGreat", ok: "p.vHeadOk", hard: "p.vHeadHard" }[level];
  const sunLine = k.maxDarkH < 0.5 ? t("p.vSunAll") : t("p.vSun", { p: pct(k.sun), d: dur(k.maxDarkH) });
  const earthLine = k.earth >= 0.995 ? t("p.vEarthAll") : k.earth < 0.005 ? t("p.vEarthNone") : t("p.vEarth", { p: pct(k.earth), d: dur(k.maxNocH) });
  return (
    <section className={`panel verdict ${level}`} aria-live="polite">
      <div>
        <span className="tag">{tag}</span>
        <h3>{t(head, { site: site.name })}</h3>
        <p>{sunLine}</p>
        <p>{earthLine}</p>
        {k.maxDarkH > 96 && <p className="warn">{t("p.vWarn")}</p>}
        {site.model === "smooth" && <p className="hint" style={{ marginTop: 8 }}>{t("p.vTerrain")}</p>}
      </div>
      <div className="where">{fmtD(start)} → {fmtD(start + span)}<br />{latlon(site)}</div>
    </section>
  );
}

const Meter = ({ v }: { v: number }) => <div className="meter"><i style={{ width: `${v * 100}%` }} /></div>;

function Kpis({ k }: { k: Stats }) {
  const { t, dur } = useI18n();
  const big = (h: number) => {
    const txt = dur(h), m = txt.match(/^([\d.০-৯]+)\s(.+)$/);
    return m ? <>{m[1]}<small>{m[2]}</small></> : txt;
  };
  return (
    <div className="kpis">
      <div className="kpi sun"><div className="k">{t("p.kSun")}</div><div className="v">{pct(k.sun)}<small>%</small></div><div className="n">{t("p.kSunN")}</div><Meter v={k.sun} /></div>
      <div className="kpi sun"><div className="k">{t("p.kDark")}</div><div className="v">{big(k.maxDarkH)}</div><div className="n">{k.maxDarkH < 0.5 ? t("p.kDarkN0") : t("p.kDarkN")}</div></div>
      <div className="kpi earth"><div className="k">{t("p.kEarth")}</div><div className="v">{pct(k.earth)}<small>%</small></div><div className="n">{t("p.kEarthN")}</div><Meter v={k.earth} /></div>
      <div className="kpi both"><div className="k">{t("p.kBoth")}</div><div className="v">{pct(k.both)}<small>%</small></div><div className="n">{t("p.kBothN")}</div><Meter v={k.both} /></div>
    </div>
  );
}

function Status({ o, t: tm, mask }: { o: Series; t: number; mask: number }) {
  const { t } = useI18n();
  const i = Math.max(0, Math.min(o.n - 1, Math.round((tm - o.t0) / o.step)));
  const f = o.sFrac[i], e = o.eAlt[i] >= mask;
  const sunHead = f >= 0.999 ? t("p.sunUp") : f > 0.001 ? t("p.sunPart") : t("p.sunDown");
  const sunNote = f >= 0.999 ? t("p.sunUpN") : f > 0.001 ? t("p.sunPartN", { p: Math.round(f * 100) }) : t("p.sunDownN");
  return (
    <div className="status" aria-live="polite">
      <div className={`pill sun ${f > 0.001 ? "on" : "off"}`}><span className="dot" />
        <span>{sunHead}: {sunNote}<small>el {o.sEl[i].toFixed(1)}° · az {o.sAz[i].toFixed(0)}°</small></span></div>
      <div className={`pill earth ${e ? "on" : "off"}`}><span className="dot" />
        <span>{e ? t("p.earthUp") : t("p.earthDown")}: {e ? t("p.earthUpN") : t("p.earthDownN")}<small>el {o.eEl[i].toFixed(1)}° · az {o.eAz[i].toFixed(0)}°</small></span></div>
    </div>
  );
}

/* ---------- comparison table ---------- */
type Row = Stats & { s: Site };
type SortKey = "name" | "sun" | "maxDarkH" | "earth" | "both" | "pub";

const Compare = memo(function Compare({ rows, selId, onSelect }: { rows: Row[]; selId: string; onSelect: (id: string) => void }) {
  const { t, dur } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>("both");
  const [dir, setDir] = useState(-1);
  const sorted = [...rows].sort((a, b) =>
    sortKey === "name" ? dir * a.s.name.localeCompare(b.s.name)
      : sortKey === "pub" ? dir * ((a.s.pub ?? -1) - (b.s.pub ?? -1))
      : dir * (a[sortKey] - b[sortKey]));
  const cols: [SortKey, string][] = [["name", t("p.cSite")], ["sun", t("p.cSun")], ["maxDarkH", t("p.cDark")], ["earth", t("p.cEarth")], ["both", t("p.cBoth")], ["pub", t("p.cPub")]];
  const bar = (v: number, col: string) => <span className="bar" style={{ width: Math.round(v * 44), background: `var(${col})` }} />;
  return (
    <section className="panel" id="compare">
      <div className="panel-head"><div>
        <div className="eyebrow"><span className="num">05</span>{t("p.cmpTitle")}</div>
        <p className="sub">{t("p.cmpSub")}</p>
      </div></div>
      <div className="tablewrap">
        <table>
          <thead><tr>{cols.map(([k, label]) => (
            <th key={k} aria-sort={k === sortKey ? (dir > 0 ? "ascending" : "descending") : "none"}>
              <button type="button" onClick={() => {
                if (k === sortKey) setDir(-dir);
                else { setSortKey(k); setDir(k === "name" || k === "maxDarkH" ? 1 : -1); }
              }}>{label}{k === sortKey ? (dir > 0 ? " ▲" : " ▼") : ""}</button>
            </th>))}</tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.s.id} className={r.s.id === selId ? "sel" : ""} onClick={() => onSelect(r.s.id)}>
                <td>{r.s.name}{r.s.model === "terrain" && <> <span className="chip terrain">{t("p.hTerrainS")}</span></>}</td>
                <td>{bar(r.sun, "--sun")}{pct(r.sun)}%</td>
                <td>{dur(r.maxDarkH)}</td>
                <td>{bar(r.earth, "--earth")}{pct(r.earth)}%</td>
                <td>{bar(r.both, "--both")}{pct(r.both)}%</td>
                <td className="ref">{r.s.pub ? r.s.pub + "%" : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: t("p.pubHint") }} />
    </section>
  );
});

/* ---------- best landing windows ---------- */
const Windows = memo(function Windows({ site, start, span, mission, mask, onPick }: {
  site: Site; start: number; span: number; mission: number; mask: number; onPick: (tm: number) => void;
}) {
  const { t, dur } = useI18n();
  const picks = useMemo(() => {
    const M = mission * DAY, step = HOUR;
    const o = series(site, start, start + span + M, step);
    const perMission = Math.round(M / step);
    const ok = new Uint8Array(o.n);
    for (let i = 0; i < o.n; i++) ok[i] = +(o.sFrac[i] >= 0.5 && o.eAlt[i] >= mask);
    const pre = new Uint32Array(o.n + 1);
    for (let i = 0; i < o.n; i++) pre[i + 1] = pre[i] + ok[i];
    const last = Math.floor(span / step), cand: { i: number; both: number; worst: number }[] = [];
    for (let i = 0; i <= last && i + perMission <= o.n; i += 6) {
      if (!ok[i]) continue;
      let run = 0, worst = 0;
      for (let j = i; j < i + perMission; j++) { run = ok[j] ? 0 : run + 1; if (run > worst) worst = run; }
      cand.push({ i, both: (pre[i + perMission] - pre[i]) / perMission, worst });
    }
    cand.sort((a, b) => b.both - a.both || a.worst - b.worst);
    const out: { tm: number; both: number; worstH: number; cells: string[] }[] = [];
    for (const c of cand) {
      if (out.every((p) => Math.abs(p.tm - (o.t0 + c.i * step)) >= 3 * DAY)) {
        const cells = Array.from({ length: perMission }, (_, j) => {
          const q = c.i + j;
          return ok[q] ? "both" : o.sFrac[q] >= 0.5 ? "sun" : o.eAlt[q] >= mask ? "earth" : "none";
        });
        out.push({ tm: o.t0 + c.i * step, both: c.both, worstH: (c.worst * step) / HOUR, cells });
      }
      if (out.length === 5) break;
    }
    return out;
  }, [site, start, span, mission, mask]);

  return (
    <section className="panel" id="windows">
      <div className="panel-head"><div>
        <div className="eyebrow"><span className="num">06</span>{t("p.winTitle")}</div>
        <p className="sub">{t("p.winSub", { n: mission, site: site.name })}</p>
      </div></div>
      {picks.length === 0 ? <div className="msg bad">{t("p.winNone")}</div> : (
        <div className="windows">
          {picks.map((p, k) => (
            <button key={p.tm} type="button" className="win" onClick={() => onPick(Math.min(p.tm, start + span - 1))}>
              <span className="rk">{k + 1}</span>
              <span><span className="when">{fmt(p.tm)} {t("utc")}</span><br /><span className="gapnote">{t("p.winWorst", { d: dur(p.worstH) })}</span></span>
              <span className="sc">{pct(p.both)}%<small>{t("p.winSc")}</small></span>
              <WindowStrip cells={p.cells} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
});
