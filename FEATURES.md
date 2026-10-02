# South Pole Window: features

Everything the site does, where it lives in the code, and what is left for the team to do.
Built for NASA Space Apps 2026, **CLPS Lunar Mission Browser** challenge.

Run it: `cd site && npm run dev`, then open http://localhost:3000.
Check it: `cd site && npm test` (11 tests), `npx tsc --noEmit`, `npx eslint src`.

## Pages

| Page | Address | Who it is for |
|---|---|---|
| Overview | `/` | Everyone: what the problem is, and what the sites look like right now |
| Planner | `/planner` | Mission planners: pick a site and dates, get a verdict |
| Missions | `/missions` | Judges and the curious: real CLPS landings replayed on the same engine |
| Race the Shadow | `/game` | Students and the public: learn the two constraints by playing |
| Site page | `/sites/A` (A, B, C, D, M1, M2, LC, C3) | One site in detail: next 30 days and next 12 months |
| JSON API | `/api/now`, `/api/sky?site=B&days=30` | Developers |

## Overview page

- **Live polar map** in the hero: the Sun and Earth directions for the time shown; drag to move through time.
- **Right now on the Moon** (site explorer, `components/landing/LiveBoard.tsx`)
  - One headline number: how many of the 8 sites can run a lander.
  - Eight clickable site tiles with a Sun lamp, an Earth lamp and a status.
  - A drawn sky for the chosen site: the Sun and Earth where they really are, with the lander underneath.
    Sunlight flows into its panel when it has power; data flies to Earth when it has a signal.
    A hill is drawn when terrain hides the Sun; a dashed outline shows anything below the horizon.
  - Plain sentences: "Sunlight ends in about 3.4 days", "Earth rises in about 6.8 days".
  - A 30-day time bar: drag it or press Play and the sky, the tiles and the headline all change together.
- **Why it's hard**: a scene that switches between "on a ridge" and "in a crater" over one Moon day.
- **The real south pole from orbit**: NASA LROC photo mosaic with pins.
- **How to plan a landing** in three steps, and a link into the game.

## Planner

- **Polar map and site list**: 8 candidate sites, or drop a pin anywhere, or type coordinates.
- **Dates**: start date plus 2 weeks, 1 Moon day, 2 months, 6 months or 1 year. Covers 2024 to 2032.
- **Verdict**: Good / Workable / Risky, with sunlight %, longest night, Earth in view % and both together %.
- **Look around the site**: a 360° skyline with the Sun and Earth moving across it; Play, speed and scrub.
- **Timeline**: Sun and Earth height over the whole period, with power / signal / both bars.
- **Compare all sites**: one sortable table for the same dates.
- **Best times to land**: every 6 hours is tested as a touchdown; the top windows are ranked.
- **Real terrain**: sites with NASA LOLA skylines use them; a custom horizon CSV can be loaded.
- **Opens on the best site** for the default dates instead of a fixed one.
- **Share a plan**: "Copy link to this plan" puts the site, dates, mission length and antenna mask in the address.
  Any point works: `/planner?site=-80.13,1.44&name=IM-1&start=2024-02-22&days=14`.
- **Landing brief**: "Print or save as PDF" switches the charts to the light theme and prints a clean one-pager
  (verdict, sky view, timeline, comparison, best times) without the controls.

## Missions (real CLPS landings)

`lib/missions.ts`, `components/missions/Missions.tsx`

Three landers, each replayed for its real landing place and time:

| Mission | Landed (UTC) | Where | What happened |
|---|---|---|---|
| IM-1 Odysseus (Intuitive Machines) | 2024-02-22 23:23 | Malapert A, 80.13°S 1.44°E | Landed leaning about 30°, worked about a week |
| Blue Ghost Mission 1 (Firefly) | 2025-03-02 08:34 | Mare Crisium, 18.56°N 61.81°E | Full success, a whole lunar day |
| IM-2 Athena (Intuitive Machines) | 2025-03-06 17:28 | Mons Mouton, 84.79°S 29.20°E | On its side in a crater, ended next day |

- A sky view with a time bar from two days before landing to after the next sunset, with "Landed" and "Last contact" flags.
- **What the model computes**: Sun and Earth height at touchdown, sunrise before, sunset after, and any eclipse.
- **What the replay shows**: one paragraph tying the numbers to the outcome.
- A link that opens the same place and date in the Planner.

What the model gets right, checked by tests in `lib/engine.test.ts`:

- Blue Ghost touched down about 7 hours after the model's sunrise at the site.
- The model's sunset is 2025-03-16 20:14 UTC; Blue Ghost's last contact came about 3 hours later.
- The model shows the Sun fully behind Earth on 2025-03-14 from 06:18 to 08:34 UTC, the eclipse Blue Ghost photographed.
- IM-2 landed with the Sun only 2.5° above the horizon, which is why a crater wall was enough to end the mission.

Limits to say out loud: these three sites are computed on a smooth Moon (no local terrain), and the landing
facts come from NASA and mission-team public reports and should be re-checked against sources before submission.

## Race the Shadow (game)

- **Three missions**: Vikram's Night (hard), Tipped Over (medium), Peak of Light (pick your own site and date).
- **Today's challenge**: one mission per UTC day, the same for everyone. Stars are set from a sensible
  player's score for that day. "Share my score" copies a line of text with the date, score and stars.
- **Controls**: Science, Radio, Hibernate, four speeds, pause on alerts, space bar to pause.
- **Animated scene**: the lander flies in and lands, the Sun and Earth glide, Earth shows its phase,
  sunlight streams into the panel, a scanner sweeps the ground, data packets fly to Earth,
  "z"s rise while hibernating, ice forms if it freezes.
- **Lander character**: blinks, looks at the Sun or Earth, worries on low battery, sleeps, smiles.
- **Hint strip**: says what to do next in plain words, and explains why the game paused.
- **Sound** (`lib/sound.ts`): touchdown, sunrise, sunset, Earth rise/set, alerts, data chirps, win and lose,
  plus a quiet hum while awake. Made in the browser, no audio files. A "Sound on/off" button remembers the choice.
- **Debrief**: stars, stats, battery graph and a "Why did that happen?" card that links into the Planner.
- **Why is the south pole tricky?**: an illustration with five numbered hotspots.
- Still frames instead of animation for visitors who ask for reduced motion.

## Across the site

- **Three languages**: English, Bengali and Spanish (`lib/dict.ts`, `lib/dict-es.ts`). A missing Spanish
  string falls back to English.
- **Light and dark themes**, remembered per browser.
- **Works offline** (`public/sw.js`, `app/manifest.ts`): after one visit with a connection, the Planner,
  the game and the Missions page open and run with no network, and the site can be installed like an app.
  Only switched on in a production build (`npm run build && npm start`), not in `npm run dev`.
- **Loader**: the lander in a spinning ring while the sky data downloads.
- **Phones**: every page fits a 390 px screen without sideways scrolling.

## Data and accuracy

- Sun and Earth positions: NASA JPL DE421 ephemeris with lunar librations, in the Moon ME frame,
  one row every 3 hours from 2024-01-01 to 2032-12-31 (`site/public/geometry.bin`, 631 kB).
  Rebuild with `cd ephemeris && python build_geometry.py` (needs `pip install jplephem de421`).
- Terrain: skylines from NASA LOLA elevation data for the sites inside the polar map (`terrain/lola_horizons.py`).
- Power = at least half the Sun's disc above the skyline. Signal = Earth's centre above the skyline.
- AI-generated pictures (the three mission cards, the hotspot illustration, the loader lander) are labelled
  as illustrations on the game page. Everything computed comes from the JPL data.

## To do tomorrow

Things that need a person, in rough order of importance:

1. **Listen to the game sounds.** They were checked for errors but nobody has heard them yet. Adjust volumes in
   `lib/sound.ts` if anything is harsh.
2. **Try "Print or save as PDF" in a real browser** and look at the PDF. The print layout was checked on screen only.
3. **Re-check the mission facts against sources** (landing times, coordinates, "first" claims) and add source links.
4. **Replace the hotspot illustration** if you regenerate it without the baked-in English text and the made-up
   "Landing Site Explorer" panel: save over `site/public/img/south-pole-full.jpg` (1672×941) and adjust the
   dot positions in `components/game/PoleExplainer.tsx` if things moved.
5. **Read the Bengali and Spanish text** as a native speaker would; both were written without review.
6. **Check this year's Space Apps rules on AI-generated content** (disclosure and marking of images).
7. **Decide on the intro video** (script and prompts were given in chat; nothing is built for it yet).
8. **Commit.** Nothing from this work is committed. The five source PNGs in the repo root are about 2 MB each;
   the site uses the copies in `site/public/img/`, so leave the originals out of the commit or delete them.
9. **Deploy a production build** and test offline mode and "install" on a real phone.

Not built, still possible: more missions as CLPS flies them, terrain for the three mission sites,
a class leaderboard for the daily challenge.
