"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { setRoar, sfx } from "@/lib/sound";
import { Bubble, HoldButton, TapButton } from "./Bubble";
import { ART, LANDER, flagImg, flagList, homeFlag, kidFace, shipImg, suitFace, type Crew } from "./data";
import { useSuitFace } from "./useSuitFace";
import { Porthole } from "./Porthole";
import { Mission, type SkyDirs, type Telemetry, type View } from "./mission3d";

type Step = "load" | "orbit" | "tli" | "wave" | "waved" | "water" | "waterDone" | "rocks" | "rocksDone" | "gaze" | "galaxy" | "approach" | "brake"
  | "earthrise" | "photo" | "lander" | "descent" | "touch" | "pole" | "live" | "walk" | "jumped" | "flag" | "plant" | "noWind" | "peace" | "done";

const VIEW: Partial<Record<Step, View>> = {
  orbit: "orbit", tli: "orbit", wave: "lookBack", waved: "lookBack", water: "cockpit", waterDone: "cockpit", rocks: "cockpit", rocksDone: "cockpit", gaze: "galaxy", galaxy: "galaxy",
  approach: "approach", brake: "approach", earthrise: "earthrise", photo: "earthrise", lander: "earthrise",
};
const CAP: Partial<Record<Step, number>> = { wave: 0.1, water: 0.4, rocks: 0.72, gaze: 0.85, approach: 1 };
const DROPS = 5, ROCKS = 5;

export interface Landing { site: string; photo: string; final: string }

interface SiteNow { id: string; name: string; sunEl: number; sunAz: number; earthEl: number; earthAz: number }
const FALLBACK: SkyDirs = { sunAz: 125, sunEl: 3, earthAz: 15, earthEl: 5 };

/** Pick a real south-pole site with the Sun up right now, and use its actual Sun and Earth directions. */
async function landingSky(): Promise<{ name: string; sky: SkyDirs; live: boolean }> {
  try {
    const res = await fetch("/api/now");
    const sites = ((await res.json()).sites as SiteNow[]).filter((s) => ["A", "B", "C", "D", "M1", "M2"].includes(s.id));
    const pick = sites.find((s) => s.sunEl >= 1.5 && s.earthEl >= 2) ?? sites.find((s) => s.sunEl > 0.5) ?? sites[0];
    const live = pick.sunEl >= 1.5 && pick.sunEl <= 14 && pick.earthEl >= 2 && pick.earthEl <= 16;
    const c = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    return { name: pick.name, live, sky: { sunAz: pick.sunAz, sunEl: c(pick.sunEl, 1.5, 12), earthAz: pick.earthAz, earthEl: c(pick.earthEl, 2, 14) } };
  } catch {
    return { name: "Shackleton rim A", live: false, sky: FALLBACK };
  }
}

function FlagPicker({ value, onPick }: { value: string; onPick: (code: string) => void }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const all = useMemo(() => {
    const list = flagList(lang), home = homeFlag();
    const first = list.find((f) => f.code === home);
    return first ? [first, ...list.filter((f) => f !== first)] : list;
  }, [lang]);
  const shown = q.trim() ? all.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase())) : all;
  return (
    <div className="mm-flags" role="dialog" aria-label={t("adv.flagQ")}>
      <h2>{t("adv.flagQ")}</h2>
      <input type="search" placeholder={t("adv.flagSearch")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("adv.flagSearch")} />
      <div className="mm-flag-grid">
        {shown.map((f) => (
          <button type="button" key={f.code} className={f.code === value ? "on" : ""} onClick={() => { sfx("toggle"); onPick(f.code); }}>
            <img src={flagImg(f.code)} alt="" loading="lazy" /><span>{f.name}</span>
          </button>
        ))}
        {!shown.length && <p className="mm-note">{t("adv.flagNone")}</p>}
      </div>
    </div>
  );
}

export function Flight({ crew, setCrew, voice, onDone }: { crew: Crew; setCrew: (c: Crew) => void; voice: boolean; onDone: (l: Landing) => void }) {
  const { t } = useI18n();
  const suited = useSuitFace(crew.suit, crew.kid);
  const canvas = useRef<HTMLCanvasElement>(null);
  const m = useRef<Mission | null>(null);
  const tel = useRef<Telemetry>({ u: 0, alt: 0, vy: 0 });
  const [step, setStep] = useState<Step>("load");
  const [hud, setHud] = useState<Telemetry>({ u: 0, alt: 55, vy: -6 });
  const [left, setLeft] = useState(DROPS);
  const [pushed, setPushed] = useState(0);
  const [brake, setBrake] = useState(0);
  const [touch, setTouch] = useState(0);
  const [walked, setWalked] = useState(false);
  const [lite, setLite] = useState(false);
  const [no3d, setNo3d] = useState(false);
  const [flash, setFlash] = useState(0);
  const [fade, setFade] = useState(false);
  const site = useRef<{ name: string; sky: SkyDirs; live: boolean }>({ name: "Shackleton rim A", sky: FALLBACK, live: false });
  const [siteName, setSiteName] = useState("Shackleton rim A");
  const [siteLive, setSiteLive] = useState(false);
  const photo = useRef("");
  const braking = useRef(false);
  const busy = useRef(false);

  // Build the 3D world once; find today's landing sky meanwhile.
  useEffect(() => {
    let dead = false;
    void landingSky().then((s) => { site.current = s; if (!dead) { setSiteName(s.name); setSiteLive(s.live); } });
    void Promise.all([suitFace(crew.suit, crew.kid), suitFace(crew.suit, crew.kid, "salute")]).then(([suit, salute]) => Mission.create(canvas.current!, {
      ship: shipImg(crew.ship), lander: LANDER, suit, salute,
      earth: `${ART}/earth.jpg`, moon: `${ART}/moon.jpg`,
    })).then((mission) => {
      if (dead) { mission.dispose(); return; }
      m.current = mission;
      if (location.search.includes("debug")) (window as unknown as { __mm: Mission }).__mm = mission;
      mission.onTelemetry = (x) => { tel.current = x; };
      mission.onSlow = () => { setLite(true); setTimeout(() => setLite(false), 5000); };
      setStep("orbit");
    }).catch(() => setNo3d(true));
    return () => { dead = true; m.current?.dispose(); m.current = null; setRoar(0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each step sets the camera and how far the ship may coast.
  useEffect(() => {
    const mi = m.current;
    if (!mi) return;
    const v = VIEW[step];
    if (v) mi.setView(v);
    const cap = CAP[step];
    if (cap !== undefined) mi.setCap(cap);
    if (step === "wave") mi.tapEarth(() => { sfx("earth"); setStep("waved"); });
    else mi.tapEarth(null);
    if (step === "water") mi.spawnWater(DROPS, (n) => { sfx("pop"); setLeft(n); if (!n) setTimeout(() => setStep("waterDone"), 500); });
    if (step === "rocks") mi.spawnRocks(ROCKS, (n) => { sfx("whoosh"); setPushed(n); if (n >= ROCKS) setTimeout(() => setStep("rocksDone"), 700); });
    if (step === "walk") mi.walkOut(() => setWalked(true));
  }, [step]);

  // Telemetry at a calm pace, plus the moments the flight itself decides (arriving at the Moon).
  useEffect(() => {
    const id = setInterval(() => {
      const x = tel.current;
      setHud({ ...x });
      if (step === "approach" && x.u >= 1) setStep("brake");
      if (step === "brake" && braking.current) {
        setBrake((b) => {
          const nb = Math.min(1, b + 0.06);
          if (nb >= 1 && b < 1) { m.current?.setBurn(false); m.current?.captured(); setRoar(0); sfx("chime"); setTimeout(() => setStep("earthrise"), 600); }
          return nb;
        });
      }
    }, 120);
    return () => clearInterval(id);
  }, [step]);

  const next = (s: Step) => { sfx("send"); setStep(s); };
  const fire = () => {
    m.current?.fireToMoon(); sfx("whoosh"); setRoar(1);
    setTimeout(() => setRoar(0), 2600);
    setTimeout(() => setStep("wave"), 3000);
  };
  const snap = () => {
    if (!m.current) return;
    photo.current = m.current.snapshot();
    sfx("shutter"); setFlash((f) => f + 1);
    setTimeout(() => setStep("photo"), 500);
  };
  const toLander = () => {
    sfx("send"); setFade(true);
    setTimeout(() => {
      m.current?.startDescent(site.current.sky, (speed) => {
        setRoar(0); setTouch(speed); sfx(speed < 3 ? "win" : "land");
        setTimeout(() => setStep("touch"), 900);
      });
      setStep("descent"); setFade(false);
    }, 700);
  };
  const plant = async () => {
    if (busy.current || !m.current) return;
    busy.current = true;
    await m.current.plantFlag(flagImg(crew.flag));
    setTimeout(() => { sfx("clunk"); }, 450);
    setTimeout(() => { busy.current = false; setStep("noWind"); }, 1500);
  };
  const finish = () => {
    m.current?.salute(); sfx("win");
    setStep("done");
  };
  const end = () => {
    const final = m.current?.snapshot() ?? "";
    onDone({ site: site.current.name, photo: photo.current || final, final });
  };

  const name = crew.name.trim();
  const tooFast = step === "descent" && hud.alt < 28 && hud.vy < -5;
  const lines: Partial<Record<Step, string>> = {
    orbit: t("adv.b.orbit"), tli: t("adv.b.tli"), wave: `${t("adv.b.lookBack")} ${t("adv.b.wave")}`, waved: t("adv.b.waved"),
    water: t("adv.b.water"), waterDone: t("adv.b.waterDone"), rocks: t("adv.b.rocks"), rocksDone: t("adv.b.rocksDone", { name }),
    gaze: t("adv.b.gaze", { name }), galaxy: t("adv.b.galaxy"),
    brake: t("adv.b.brake"), earthrise: t("adv.b.earthrise"), photo: t("adv.b.photo"), lander: t("adv.b.lander"),
    descent: tooFast ? t("adv.b.tooFast") : t("adv.b.landHow"), touch: touch < 3 ? t("adv.b.touchdown") : t("adv.b.bumpy"),
    pole: t("adv.b.pole", { site: siteName }), live: t("adv.b.live"), walk: t("adv.b.walk"), jumped: t("adv.b.jumped"),
    flag: t("adv.b.flag"), plant: t("adv.b.plantHow"), noWind: t("adv.b.noWind"), peace: t("adv.b.peace"), done: t("adv.b.done", { name }),
  };
  const ok: Partial<Record<Step, () => void>> = {
    orbit: () => next("tli"), waved: () => next("water"), waterDone: () => next("rocks"), rocksDone: () => next("gaze"),
    gaze: () => { sfx("whoosh"); setStep("galaxy"); }, galaxy: () => next("approach"),
    photo: () => next("lander"), lander: toLander, touch: () => next("pole"), pole: () => next(siteLive ? "live" : "walk"),
    live: () => next("walk"), jumped: () => next("flag"), noWind: () => next("peace"), peace: finish, done: end,
  };
  const transfer = step !== "load" && step !== "orbit" && step !== "tli" && hud.u > 0 && hud.u < 1 && !VIEW[step]?.startsWith("earth");

  return (
    <div className={`mm-flight ${VIEW[step] === "cockpit" ? "cockpit" : ""}`}>
      <canvas ref={canvas} className="mm-canvas" />
      <div className="mm-window" aria-hidden="true" />
      {step === "gaze" && <Porthole suited={suited} side="outside" />}
      {step === "galaxy" && <Porthole suited={suited} side="inside" />}
      {flash > 0 && <div className="mm-photo-flash" key={flash} />}
      <div className={`mm-fade ${fade || step === "load" ? "on" : ""}`} />
      {step === "load" && !no3d && <div className="mm-loading"><span className="mm-spinner" /></div>}
      {no3d && <div className="mm-loading">{t("adv.no3d")}</div>}

      <div className="mm-top">
        <span className="mm-badge"><img src={kidFace(crew.kid)} alt="" />{t("adv.you", { name })}</span>
        {transfer && (
          <span className="mm-trip">
            <b>{t("adv.day", { n: 1 + Math.min(2, Math.floor(hud.u * 3)) })}</b>
            <span className="mm-trip-bar"><i style={{ width: `${hud.u * 100}%` }} /></span>
            <small>{t("adv.toMoon")}: {t("adv.km", { n: Math.round((1 - hud.u) * 384400).toLocaleString() })}</small>
          </span>
        )}
        {step === "descent" && (
          <span className={`mm-trip gauges ${tooFast ? "warn" : hud.vy > -3 ? "good" : ""}`}>
            <span><small>{t("adv.alt")}</small><b>{t("adv.m", { n: Math.max(0, Math.round(hud.alt)) })}</b></span>
            <span><small>{t("adv.speed")}</small><b>{t("adv.ms", { n: Math.abs(hud.vy).toFixed(1) })}</b></span>
          </span>
        )}
        {(step === "water" || step === "rocks") && (
          <span className="mm-count-chip">{step === "water" ? "💧" : "🪨"} {t("adv.found", { n: step === "water" ? DROPS - left : pushed, total: step === "water" ? DROPS : ROCKS })}</span>
        )}
      </div>
      {lite && <p className="mm-lite">{t("adv.lite")}</p>}

      {step === "flag" && <FlagPicker value={crew.flag} onPick={(code) => { setCrew({ ...crew, flag: code }); setStep("plant"); }} />}
      {step === "peace" && (
        <div className="mm-plaque">
          <img src={flagImg(crew.flag)} alt="" />
          <p>{t("adv.plaque", { name })}</p>
        </div>
      )}

      {lines[step] && <Bubble text={lines[step]!} voice={voice} onOk={ok[step]} />}

      <div className="mm-actions">
        {step === "tli" && <TapButton label={t("adv.fire")} onTap={fire} />}
        {step === "wave" && <TapButton label="👋" tone="blue emoji" onTap={() => { sfx("earth"); setStep("waved"); }} />}
        {step === "brake" && <HoldButton label={t("adv.brake")} tone="blue" progress={brake} onHold={(d) => { braking.current = d; m.current?.setBurn(d); setRoar(d ? 0.8 : 0); }} />}
        {step === "earthrise" && <TapButton label={`📷 ${t("adv.photo")}`} tone="gold" onTap={snap} />}
        {step === "descent" && <HoldButton label={t("adv.thrust")} progress={Math.min(1, Math.max(0, 1 - hud.alt / 55))} onHold={(d) => { m.current?.setThrust(d); setRoar(d ? 0.7 : 0); }} />}
        {(step === "walk" || step === "jumped") && walked && <TapButton label={t("adv.jump")} tone="blue" onTap={() => { sfx("hop"); m.current?.jump(() => { if (step === "walk") setStep("jumped"); }); }} />}
        {step === "plant" && <TapButton label={`🚩 ${t("adv.plant")}`} tone="gold" onTap={() => void plant()} />}
      </div>
    </div>
  );
}
