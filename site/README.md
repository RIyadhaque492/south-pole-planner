# South Pole Window: Next.js app

The Planner, per-site pages, a JSON API and the **Race the Shadow** game in one server-rendered Next.js app
(App Router, TypeScript), for the NASA Space Apps 2026 *CLPS Lunar Mission Browser* challenge.
See the repository README for the science.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production server
```

Deploy anywhere that runs Node (Vercel, Render, a VPS). `public/geometry.bin` must ship with the app;
the server reads it from disk.

## Routes

| Route | Rendering | What |
|---|---|---|
| `/` | per request | Animated south-pole terrain lit by the real Sun, live status of every site, overview |
| `/planner` | client | Full planner: polar site map, sky panorama, timeline, comparison, landing windows |
| `/sites/[id]` | per request | One site: Sun/Earth right now, next 30 days, coming events, 12-month outlook |
| `/game` | client | Race the Shadow |
| `/api/now` | per request | Sun and Earth at every site now (`?t=ISO` for another moment) |
| `/api/sky` | per request | `?site=B&start=2026-12-01&days=30`: stats, rise/set events, elevation trace. `site` can be `lat,lon` |
| `/ask` | client | Ask Luna: a child-friendly AI guide that answers questions about the south pole |
| `/api/ask` | per request | `POST`: Luna's answer. Gemini calls the sky engine through tools, so its numbers are the Planner's |

Ask Luna needs a Google Gemini API key on the server. A free one from https://aistudio.google.com/apikey works
(no card needed; the free tier has per-minute and per-day limits, and Google may use free-tier prompts to improve
its products). Put it in `site/.env.local` (not committed) and restart:

```bash
GEMINI_API_KEY=...
# GEMINI_MODEL=gemini-3.8-flash   # optional: another model with a free tier
```

Without a key the page still loads and tells the visitor that Luna is not switched on. The rest of the app does not use it.

## Layout

| Path | What |
|---|---|
| `src/lib/ephemeris.ts` | Sun/Earth geometry engine (DE421 table lookup, horizon models, stats) |
| `src/lib/sky.ts` | "Right now" and outlook queries shared by pages and API routes |
| `src/lib/server/geometry.ts` | Loads the ephemeris table from disk on the server |
| `src/lib/server/luna.ts` | Ask Luna: the prompt, and the tools that let Gemini query the engine |
| `src/lib/game.ts` | Game rules and balance numbers (`CFG`), scenarios, simulation |
| `src/lib/dict.ts` | All UI text, English and Bengali |
| `src/components/landing/` | Terrain hero (procedural relief, real lighting, sweep-line shadows), live board |
| `src/components/planner/`, `game/`, `site/` | The Planner, the game, site pages |

The landing terrain is illustrative (shaped after Shackleton, the connecting ridge and de Gerlache);
the Sun direction and height over it are the real ones for the displayed moment.

Regenerate `public/geometry.bin` after rebuilding `ephemeris/geometry.json`:

```bash
python -c "import json,base64;g=json.load(open('../ephemeris/geometry.json'));open('public/geometry.bin','wb').write(base64.b64decode(g['data']))"
```

If the table's start time, step or row count change, update `META` in `src/lib/ephemeris.ts`.
