"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { LunaChat, useLuna } from "./LunaChat";
import { LunaFace } from "./LunaFace";

const TEASED = "spwp-luna-teased";

/** Luna in the bottom corner of every page: a button that opens a small chat window. The /ask page has her full size instead. */
export function LunaWidget() {
  const { t } = useI18n();
  const path = usePathname();
  const chat = useLuna();
  const [open, setOpen] = useState(false);
  const [tease, setTease] = useState(false);

  // Once per visit, a few seconds in, Luna says hello so children notice her.
  useEffect(() => {
    let seen = true;
    try { seen = !!sessionStorage.getItem(TEASED); } catch {}
    if (seen) return;
    const show = setTimeout(() => { setTease(true); try { sessionStorage.setItem(TEASED, "1"); } catch {} }, 4000);
    const hide = setTimeout(() => setTease(false), 13000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (path?.startsWith("/ask")) return null;
  if (!open) return (
    <div className="luna-dock">
      {tease && <button type="button" className="luna-tease" onClick={() => { setTease(false); setOpen(true); }}>{t("a.tease")}</button>}
      <button type="button" className="luna-fab" aria-haspopup="dialog" onClick={() => { setTease(false); setOpen(true); }}>
        <LunaFace size={54} mood={chat.mood} /><span>{t("a.title")}</span>
      </button>
    </div>
  );
  return (
    <section className="luna-pop" role="dialog" aria-label={t("a.title")}>
      <header className="luna-pop-head">
        <LunaFace size={46} mood={chat.mood} />
        <b>{t("a.title")}</b>
        <button type="button" className="iconbtn" aria-label={t("a.close")} title={t("a.close")} onClick={() => setOpen(false)}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </header>
      <LunaChat chat={chat} compact />
    </section>
  );
}
