"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DICT, type Lang } from "./dict";

const KEY = "spwp-lang";

type Vars = Record<string, string | number>;
interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Look up a dotted key and fill {placeholders}. */
  t: (key: string, vars?: Vars) => string;
  /** Look up a dotted key and return whatever is there (arrays, objects). */
  raw: <T = unknown>(key: string) => T;
  /** Human duration from hours: "3 hours", "4.5 days". */
  dur: (h: number) => string;
}

const get = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), obj);

const Ctx = createContext<I18n | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- saved preference only exists on the client
      if (localStorage.getItem(KEY) === "bn") setLangState("bn");
    } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch {}
  }, []);

  const value = useMemo<I18n>(() => {
    const raw = <T,>(key: string) => (get(DICT[lang], key) ?? get(DICT.en, key) ?? key) as T;
    const t = (key: string, vars: Vars = {}) => {
      let s = raw<unknown>(key);
      if (typeof s !== "string") return String(s);
      for (const [a, b] of Object.entries(vars)) s = (s as string).split("{" + a + "}").join(String(b));
      return s as string;
    };
    const dur = (h: number) => {
      if (h < 0.5) return t("zero");
      if (h >= 36) {
        const d = h / 24, s = d >= 10 ? Math.round(d) : +d.toFixed(1);
        return s === 1 ? t("day1") : t("days", { n: s });
      }
      const r = Math.round(h);
      return r === 1 ? t("hour1") : t("hours", { n: r });
    };
    return { lang, setLang, t, raw, dur };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside LangProvider");
  return v;
}
