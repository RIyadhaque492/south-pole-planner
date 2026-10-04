"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { setRoar, setSound, soundOn } from "@/lib/sound";
import { canSpeak, saveVoicePref, voicePref } from "./Bubble";
import { Certificate } from "./Certificate";
import { CrewRoom } from "./CrewRoom";
import { ART, KIDS, LANDER, SHIPS, SUITS, homeFlag, kidFace, kidImg, shipImg, suitImg, type Crew } from "./data";
import { Flight, type Landing } from "./Flight";
import { Launch } from "./Launch";

type Act = "crew" | "launch" | "flight" | "cert";

/** Warm the browser cache so later scenes appear without a wait. */
function preload() {
  const urls = [...KIDS.flatMap((k) => [kidImg(k), kidFace(k)]), ...SUITS.flatMap((s) => [suitImg(s), suitImg(s, "salute")]), ...SHIPS.map(shipImg), LANDER, `${ART}/earth.jpg`, `${ART}/moon.jpg`];
  for (const u of urls) { const i = new Image(); i.src = u; }
}

/** Mission Moonlight: build a crew, launch, fly to the Moon, land, plant a flag, take home a certificate. */
export function Adventure() {
  const { t, lang, setLang } = useI18n();
  const [act, setAct] = useState<Act>("crew");
  const [crew, setCrew] = useState<Crew>({ name: "", kid: "kid-1", suit: "white", ship: "rocket", flag: "un" });
  const [landing, setLanding] = useState<Landing | null>(null);
  const [voice, setVoice] = useState(false);
  const [sound, setSnd] = useState(true);
  const [run, setRun] = useState(0);
  const [mute, setMute] = useState(false);

  // Tell the child when their language can't be read aloud on this device, rather than reading it in another one.
  useEffect(() => {
    let live = true;
    void canSpeak(lang).then((ok) => { if (live) setMute(!ok); });
    return () => { live = false; };
  }, [lang]);

  useEffect(() => {
    preload();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferences and locale live in the browser
    setVoice(voicePref()); setSnd(soundOn());
    setCrew((c) => ({ ...c, flag: homeFlag() }));
    document.documentElement.classList.add("mm-open");
    return () => { document.documentElement.classList.remove("mm-open"); setRoar(0); try { speechSynthesis.cancel(); } catch {} };
  }, []);

  const again = () => { setLanding(null); setAct("launch"); setRun((r) => r + 1); };

  return (
    <div className={`mm act-${act}`}>
      <div className="mm-backdrop" aria-hidden="true"><div className="mm-starfield" /><div className="mm-bigmoon" /></div>
      <div className="mm-tools">
        <Link href="/" className="mm-icon" aria-label="✕" title={t("nav.home")}>✕</Link>
        <span className="mm-brand">{t("brand")} <small>{t("tagline")}</small></span>
        <div className="mm-lang" role="group" aria-label={t("adv.lang")}>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">EN</button>
          <button type="button" aria-pressed={lang === "bn"} onClick={() => setLang("bn")} lang="bn">বাংলা</button>
          <button type="button" aria-pressed={lang === "es"} onClick={() => setLang("es")} lang="es">ES</button>
        </div>
        <button type="button" className="mm-icon" aria-pressed={sound} title={t("adv.sound")} aria-label={t("adv.sound")}
          onClick={() => { setSound(!sound); setSnd(!sound); }}>{sound ? "🔊" : "🔇"}</button>
        <button type="button" className="mm-icon" aria-pressed={voice} title={t("adv.voice")} aria-label={t("adv.voice")}
          onClick={() => { saveVoicePref(!voice); setVoice(!voice); }}>{voice ? "🗣️" : "🤫"}</button>
      </div>
      {voice && mute && <p className="mm-novoice" role="status">🔈 {t("adv.noVoice")}</p>}

      {act === "crew" && <CrewRoom crew={crew} setCrew={setCrew} voice={voice} onLaunch={() => setAct("launch")} />}
      {act === "launch" && <Launch key={`l${run}`} crew={crew} voice={voice} onDone={() => setAct("flight")} />}
      {act === "flight" && <Flight key={`f${run}`} crew={crew} setCrew={setCrew} voice={voice} onDone={(l) => { setLanding(l); setAct("cert"); }} />}
      {act === "cert" && landing && <Certificate crew={crew} landing={landing} onAgain={again} />}
    </div>
  );
}
