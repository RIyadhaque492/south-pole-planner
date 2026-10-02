import { ApiError } from "@google/genai";
import { LANGS, type Lang } from "@/lib/dict";
import { askLuna, type Turn } from "@/lib/server/luna";

export const maxDuration = 60;

const MAX_TURNS = 16, MAX_CHARS = 600;
/** Questions allowed per visitor address in each window. Kept in memory, so it is per server process. */
const LIMIT = 15, WINDOW_MS = 5 * 60e3;
const seen = new Map<string, number[]>();

function allowed(who: string) {
  const now = Date.now(), recent = (seen.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) { seen.set(who, recent); return false; }
  seen.set(who, [...recent, now]);
  if (seen.size > 5000) for (const [k, v] of seen) if (!v.some((t) => now - t < WINDOW_MS)) seen.delete(k);
  return true;
}

const fail = (error: "bad" | "setup" | "busy" | "refused" | "other", status: number) => Response.json({ error }, { status });

/**
 * POST /api/ask  { lang: "en" | "bn" | "es", messages: [{ role: "user" | "assistant", text }] }
 * Luna's answer to the last message: { answer, checked }. `checked` is true when she looked something up in the sky engine.
 * Needs GEMINI_API_KEY in the server's environment (a free key from Google AI Studio works).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { lang?: string; messages?: unknown } | null;
  const lang = LANGS.includes(body?.lang as Lang) ? (body!.lang as Lang) : "en";
  const turns = Array.isArray(body?.messages) ? (body.messages as Turn[]).slice(-MAX_TURNS) : [];
  const ok = turns.length > 0 && turns[turns.length - 1].role === "user"
    && turns.every((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.text === "string" && m.text.trim() !== "" && m.text.length <= MAX_CHARS * (m.role === "user" ? 1 : 8));
  if (!ok) return fail("bad", 400);
  // A trimmed history must still open with the visitor's turn.
  while (turns[0].role !== "user") turns.shift();

  if (!process.env.GEMINI_API_KEY) return fail("setup", 503);
  if (!allowed(request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local")) return fail("busy", 429);

  try {
    const reply = await askLuna(turns, lang);
    return reply.answer ? Response.json(reply) : fail("refused", 200);
  } catch (error) {
    if (error instanceof ApiError) {
      console.error("ask:", error.status, error.message);
      // A wrong or missing key comes back as 400 "API key not valid", or as 401/403.
      if (error.status === 401 || error.status === 403 || (error.status === 400 && /api key/i.test(error.message))) return fail("setup", 503);
      // The free tier allows a limited number of questions per minute and per day, and a model can be overloaded.
      return [429, 503, 504].includes(error.status) ? fail("busy", 429) : fail("other", 502);
    }
    console.error("ask:", error);
    return fail("other", 500);
  }
}
