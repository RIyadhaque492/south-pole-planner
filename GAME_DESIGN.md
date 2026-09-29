# Race the Shadow: Game Design

A lunar survival game for students and the public, built on the same NASA JPL DE421 engine as the
South Pole Window Planner. It covers the "educators and the public" audience named in the CLPS
Lunar Mission Browser challenge. File: `web/game.template.html` (built into `web/game.html`).

## Core idea

You run a small robotic lander near the Moon's south pole. Every sunrise, sunset, Earth-rise and
Earth-set comes from the real ephemeris for the dates being played. The game teaches the two
constraints the challenge is about, **power** and **direct-to-Earth communication**, by making the
player live with them.

## Core loop (1 game step = 1 hour)

1. Watch the sky view and the 5-day forecast.
2. Decide what to run: **Science**, **Radio**, **Hibernate**.
3. Time runs forward. The battery charges from the Sun and drains from loads.
4. Alerts pause the game before important events (sunset, Earth-set, low battery, memory full).
5. The mission ends at its last hour, or when the battery reaches zero (the lander freezes).
6. Debrief: stars, stats, battery graph, and a "Why did that happen?" card that links to the Planner.

## Rules and numbers (all in `CFG` at the top of the script)

| Item | Value | Notes |
|---|---|---|
| Solar panel | 300 W | × visible fraction of the Sun's disk × panel direction factor |
| Battery | 4,800 Wh | |
| Awake base load | 40 W | always, unless hibernating |
| Heaters when dark (awake) | +30 W | when less than half the Sun is visible |
| Hibernate | 13 W total | science and radio off |
| Science | +60 W, +1 MB/h | memory holds 48 MB; extra data is lost |
| Radio | +25 W, 4 MB/h | only when Earth is above the horizon and data is waiting |
| Score | MB delivered to Earth | |

The numbers are game-scale, chosen to make the real sky data matter. The researchers should
compare them with published figures for small CLPS-class landers and adjust `CFG` if needed
(then rerun the balance tests below).

## Scenarios

| Scenario | Site | Dates | Start battery | Goal | Stars |
|---|---|---|---|---|---|
| Vikram's Night (hard) | Chandrayaan-3 landing site, 69.37°S | lands 6 h after sunrise on the first sunrise after 2026-10-10; ends 36 h after the next sunrise | 55% | survive the night | 1★ survive · 2★ 330 MB · 3★ 390 MB |
| Tipped Over (medium) | Malapert Mountain M1 | lands after the first sunrise with Earth up after 2026-11-01; 10 days | 45% | 120 MB | 120 / 140 / 160 MB |
| Peak of Light (open) | player's choice of 7 south-pole sites | player's choice of date, Oct 2026 – Dec 2027; 14 days | 80% | score | 150 / 240 / 300 MB |

In Tipped Over the lander lies crooked, so its single panel faces a fixed direction. It starts
pointing 120° away from the Sun; the Sun circles the horizon (~12°/day) and swings toward it.

## Balance test results (simulated players)

Vikram's Night (night lasts 339 h):
- Everything always on: freezes at hour 395 (about 2 days after sunset).
- Hibernates only once the battery drops below 50%: freezes.
- Hibernates at sunset, wakes at sunrise: survives with 9% battery left, 399 MB (3★).
- Lesson the player learns: hibernate *right at* sunset. There are about 6 hours of slack.

Tipped Over:
- Everything always on: freezes after 18 h.
- Science only while the battery is above 35%: survives, ~140 MB (2★).
- Best strategy found by search (sleep until the panel gets light, then run science): 164 MB (3★).

Peak of Light (smart player, 14 days): from 0 MB (landing at the start of polar winter) up to
336 MB (Sun and Earth up the whole mission). Good site/date choices give 280–336 MB, so 3★
requires actually using the forecast or the Planner.

## Ideas for the designers (next steps)

- **Art pass:** lander sprite, sunrise glow, frost effect, Earth phase (Earth is "full" when the
  Moon is in lunar night).
- **Sound:** a low hum while awake, quiet ticks while hibernating, a radio chirp when data lands.
- **Temperature:** add a thermal meter so hibernating too long in extreme cold carries a risk.
- **More scenarios:** "Relay needed" (Earth never rises, e.g. a far-side-facing crater),
  "Artemis base camp" (keep a habitat powered through a south-pole winter).
- **Real terrain:** load LOLA horizon masks (`terrain/horizon_mask.py`) so crater rims cast real
  shadows in the game, just like the Planner.
- **Classroom mode:** a teacher picks a scenario and the class compares strategies on the debrief graph.

## How to rerun the balance tests

The page exposes `window.RTS = { CFG, SCENARIOS, simulate, series }`. In the browser console:

```js
const scn = RTS.SCENARIOS.vikram.build();
RTS.simulate(scn, (s, o) => { s.hib = o.sFrac[s.i] < .5; s.sci = true; s.rad = true; });
// -> { s: { sent, dead, minBat, ... }, stars }
```

A policy function sets `s.sci`, `s.rad` and `s.hib` before each hour, using the forecast arrays in `o`
(`sFrac` = visible fraction of the Sun, `eEl` = Earth elevation in degrees).
