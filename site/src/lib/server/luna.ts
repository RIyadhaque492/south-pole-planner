/* Server-only: "Luna", the guide on /ask. Gemini answers in plain words for children, and every sky number
   it gives comes from the same engine as the Planner, through the tools below. */
import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import { DICT, type Dict, type Lang } from "../dict";
import { T_MAX, T_MIN } from "../ephemeris";
import { MISSIONS, replay } from "../missions";
import { SITE_SEEDS, type SiteSeed } from "../sites";
import { clampTime, outlook, skyNow } from "../sky";
import { withTerrain } from "../terrain";
import { ensureGeometry } from "./geometry";

export interface Turn { role: "user" | "assistant"; text: string }
export interface Reply { answer: string; checked: boolean }

/** Models with a free tier on the Gemini API, tried in order: the next one answers when the one before is overloaded,
    too slow or out of free quota. Set GEMINI_MODEL to put another first. */
const MODELS = [...new Set([process.env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"])];
/** A child should not wait long: a model that has not answered by then is skipped. */
const TIMEOUT_MS = 15e3;
/** After a model fails, questions start at the one that worked for this long before the first is tried again. */
const REMEMBER_MS = 10 * 60e3;
let working = { index: 0, until: 0 };
/** How many times Luna may look things up before she has to answer. */
const MAX_LOOKUPS = 5;

const LANG_NAME: Record<Lang, string> = { en: "English", bn: "Bengali", es: "Spanish" };
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + "Z";
const pct = (x: number) => Math.round(x * 100);
const round1 = (x: number) => Math.round(x * 10) / 10;

/** A site by its id or name, or any point given as "lat,lon". */
function findSite(key: string): SiteSeed | null {
  const k = key.trim().toLowerCase();
  const known = SITE_SEEDS.find((s) => s.id.toLowerCase() === k) ?? SITE_SEEDS.find((s) => s.name.toLowerCase().includes(k));
  if (known) return known;
  const [lat, lon] = k.split(",").map(Number);
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 360 ? { id: "custom", name: `${lat}, ${lon}`, lat, lon } : null;
}
/** A start date (YYYY-MM-DD or ISO), or now, kept inside the ephemeris table. */
const startOf = (v: unknown) => { const t = typeof v === "string" && v ? Date.parse(v.length <= 10 ? v + "T00:00:00Z" : v) : NaN; return clampTime(isNaN(t) ? Date.now() : t); };
const daysOf = (v: unknown) => Math.max(1, Math.min(365, Math.round(Number(v)) || 30));
const summary = (seed: SiteSeed, from: number, days: number) => {
  const k = outlook(seed, from, days, 24).stats;
  return {
    site: seed.name, id: seed.id, sunlightPercent: pct(k.sun), earthInViewPercent: pct(k.earth), powerAndRadioTogetherPercent: pct(k.both),
    longestDarkHours: k.maxDarkH, skyline: withTerrain(seed).model === "terrain" ? "real NASA LOLA terrain" : "smooth Moon, hills not included",
  };
};
const SITE_LIST = SITE_SEEDS.map((s) => `${s.id} = ${s.name}`).join("; ");

type Args = Record<string, unknown>;
interface LunaTool { name: string; description: string; parametersJsonSchema: object; run: (args: Args) => Record<string, unknown> }

/** What Luna can look up in the sky engine. */
const TOOLS: LunaTool[] = [
  {
    name: "sites_now",
    description: "Where the Sun and Earth are right now (or at a given moment) at each of the eight candidate landing sites near the Moon's south pole, and whether a lander there has sunlight for power and Earth in view for radio. Use it for any question about the present moment.",
    parametersJsonSchema: { type: "object", properties: { time: { type: "string", description: "Optional ISO date or date-time in UTC. Leave out for right now." } } },
    run: ({ time }) => {
      const t = startOf(time);
      return { utc: iso(t), sites: SITE_SEEDS.map((s) => { const v = skyNow(s, t); return { site: v.name, id: v.id, hasSunlightForPower: v.power, earthInViewForRadio: v.link, sunDegreesAboveHorizon: round1(v.sunEl), earthDegreesAboveHorizon: round1(v.earthEl) }; }) };
    },
  },
  {
    name: "compare_sites",
    description: "Compare all eight candidate landing sites over a period: share of time with sunlight, with Earth in view, with both together, and the longest stretch of darkness. Use it for 'where is the best place to land' questions. The best site has the highest powerAndRadioTogetherPercent and a short longestDarkHours.",
    parametersJsonSchema: { type: "object", properties: { start: { type: "string", description: "First day, YYYY-MM-DD (UTC). Leave out for today." }, days: { type: "integer", description: "Length of the period in days, 1 to 365." } }, required: ["days"] },
    run: ({ start, days }) => {
      const from = startOf(start), n = daysOf(days);
      return { from: iso(from), days: n, sites: SITE_SEEDS.map((s) => summary(s, from, n)).sort((a, b) => b.powerAndRadioTogetherPercent - a.powerAndRadioTogetherPercent) };
    },
  },
  {
    name: "site_outlook",
    description: `One landing site over a period: the same shares as compare_sites, plus the coming sunrises, sunsets, Earth-rises and Earth-sets with their UTC times. Sites: ${SITE_LIST}. Any other place on the Moon can be given as "latitude,longitude" in degrees (south and west are negative).`,
    parametersJsonSchema: { type: "object", properties: { site: { type: "string", description: 'A site id or name from the list, or "lat,lon".' }, start: { type: "string", description: "First day, YYYY-MM-DD (UTC). Leave out for today." }, days: { type: "integer", description: "Length of the period in days, 1 to 365." } }, required: ["site", "days"] },
    run: ({ site, start, days }) => {
      const seed = findSite(String(site ?? ""));
      if (!seed) return { error: `Unknown site "${site}". Known sites: ${SITE_LIST}. Or give "lat,lon".` };
      const from = startOf(start), n = daysOf(days);
      return { from: iso(from), days: n, ...summary(seed, from, n), events: outlook(seed, from, n, 24).events.slice(0, 12).map((e) => ({ what: e.kind, utc: iso(e.t) })) };
    },
  },
  {
    name: "real_missions",
    description: "The three CLPS landers that have reached the Moon (Odysseus, Blue Ghost, Athena): where and when each landed, what happened to it, and what the sky was doing at its landing site according to this site's engine. Use it for any question about a real mission.",
    parametersJsonSchema: { type: "object", properties: {} },
    run: () => ({
      missions: MISSIONS.map((m) => {
        const r = replay(m), text = (DICT.en as Dict).m[m.id];
        return {
          mission: m.name, lander: m.lander, company: m.org, place: m.place, latitude: m.lat, longitude: m.lon,
          landedUtc: iso(m.land), lastContactUtc: iso(m.end), outcome: text.tag, whatHappened: text.what,
          sunDegreesAboveHorizonAtLanding: round1(r.sunAtLanding), earthDegreesAboveHorizonAtLanding: round1(r.earthAtLanding),
          modelSunriseBeforeLandingUtc: r.sunrise && iso(r.sunrise), modelSunsetAfterLandingUtc: r.sunset && iso(r.sunset),
          sunFullyBehindEarthUtc: r.eclipse && r.eclipse.map(iso),
        };
      }),
    }),
  },
];

/** Run one of Luna's tools by name. Assumes the geometry table is loaded. */
export function runTool(name: string, args: Args = {}): Record<string, unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `There is no tool called "${name}".` };
  try { return tool.run(args); } catch { return { error: "The sky engine could not work that out." }; }
}

const system = (lang: Lang) => `You are Hyphen AI, the friendly robot guide on Hyphen (tagline: Mission Moonlight), a website made for the NASA Space Apps challenge. It shows when a lander near the Moon's south pole has sunlight for power and can see Earth to talk home. The people writing to you are mostly children and students of about 8 to 14, sometimes a teacher or a curious adult, and they are here to learn.

Where your facts come from matters on this site, because its promise is that the sky numbers are real. Anything about where the Sun or Earth is, when they rise or set, how much sunlight a place gets, which site is best, or what a real mission saw has to come from a tool result in this conversation: the tools run the site's own engine on NASA JPL's DE421 data (which covers ${new Date(T_MIN).getUTCFullYear()} to ${new Date(T_MAX).getUTCFullYear()}). Call a tool before answering such a question. If the tools cannot answer something, say so simply instead of estimating. General space knowledge, such as what a crater is or why the Moon has no air, you can explain from what you know. Today is ${new Date().toISOString().slice(0, 10)} (UTC).

How to answer so a child learns from it:
- Lead with the answer, in two to four short sentences and everyday words. A curious follow-up can get a little more.
- When a hard word is needed (horizon, crater rim, solar panel, lunar night), explain it in a few words the first time.
- A comparison to something a child knows often helps: a torch, a hill hiding the sunset, a phone with no signal.
- Give numbers a child can picture: round them, say "about 3 days" rather than "71.6 hours", and turn UTC times into plain dates.
- Finish with one short question or idea that invites them to keep exploring, for example trying a site in the Planner, playing Race the Shadow, or following a mission story on the Missions page.
- The page shows your words as plain text, so write plain sentences without Markdown, headings or bullet lists.
- Write in ${LANG_NAME[lang]}, unless the child writes to you in another language; then use theirs.

Keep to the Moon, space, landers and this website. If someone asks about something else, say kindly that you are a Moon guide and offer a Moon question they could ask instead. Never ask for a child's name, age, school or where they live, and if they share any of it, do not repeat or use it.`;

/** Answer the last question in `turns`. Throws the SDK's ApiError; the route turns it into a message. An empty answer means the model declined. */
export async function askLuna(turns: Turn[], lang: Lang): Promise<Reply> {
  await ensureGeometry();
  // The SDK's own retries (five, with growing waits) would keep a child waiting for minutes; the next model is quicker.
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: TIMEOUT_MS, retryOptions: { attempts: 1 } } });
  const contents: Content[] = turns.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
  const config = {
    systemInstruction: system(lang),
    tools: [{ functionDeclarations: TOOLS.map(({ name, description, parametersJsonSchema }) => ({ name, description, parametersJsonSchema })) }],
  };
  // Once a model has answered, the rest of the question stays with it.
  let checked = false, from = Date.now() < working.until ? working.index : 0;
  const generate = async () => {
    for (let k = from; ; k++) {
      try {
        const res = await ai.models.generateContent({ model: MODELS[k], contents, config });
        if (k !== from) working = { index: k, until: Date.now() + REMEMBER_MS };
        from = k;
        return res;
      } catch (error) {
        // A bad request or a bad key fails the same way on every model; anything else is worth another model.
        const final = error instanceof ApiError && [400, 401, 403, 404].includes(error.status);
        if (final || k === MODELS.length - 1) throw error;
      }
    }
  };
  for (let round = 0; ; round++) {
    const res = await generate();
    const calls = res.functionCalls ?? [], said = res.candidates?.[0]?.content;
    if (!calls.length || !said || round === MAX_LOOKUPS) return { answer: (res.text ?? "").trim(), checked };
    checked = true;
    // The model's own turn goes back unchanged, then one result for each lookup it asked for.
    contents.push(said, { role: "user", parts: calls.map((c) => ({ functionResponse: { id: c.id, name: c.name, response: runTool(c.name ?? "", c.args) } })) });
  }
}
