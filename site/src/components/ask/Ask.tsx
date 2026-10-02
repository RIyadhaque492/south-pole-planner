"use client";
import { useI18n } from "@/lib/i18n";
import { LunaChat, useLuna } from "./LunaChat";
import { LunaFace } from "./LunaFace";

/** The full-page chat with Luna. */
export function Ask() {
  const { t, lang } = useI18n();
  const chat = useLuna();
  return (
    <main className="wrap ask-page">
      <header className="page-head ask-head">
        <LunaFace size={132} mood={chat.mood} />
        <div>
          <h1>{t("a.title")}</h1>
          <p>{t("a.intro")}</p>
        </div>
      </header>
      <section className="panel"><LunaChat chat={chat} /></section>
      <footer className="foot" lang={lang}>{t("footer")}</footer>
    </main>
  );
}
