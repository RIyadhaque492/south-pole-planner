"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { LunaFace, type LunaMood } from "./LunaFace";

interface Msg { role: "user" | "assistant"; text: string; checked?: boolean }
type Problem = "setup" | "offline" | "busy" | "refused" | "other";
const ERR: Record<Problem, string> = { setup: "a.errSetup", offline: "a.errOffline", busy: "a.errBusy", refused: "a.errRefused", other: "a.errOther" };

/** One conversation with Luna. The server answers through /api/ask; nothing is kept after the page is closed. */
export function useLuna() {
  const { lang } = useI18n();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [cheer, setCheer] = useState(false);
  useEffect(() => {
    if (!cheer) return;
    const timer = setTimeout(() => setCheer(false), 2600);
    return () => clearTimeout(timer);
  }, [cheer]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(next); setProblem(null); setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, messages: next.map(({ role, text }) => ({ role, text })) }),
      });
      const data = await res.json().catch(() => ({})) as { answer?: string; checked?: boolean; error?: string };
      if (data.answer) { setMsgs([...next, { role: "assistant", text: data.answer, checked: data.checked }]); setCheer(true); }
      else setProblem(data.error && data.error in ERR ? (data.error as Problem) : "other");
    } catch {
      setProblem("offline");
    } finally {
      setBusy(false);
    }
  };
  const clear = () => { setMsgs([]); setProblem(null); };
  const mood: LunaMood = busy ? "thinking" : cheer ? "happy" : "idle";
  return { msgs, busy, problem, mood, ask, clear };
}

/** The messages, the starter questions and the box to type in. `compact` is the corner window: fewer starters. */
export function LunaChat({ chat, compact = false }: { chat: ReturnType<typeof useLuna>; compact?: boolean }) {
  const { t, raw } = useI18n();
  const { msgs, busy, problem, ask, clear } = chat;
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy, problem]);
  const starters = raw<string[]>("a.qs");

  return (
    <div className={`ask-chat${compact ? " compact" : ""}`}>
      <div className="ask-log" ref={log} aria-live="polite">
        <p className="ask-msg luna"><LunaFace size={36} still /><span>{t("a.hello")}</span></p>
        {msgs.map((m, k) => (
          <p key={k} className={`ask-msg ${m.role === "user" ? "me" : "luna"}`}>
            {m.role === "assistant" && <LunaFace size={36} still />}
            <span>
              {m.text}
              {m.checked && <small className="ask-checked"><span aria-hidden="true">🔭</span> {t("a.checked")}</small>}
            </span>
          </p>
        ))}
        {busy && <p className="ask-msg luna thinking"><LunaFace size={36} still mood="thinking" /><span>{t("a.thinking")}</span></p>}
        {problem && <p className="ask-msg luna problem" role="alert"><span className="ask-who" aria-hidden="true">⚠️</span><span>{t(ERR[problem])}</span></p>}
        {msgs.length === 0 && !busy && (
          <div className="ask-try">
            <p className="hint">{t("a.tryT")}</p>
            <div className="ask-chips">
              {(compact ? starters.slice(0, 4) : starters).map((q) => <button key={q} type="button" onClick={() => ask(q)}>{q}</button>)}
            </div>
          </div>
        )}
      </div>

      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); ask(draft); setDraft(""); }}>
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} aria-label={t("a.inputLabel")} placeholder={t("a.placeholder")} autoComplete="off" enterKeyHint="send" />
        <button type="submit" className="btn accent" disabled={busy || !draft.trim()}>{t("a.send")} →</button>
        {msgs.length > 0 && <button type="button" className="btn" disabled={busy} onClick={clear}>{t("a.clear")}</button>}
      </form>
      <p className="hint ask-note">{t("a.note")}</p>
    </div>
  );
}
