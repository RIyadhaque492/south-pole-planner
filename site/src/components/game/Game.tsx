"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DAY, HOUR, T_MAX, type Series } from "@/lib/ephemeris";
import { fmtD, pad } from "@/lib/format";
import {
  CFG, GAME_SITES, SCENARIOS, dayKey, hourly, newState, panelFactor, starsFor, step,
  type ScnKey, type Scenario, type SimState,
} from "@/lib/game";
import { reducedMotion, useAnimCanvas, useRedrawSignal } from "@/lib/canvas";
import { useI18n } from "@/lib/i18n";
import { setHum, setSound, sfx, soundOn, type Sfx } from "@/lib/sound";
import { drawForecast, drawReplay, drawScene } from "./art";
import { Mascot } from "./Mascot";
import { PoleExplainer } from "./PoleExplainer";

type LogKind = "sun" | "earth" | "bad" | "good";
interface LogEntry { id: number; kind: LogKind; key: string; vars?: Record<string, number>; i: number }
interface Mission {
  key: ScnKey; sc: Scenario; o: Series; s: SimState; stars: number[][];
  flags: Record<string, boolean>; log: LogEntry[];
  /** Progress through the current hour (0..1), for the scene animation. */
  frac: number;
  /** Where this mission's best score is stored: the scenario, or the day for a daily challenge. */
  bestId: string;
}
type Screen = "pick" | "setup" | "play" | "end";

const KEYS: ScnKey[] = ["vikram", "tipped", "peak"];
const PEAK_MIN = Date.UTC(2026, 9, 1), PEAK_MAX = Math.min(T_MAX - 20 * DAY, Date.UTC(2027, 11, 31));
const bestKey = (k: string) => "rts-best-" + k;
/** Sound for each kind of mission event. */
const EVENT_SFX: Record<string, Sfx> = {
  "g.ev.sunrise": "sunrise", "g.ev.sunset": "sunset", "g.ev.earthrise": "earth", "g.ev.earthset": "earth",
  "g.ev.sunsetSoon": "alert", "g.ev.earthsetSoon": "alert", "g.ev.batLow": "alert", "g.ev.storeFull": "alert",
};
const ICONS: Record<LogKind | "tip", string> = { sun: "☀️", earth: "🌍", bad: "⚠️", good: "✅", tip: "💡" };
const TOGGLE_ICONS = { sci: "🔬", rad: "📡", hib: "😴" };
const HOWTO_ICONS = ["🔬", "📡", "😴", "📅"];
const fmtHour = (ms: number) => { const d = new Date(ms); return `${fmtD(ms)} ${pad(d.getUTCHours())}:00 UTC`; };

function useCanvas(draw: (cv: HTMLCanvasElement) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sig = useRedrawSignal();
  useEffect(() => {
    if (ref.current) draw(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the values the drawing reads
  }, [sig, ...deps]);
  return ref;
}

export function Game() {
  const { t, raw, lang } = useI18n();
  const [screen, setScreen] = useState<Screen>("pick");
  const [frame, setFrame] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [intro, setIntro] = useState(false);
  const introTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [autoPause, setAutoPause] = useState(true);
  const [pSite, setPSite] = useState("B");
  const [pDate, setPDate] = useState(fmtD(Date.UTC(2026, 9, 15)));
  const [bests, setBests] = useState<Record<string, number>>({});
  const [today, setToday] = useState("");
  const [snd, setSnd] = useState(true);
  // The simulation object is mutated in place by the animation loop (m.current); `mission` exposes it to render.
  const m = useRef<Mission | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const logId = useRef(0);
  const autoPauseRef = useRef(autoPause);
  useEffect(() => { autoPauseRef.current = autoPause; }, [autoPause]);
  const rerender = () => setFrame((f) => f + 1);

  useEffect(() => {
    const b: Record<string, number> = {};
    const day = dayKey(Date.now());
    try { for (const k of [...KEYS, "daily-" + day]) b[k] = +(localStorage.getItem(bestKey(k)) ?? 0) || 0; } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- scores, the date and the sound setting only exist in the browser
    setBests(b); setToday(day); setSnd(soundOn());
  }, []);

  const goalFor = (key: ScnKey, sc?: Scenario) =>
    key === "daily" ? t("g.scn.daily.goal") : key === "tipped" ? t("g.scn.tipped.goal", { g: sc?.target ?? 120 }) : key === "peak" ? t("g.goalPeak") : t("g.scn.vikram.goal");

  /* ---------- mission runtime ---------- */
  const log = (M: Mission, kind: LogKind, key: string, vars?: Record<string, number>) => {
    M.log.unshift({ id: ++logId.current, kind, key, vars, i: M.s.i });
    if (M.log.length > 30) M.log.pop();
  };

  /** Log sunrise/sunset/Earth events; returns true when an alert should pause the game. */
  const checkEvents = (M: Mission) => {
    const { o, s, flags } = M, i = s.i;
    if (i < 1) return false;
    let pause = false;
    const alert = (kind: LogKind, key: string, vars?: Record<string, number>, p = true) => { log(M, kind, key, vars); sfx(EVENT_SFX[key]); if (p) pause = true; };
    const sunUp = o.sFrac[i] >= 0.5, wasUp = o.sFrac[i - 1] >= 0.5, eUp = o.eEl[i] >= 0, eWas = o.eEl[i - 1] >= 0;
    if (sunUp && !wasUp) { alert("sun", "g.ev.sunrise", undefined, false); flags.sunsetWarn = false; }
    if (!sunUp && wasUp) alert("bad", "g.ev.sunset", undefined, false);
    if (eUp && !eWas) { alert("earth", "g.ev.earthrise", undefined, false); flags.earthWarn = false; }
    if (!eUp && eWas) alert("earth", "g.ev.earthset", undefined, false);
    if (sunUp && !flags.sunsetWarn) for (let k = 1; k <= 24; k++) if (o.sFrac[i + k] < 0.5) { flags.sunsetWarn = true; alert("sun", "g.ev.sunsetSoon", { h: k }); break; }
    if (eUp && !flags.earthWarn && s.stored > 0) for (let k = 1; k <= 12; k++) if (o.eEl[i + k] < 0) { flags.earthWarn = true; alert("earth", "g.ev.earthsetSoon", { h: k }); break; }
    const b = s.bat / CFG.batteryWh;
    if (b < 0.25 && !flags.low) { flags.low = true; alert("bad", "g.ev.batLow"); }
    if (b > 0.35) flags.low = false;
    if (s.stored >= CFG.storageMB && s.sci && !s.hib && !flags.full) { flags.full = true; alert("bad", "g.ev.storeFull"); }
    if (s.stored < CFG.storageMB) flags.full = false;
    return pause && autoPauseRef.current;
  };

  const finish = useCallback(() => {
    const M = m.current!;
    setSpeed(0);
    log(M, M.s.dead ? "bad" : "good", M.s.dead ? "g.ev.frozen" : "g.ev.done");
    rerender();
    sfx(M.s.dead ? "lose" : "win");
    const sent = Math.round(M.s.sent);
    try { if (sent > (+(localStorage.getItem(bestKey(M.bestId)) ?? 0) || 0)) localStorage.setItem(bestKey(M.bestId), String(sent)); } catch {}
    setBests((b) => ({ ...b, [M.bestId]: Math.max(b[M.bestId] ?? 0, sent) }));
    setTimeout(() => setScreen("end"), 900);
  }, []);

  useEffect(() => {
    if (!speed || screen !== "play") return;
    let raf = 0, last = 0, acc = m.current!.frac;
    const loop = (ts: number) => {
      const M = m.current!;
      const dt = last ? Math.min(100, ts - last) : 16;
      last = ts; acc += (dt / 1000) * speed;
      let paused = false;
      while (acc >= 1 && !M.s.dead && !M.s.done) {
        const before = Math.floor(M.s.sent / 16);
        acc -= 1; step(M.sc, M.o, M.s);
        if (Math.floor(M.s.sent / 16) > before) sfx("send");
        if (checkEvents(M)) { paused = true; break; }
      }
      setHum(!M.s.hib && !M.s.dead && !paused);
      M.frac = paused || M.s.dead || M.s.done ? 0 : Math.min(1, acc);
      rerender();
      if (M.s.dead || M.s.done) return finish();
      if (paused) return setSpeed(0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); setHum(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, screen, finish]);

  const startMission = (key: ScnKey, siteId?: string, land?: number) => {
    const sc = SCENARIOS[key].build(siteId, land);
    const o = hourly(sc.site, sc.land, sc.hours + 130);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const M: Mission = { key, sc, o, s: newState(sc), stars: Array.from({ length: 160 }, () => [rnd(), rnd(), rnd()]), flags: {}, log: [], frac: 0, bestId: sc.day ? "daily-" + sc.day : key };
    log(M, "good", "g.ev.land");
    m.current = M;
    setMission(M);
    setSpeed(0); setScreen("play"); rerender();
    // The clock starts once the lander has touched down.
    setIntro(true);
    clearTimeout(introTimer.current);
    introTimer.current = setTimeout(() => { setIntro(false); setSpeed(3); sfx("land"); }, reducedMotion() ? 400 : 1900);
  };
  const quit = () => { clearTimeout(introTimer.current); setIntro(false); setSpeed(0); setScreen("pick"); };
  useEffect(() => () => clearTimeout(introTimer.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== "play" || (e.target as HTMLElement).closest("input,select,button")) return;
      if (e.code === "Space") { e.preventDefault(); setSpeed((v) => (v ? 0 : 3)); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [screen]);

  const landFromInput = () => { const v = Date.parse(pDate + "T00:00:00Z"); return isNaN(v) ? Date.UTC(2026, 9, 15) : v; };

  return (
    <main className="wrap game-page">
      <section className="hero game-hero">
        <div>
          <div className="eyebrow">{t("g.tagline")}</div>
          <h1>Race the <em className="shadow-word">Shadow</em></h1>
        </div>
        <div className="game-hero-side">
          {screen === "pick" && <p className="lede">{t("g2.intro")}</p>}
          <button type="button" className="btn small sound" aria-pressed={snd} onClick={() => { setSound(!snd); setSnd(!snd); if (!snd) sfx("toggle"); }}>
            <span aria-hidden="true">{snd ? "🔊" : "🔇"}</span> {t(snd ? "g2.sndOn" : "g2.sndOff")}
          </button>
        </div>
      </section>

      {screen === "pick" && (
        <section>
          <button type="button" className="daily" onClick={() => startMission("daily")}>
            <span className="daily-ico" aria-hidden="true">📅</span>
            <span className="daily-body">
              <span className="tag med">{t("g.scn.daily.d")}</span>
              <b>{t("g.scn.daily.t")} <span className="mono" suppressHydrationWarning>{today}</span></b>
              <span className="daily-text">{t("g.scn.daily.story")}</span>
            </span>
            <span className="daily-side">
              {bests["daily-" + today] ? <span className="best">{t("g.best", { v: bests["daily-" + today] + " MB" })}</span> : null}
              <span className="go-arrow">{t("g.play")} →</span>
            </span>
          </button>
          <div className="cards">
            {KEYS.map((k) => {
              const d = SCENARIOS[k];
              return (
                <button key={k} type="button" className="card" onClick={() => (d.needsSetup ? setScreen("setup") : startMission(k))}>
                  <Image className="art" src={`/img/card-${d.icon}.jpg`} alt="" width={1200} height={400} loading="eager" sizes="(max-width: 900px) 100vw, 440px" />
                  <div className="body">
                    <span className={`tag ${d.diff}`}>{t(`g.scn.${k}.d`)}</span>
                    <h3>{t(`g.scn.${k}.t`)}</h3>
                    <p>{t(`g.scn.${k}.story`)}</p>
                    <div className="goal">{k === "peak" ? t("g.scn.peak.goal") : goalFor(k)}</div>
                    <div className="card-foot">
                      {bests[k] ? <span className="best">{t("g.best", { v: bests[k] + " MB" })}</span> : <span />}
                      <span className="go-arrow">{t("g.play")} →</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="howto">
            {raw<string[][]>("g.howto").map(([a, b], k) => (
              <div key={a}><span className="ico" aria-hidden="true">{HOWTO_ICONS[k]}</span><span className="eyebrow">{a}</span><p>{b}</p></div>
            ))}
          </div>
          <PoleExplainer />
          <p className="hint ai-note">{t("g2.aiNote")}</p>
        </section>
      )}

      {screen === "setup" && (
        <SetupScreen site={pSite} date={pDate} setSite={setPSite} setDate={setPDate} land={landFromInput()}
          onBack={() => setScreen("pick")} onGo={() => startMission("peak", pSite, landFromInput())} />
      )}

      {screen === "play" && mission && (
        <PlayScreen M={mission} frame={frame} speed={speed} setSpeed={setSpeed} autoPause={autoPause} setAutoPause={setAutoPause}
          goal={goalFor(mission.key, mission.sc)}
          onToggle={(what) => {
            const M = m.current!, s = M.s;
            sfx(what === "hib" && !s.hib ? "sleep" : "toggle");
            if (what === "hib") { s.hib = !s.hib; log(M, s.hib ? "earth" : "good", s.hib ? "g.ev.hib" : "g.ev.wake"); }
            else if (what === "sci") s.sci = !s.sci;
            else s.rad = !s.rad;
            rerender();
          }}
          intro={intro} onAbort={quit} />
      )}

      {screen === "end" && mission && (
        <Debrief M={mission} lang={lang}
          onAgain={() => (mission.key === "peak" ? setScreen("setup") : startMission(mission.key))}
          onPick={() => setScreen("pick")} />
      )}
    </main>
  );
}

/* ---------- screen: choose site + date ---------- */
function SetupScreen({ site, date, setSite, setDate, land, onBack, onGo }: {
  site: string; date: string; setSite: (v: string) => void; setDate: (v: string) => void; land: number; onBack: () => void; onGo: () => void;
}) {
  const { t, lang } = useI18n();
  const s = GAME_SITES.find((x) => x.id === site)!;
  const o = useMemo(() => hourly(s, land, 336), [s, land]);
  const ref = useCanvas((cv) => {
    drawForecast(cv, [[t("sun"), (j) => o.sFrac[j], "#f2a93b"], [t("earth"), (j) => (o.eEl[j] >= 0 ? 1 : 0), "#6ea7f2"]],
      { from: 0, span: 336, tickEvery: 48, tickLabel: (d) => t("g.dayN", { n: d * 2 }), labelW: lang === "bn" ? 58 : 50 });
  }, [o, lang]);
  let sn = 0, e = 0, b = 0;
  for (let q = 0; q < 336; q++) { const a = o.sFrac[q] >= 0.5, z = o.eEl[q] >= 0; sn += +a; e += +z; b += +(a && z); }
  const p = (x: number) => Math.round((x / 336) * 100);
  return (
    <section className="panel">
      <div className="eyebrow"><span className="num">{t("g.scn.peak.t")}</span></div>
      <h2 className="title">{t("g.setupTitle")}</h2>
      <p className="sub">{t("g.setupSub")}</p>
      <div className="setup">
        <div className="field"><label htmlFor="pSite">{t("g.site")}</label>
          <select id="pSite" value={site} onChange={(ev) => setSite(ev.target.value)}>
            {GAME_SITES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></div>
        <div className="field"><label htmlFor="pDate">{t("g.landDate")}</label>
          <input type="date" id="pDate" min={fmtD(PEAK_MIN)} max={fmtD(PEAK_MAX)} value={date} onChange={(ev) => ev.target.value && setDate(ev.target.value)} /></div>
        <div className="row">
          <button type="button" className="btn" onClick={onBack}>{t("g.back")}</button>
          <button type="button" className="btn accent" onClick={onGo}>{t("g.launch")}</button>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <canvas ref={ref} aria-label="14-day forecast for this site and date" />
        <p className="hint">{t("g.pvTxt", { s: p(sn), e: p(e), b: p(b) })}</p>
      </div>
    </section>
  );
}

/* ---------- screen: live mission ---------- */
type ToggleId = "sci" | "rad" | "hib";
function Toggle({ id, on, label, sub, dis, hib, onToggle }: {
  id: ToggleId; on: boolean; label: string; sub: string; dis: boolean; hib?: boolean; onToggle: (w: ToggleId) => void;
}) {
  const { t } = useI18n();
  return (
    <button type="button" className={`toggle${hib ? " hib" : ""}`} aria-pressed={on} disabled={dis} onClick={() => onToggle(id)}>
      <span className="ico" aria-hidden="true">{TOGGLE_ICONS[id]}</span><b>{label}</b><span className="sw">{on ? t("g.on") : t("g.off")}</span><small>{sub}</small>
    </button>
  );
}

function PlayScreen({ M, frame, speed, setSpeed, autoPause, setAutoPause, goal, intro, onToggle, onAbort }: {
  M: Mission; frame: number; speed: number; setSpeed: (v: number) => void; autoPause: boolean; setAutoPause: (v: boolean) => void;
  goal: string; intro: boolean; onToggle: (w: "sci" | "rad" | "hib") => void; onAbort: () => void;
}) {
  const { t, lang } = useI18n();
  const { sc, o, s } = M;
  // Clock time of the first frame of this mission, so the lander flies in once.
  const born = useRef({ M, at: 0 });
  const scene = useAnimCanvas((cv, now) => {
    if (born.current.M !== M || !born.current.at) born.current = { M, at: now };
    drawScene(cv, sc, o, s, M.stars, {
      sun: t("sun"), earth: t("earth"), exag: (k) => t("g.exag", { k }), panel: t("g.panel"),
    }, { t: now, frac: M.frac, age: now ? now - born.current.at : 99 });
  }, [frame, lang]);
  const fc = useCanvas((cv) => {
    const i = s.i, clamp = (j: number) => Math.min(o.n - 1, j);
    drawForecast(cv, [
      [t("sun"), (j) => o.sFrac[clamp(j)] * panelFactor(sc, o, clamp(j)), "#f2a93b"],
      [t("earth"), (j) => (o.eEl[clamp(j)] >= 0 ? 1 : 0), "#6ea7f2"],
    ], { from: i, span: 120, tickEvery: 24, tickLabel: (d) => (d ? t("g.dayN", { n: d }) : t("g.now")), endAt: sc.hours - i, labelW: lang === "bn" ? 58 : 50 });
  }, [frame, lang]);

  const b = s.bat / CFG.batteryWh, day = Math.floor(s.i / 24) + 1;
  const i = Math.min(s.i, o.n - 1), eUp = o.eEl[i] >= 0;
  const batCol = b > 0.5 ? "var(--both)" : b > 0.25 ? "var(--sun)" : "var(--warn)";
  // The lander talks: an alert when the game pauses on one, otherwise a hint for what to do next.
  const paused = speed === 0 && !intro && !s.dead && !s.done;
  const alert = paused && s.i > 0 && M.log[0]?.i === s.i ? M.log[0] : null;
  const dark = o.sFrac[i] < 0.5, full = s.stored >= CFG.storageMB;
  const tip = s.dead ? "frozen" : s.hib ? (CFG.solarW * o.sFrac[i] * panelFactor(sc, o, i) > 120 ? "wake" : "sleep")
    : b < 0.25 ? "low" : dark ? "dark" : eUp && s.stored > 0 && !s.rad ? "radio" : full && s.sci && !eUp ? "full"
    : !s.sci && b > 0.5 ? "sci" : s.sending ? "send" : "ok";
  return (
    <section>
      <div className="goalbar">
        <span><b className="scn-name">{t(`g.scn.${M.key}.t`)}</b> · {sc.site.name} · <span className="muted">{t("g.goal")}:</span> {goal}</span>
        <button type="button" className="btn small" onClick={onAbort}>{t("g.abort")}</button>
      </div>
      <div className="game">
        <div className="stack">
          <div className="panel scene">
            <canvas ref={scene} aria-label="View from the lander: sky, Sun, Earth and horizon" />
            <div className={`bubble ${alert ? alert.kind : "tip"}`} key={alert ? alert.id : tip}>
              <span className="ico" aria-hidden="true">{ICONS[alert ? alert.kind : "tip"]}</span>
              <span className="txt">{alert ? t(alert.key, alert.vars) : t(`g2.tip.${tip}`)}</span>
              {paused && <button type="button" className="btn accent" onClick={() => setSpeed(3)}>▶ {t("g2.go")}</button>}
            </div>
            <div className="hud">
              <div><div className="k">{t("g.battery")}</div><div className="v">{Math.round(b * 100)}<small>%</small></div>
                <div className="meter"><i style={{ width: `${b * 100}%`, background: batCol }} /></div><div className="n">{Math.round(s.bat)} / {CFG.batteryWh} Wh</div></div>
              <div><div className="k">{t("g.stored")}</div><div className="v">{Math.round(s.stored)}<small>MB</small></div>
                <div className="n">{t("g.maxMb", { n: CFG.storageMB })}</div></div>
              <div><div className="k">{t("g.sent")}</div><div className="v">{Math.round(s.sent)}<small>MB</small></div>
                <div className="n">{sc.winBy === "data" ? `/ ${sc.target} MB` : `★ ${sc.stars.filter((x) => x > 1).join(" / ")} MB`}</div></div>
              <div><div className="k">{t("g.clock")}</div><div className="v">{t("g.day", { d: day })}<small>/ {Math.ceil(sc.hours / 24)}</small></div>
                <div className="n">{fmtHour(sc.land + s.i * HOUR)}</div></div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head" style={{ marginBottom: 8 }}>
              <div className="eyebrow">{t("g.fcTitle")}</div><span className="hint">{t("g.fcSub")}</span>
            </div>
            <canvas ref={fc} aria-label="Five-day forecast of sunlight and Earth contact" />
          </div>
        </div>
        <div className="side">
          <div className="panel ctrls">
            <Toggle onToggle={onToggle} id="sci" on={s.sci && !s.hib} label={t("g.sci")} sub={t("g.sciS", { mb: CFG.scienceMB, w: CFG.scienceW })} dis={s.hib || s.dead} />
            <Toggle onToggle={onToggle} id="rad" on={s.rad && !s.hib} label={t("g.rad")} dis={s.hib || s.dead}
              sub={!eUp ? t("g.radWait") : s.stored <= 0 ? t("g.radIdle") : t("g.radS", { mb: CFG.radioMB, w: CFG.radioW })} />
            <Toggle onToggle={onToggle} id="hib" hib on={s.hib} label={t("g.hib")} sub={t("g.hibS", { w: CFG.hibernateW })} dis={s.dead} />
            <div className="flow">
              <span>{t("g.flowIn")}</span><span className="in">+{Math.round(s.solarW)} W</span>
              <span>{t("g.flowOut")}</span><span className="out">−{Math.round(s.loadW)} W</span>
            </div>
            <div className="speed" role="group" aria-label="Speed">
              {([[0, "II", t("g.pauseLbl")], [3, "▶", "1×"], [8, "▶▶", "2×"], [20, "▶▶▶", "4×"]] as const).map(([v, l, name]) => (
                <button key={v} type="button" aria-pressed={speed === v} aria-label={name} title={name} onClick={() => setSpeed(v)}>{l}</button>
              ))}
            </div>
            <label className="chk"><input type="checkbox" checked={autoPause} onChange={(e) => setAutoPause(e.target.checked)} /> {t("g.autoPause")}</label>
            <p className="hint">{t("g.spaceHint")}</p>
          </div>
          <div className="panel">
            <div className="eyebrow" style={{ marginBottom: 10 }}>{t("g.logTitle")}</div>
            <div className="log" aria-live="polite">
              {M.log.map((e) => (
                <div key={e.id} className={e.kind}>
                  <time>{t("g.dayShort", { d: Math.floor(e.i / 24) + 1, h: pad(e.i % 24) })}</time>{t(e.key, e.vars)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- screen: debrief ---------- */
function Debrief({ M, lang, onAgain, onPick }: { M: Mission; lang: string; onAgain: () => void; onPick: () => void }) {
  const { t } = useI18n();
  const { sc, s, o, key } = M;
  const replay = useCanvas((cv) => drawReplay(cv, sc, o, s), [M]);
  const n = starsFor(sc, s);
  const win = !s.dead && (sc.winBy !== "data" || s.sent >= (sc.target ?? 0));
  const [copied, setCopied] = useState(false);
  const share = () => {
    const text = t("g2.shareText", { day: sc.day ?? "", mb: Math.round(s.sent), stars: "★".repeat(n) + "☆".repeat(3 - n) }) + " " + location.origin + "/game";
    navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {});
  };
  let why = "";
  if (key === "vikram") {
    const nightH = sc.nightH ?? 0, need = Math.round(nightH * CFG.hibernateW), aw = CFG.avionicsW + CFG.heaterDarkW;
    let setIdx = 0;
    for (let k = 1; k < s.batHist.length; k++) if (o.sFrac[k] < 0.5 && o.sFrac[k - 1] >= 0.5) { setIdx = k; break; }
    why = `<p>${s.dead ? t("g.why.vikramLose", { n: nightH, aw, last: Math.round(CFG.batteryWh / aw), need })
      : t("g.why.vikramWin", { b: Math.round((s.batHist[setIdx] || 0) * 100), w: CFG.hibernateW, need, n: nightH })}</p><p>${t("g.why.vikramFact")}</p>`;
  } else if (key === "tipped") {
    why = `${s.dead ? `<p>${t("g.why.tippedLose")}</p>` : ""}<p>${t("g.why.tippedTxt", { pa: Math.round(sc.panelAz ?? 0) })}</p><p>${t("g.why.tippedFact")}</p>`;
  } else {
    let a = 0, e = 0, b = 0;
    for (let k = 0; k < sc.hours; k++) { const x = o.sFrac[k] >= 0.5, q = o.eEl[k] >= 0; a += +x; e += +q; b += +(x && q); }
    const p = (x: number) => Math.round((x / sc.hours) * 100);
    why = `<p>${t("g.why.peakTxt", { site: sc.site.name, s: p(a), e: p(e), b: p(b) })}</p><p>${t("g.why.peakFact")}</p>`;
  }
  const stats: [string, string][] = [
    [t("g.st.sent"), Math.round(s.sent) + " MB"], [t("g.st.lost"), Math.round(s.lost) + " MB"],
    [t("g.st.minBat"), Math.round(s.minBat * 100) + "%"], [t("g.st.dark"), t("g.st.hours", { n: s.darkH })],
    [t("g.st.survived"), t("g.st.hours", { n: s.i })],
  ];
  return (
    <section className="panel debrief" lang={lang}>
      <div>
        <Mascot mood={s.dead ? "dead" : win ? "happy" : "awake"} height={130} />
        <div className="eyebrow">{t(`g.scn.${key}.t`)} · {sc.site.name} · {fmtD(sc.land)}</div>
        <div className={`result ${s.dead ? "lose" : win ? "win" : ""}`}>{s.dead ? t("g.lose") : win ? t("g.win") : t("g.done")}</div>
        <div className="stars" aria-label={`${n} / 3`}>{[0, 1, 2].map((k) => <span key={k} className={k < n ? "" : "off"}>★</span>)}</div>
        <div className="stats">{stats.map(([k, v]) => <div key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}</div>
        <canvas ref={replay} aria-label="Battery and science over the whole mission" />
        <p className="hint" style={{ marginTop: 6 }}>{t("g.replayCap")}</p>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="btn accent" onClick={onAgain}>{t("g.again")}</button>
          <button type="button" className="btn" onClick={onPick}>{t("g.other")}</button>
          {sc.day && <button type="button" className="btn" onClick={share}>{copied ? "✓ " + t("g2.copied") : t("g2.share")}</button>}
        </div>
      </div>
      <div className="why">
        <h3>{t("g.why.title")}</h3>
        <div dangerouslySetInnerHTML={{ __html: why }} />
        <p className="hint">{t("g.why.data")}</p>
        <p><Link href={`/planner?site=${sc.site.id}&start=${fmtD(sc.land)}`}>{t("g.why.open")} →</Link></p>
      </div>
    </section>
  );
}
