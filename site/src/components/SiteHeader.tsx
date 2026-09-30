"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

function MoonMark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 3a13 13 0 0 1 0 26z" fill="currentColor" />
      <circle cx="16" cy="16" r="2.4" fill="var(--sun)" />
    </svg>
  );
}

function ThemeToggle() {
  const { t } = useI18n();
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the theme is only known in the browser
    setDark(attr ? attr === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("spwp-theme", next); } catch {}
    setDark(!dark);
  };
  return (
    <button type="button" className="iconbtn" onClick={flip} aria-label={dark ? t("theme.toLight") : t("theme.toDark")} title={dark ? t("theme.toLight") : t("theme.toDark")}>
      {dark === false ? (
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" fill="currentColor" /></svg>
      ) : (
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="currentColor" /><g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1="10" y1="2" x2="10" y2="4" transform={`rotate(${a} 10 10)`} />)}</g></svg>
      )}
    </button>
  );
}

export function SiteHeader() {
  const { t, lang, setLang } = useI18n();
  const path = usePathname();
  const at = path?.startsWith("/game") ? "game" : path?.startsWith("/planner") ? "planner" : "home";
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand"><MoonMark /><span>{t("brand")}</span></Link>
        <nav className="tabs" aria-label="Sections">
          <Link href="/" aria-current={at === "home" ? "page" : undefined}>{t("nav.home")}</Link>
          <Link href="/planner" aria-current={at === "planner" ? "page" : undefined}>{t("nav.planner")}</Link>
          <Link href="/game" aria-current={at === "game" ? "page" : undefined}>{t("nav.game")}</Link>
        </nav>
        <div className="topbar-tools">
          <div className="seg" role="group" aria-label="Language">
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button type="button" aria-pressed={lang === "bn"} onClick={() => setLang("bn")} lang="bn">বাংলা</button>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
