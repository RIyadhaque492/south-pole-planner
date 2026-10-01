# South Pole Window Planner

A tool for the NASA Space Apps 2026 **CLPS Lunar Mission Browser** challenge. Pick landing sites
near the Moon's south pole and a date range, and see at a glance:

- where the **Sun** and **Earth** sit relative to the local skyline, hour by hour
- when a lander has **power** (Sun above the skyline) and a **direct-to-Earth link** (Earth above it)
- **side-by-side site comparison**: % sunlit, longest night, % Earth in view, % with both
- **best touchdown times** for a mission of N days, ranked by time with power + link together

The main app is the **Next.js site in `site/`**: a landing page with the live state of every site, the Planner,
a page per site, a JSON API, and **Race the Shadow**, a survival game for students and the public that runs on the
same real sky data (see `GAME_DESIGN.md`). Every polar site uses its **real terrain skyline from NASA LOLA** by default.

```bash
cd site
npm install
npm run dev     # http://localhost:3000
npm test        # engine, terrain and game-balance checks
```

It needs a Node host to go online (for example Vercel). See `site/README.md` for routes and layout.

The original single-file version (`web/`, and the copies `index.html` / `game.html` at the top of the repo) still
works in any browser with no install, but it uses a smooth Moon unless you load terrain by hand.

## Why it's accurate

- Sun and Earth positions come from **JPL DE421**, including its integrated **lunar librations**,
  rotated into the Moon's **Mean-Earth/Polar-Axis frame** (the frame NASA's LOLA maps use).
  Light-time is applied; Earth parallax from the site is included.
- `ephemeris/validate.py` checks the result against the independent **IAU lunar rotation model**:
  agreement within 15 arcseconds. Physical ranges also check out (sub-solar latitude ±1.59°,
  latitude libration ±6.85°, Earth distance 356,700–406,600 km).
- The browser's numbers match a direct DE421 calculation to within 0.01°.

## The part that matters most: terrain

At the south pole the Sun never rises more than ~1.6° above a flat horizon, so crater rims and
massifs decide everything. With a smooth Moon, every site comes out ~50% sunlit over a year;
terrain-based studies give 74–86% for the best rim and ridge sites, and 0% for permanently shadowed craters.

The Next.js app ships **real skylines for all seven polar sites**, computed by `terrain/lola_horizons.py` from the
NASA LOLA polar elevation grids (40 m/pixel near the pole, 120 m/pixel out to 75°S, rays out to 150 km along the
curved surface). Chandrayaan-3 (69°S) lies outside the polar grids and stays smooth-Moon; the app labels it.

Sunlight over 2027–2030 (share of time with at least half the Sun's disc above the skyline):

| Site | Published (long-term) | Smooth Moon | Real LOLA terrain | Moved onto the LOLA peak |
|---|---|---|---|---|
| Shackleton rim A | 81% | ~50% | 74% | 729 m |
| Shackleton ridge B | 82% | ~50% | 61% | 729 m |
| de Gerlache rim C | 85% | ~50% | 75% | 177 m |
| Shackleton rim D | 86% | ~50% | 80% | 707 m |
| Malapert Mountain M1 | 74% | ~50% | 76% | 952 m |
| Malapert Mountain M2 | 74% | ~50% | 68% | 791 m |
| Cabeus crater (LCROSS impact) | permanently shadowed | ~50% | 0% | not moved |

The published coordinates of the peak sites come from other elevation models; in LOLA the listed points fall on
shadowed flanks (16–55% sunlit), and the matching peak sits a few hundred metres to ~1 km away. The script moves
each peak site to its best-lit LOLA point within 1 km and records both positions; the app shows the distance.
Ridge B stays the furthest from its published figure.

In the Planner you can still switch any site to a smooth Moon or a simple "site on a hill" model to see how much
the terrain matters.

### Regenerate the shipped skylines

```bash
# ~230 MB from the LOLA science team's data node (keep them outside the repo)
curl -O https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_85S_40M.IMG  -O https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_85S_40M.LBL
curl -O https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_75S_120M.IMG -O https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_75S_120M.LBL
python terrain/lola_horizons.py LDEM_85S_40M.IMG LDEM_75S_120M.IMG --geometry ephemeris/geometry.json     --out site/public/terrain/horizons.json
```

Only numpy is needed. The script reads the PDS files as published and was checked against known landmarks
(Shackleton's floor ~4.4 km below its rim, Malapert Mountain ~+4.8 km, the Cabeus floor deep).

### Terrain mask for any other site (GeoTIFF route)

1. Download a south-pole DEM GeoTIFF from NASA PGDA, e.g. the LOLA 5–20 m/pixel south-pole
   products: https://pgda.gsfc.nasa.gov/products/90 (or https://pgda.gsfc.nasa.gov/products/78)
2. Run, for each site:

```bash
pip install numpy scipy rasterio pyproj
python terrain/horizon_mask.py LDEM_83S_10MPP_ADJ.TIF --lat -89.44 --lon -141.8 --name "Shackleton ridge B"
```

3. In the app, select the site, then **Load terrain horizon CSV**. The site gets a green *terrain* tag.

Check the file's height units (usually metres relative to 1737.4 km; use `--height-scale` /
`--height-offset` if not). `python terrain/horizon_mask.py --demo` runs the pipeline on a
**synthetic** DEM so you can test your setup before downloading real data.

## Rebuilding the ephemeris table (optional)

`web/index.html` already contains the table for 2026-01-01 → 2032-12-31 at 3-hour steps.
To rebuild or extend it (DE421 covers 1900–2050):

```bash
pip install numpy jplephem
# get the DE421 data package (pip can't build it on new Python, so unpack it):
pip download de421 --no-deps && tar xzf de421-2008.1.tar.gz && mv de421-2008.1/de421 ephemeris/
cd ephemeris && python validate.py && python build_geometry.py --start 2026-01-01 --end 2032-12-31
cd ../web && python build.py
```

## Files

```
ephemeris/build_geometry.py   DE421 -> Sun/Earth vectors in the Moon ME frame -> geometry.json
ephemeris/validate.py         checks against the IAU model and physical ranges
ephemeris/geometry.json       prebuilt table (2026-2032)
terrain/lola_horizons.py      LOLA PDS polar DEMs -> skylines for the built-in sites (what the app ships)
terrain/horizon_mask.py       LOLA GeoTIFF DEM -> terrain horizon CSV for any site
site/                         the Next.js app (see site/README.md)
web/app.template.html         the app (HTML/CSS/JS, no framework)
web/game.template.html        Race the Shadow game (HTML/CSS/JS)
web/build.py                  bundles geometry.json into web/index.html and web/game.html
web/index.html                the finished Planner
web/game.html                 the finished game
GAME_DESIGN.md                game rules, numbers, scenarios and balance results
```

## Definitions used

- **Power**: at least half of the solar disk (radius 0.267°) above the skyline in the Sun's direction.
- **Earth link**: Earth's centre above the skyline + the minimum elevation you set (antenna mask).
- **Landing window score**: share of the mission with power and link at the same time; ties go to
  the shorter worst outage; touchdown must have both.

## Limits (say these out loud to judges, it builds trust)

- Site coordinates come from published illumination studies and mission reports. Those studies used other
  elevation models, so in LOLA the same peaks of light sit a few hundred metres to ~1 km away; the app places
  each peak site on its LOLA peak within 1 km and shows how far it moved.
- Terrain skylines are only as good as the DEM: 40–120 m/pixel smooths knife-edge crests, so sunlight at the
  best rim sites comes out a few points below the published long-term figures.
- Out of scope: relay satellites, Deep Space Network scheduling, thermal limits, slope/hazard safety.

## Ideas for the hackathon weekend

- Load the official Artemis III candidate regions and CLPS target sites from the challenge data.
- Add a 3D view (CesiumJS / Three.js) with LOLA terrain and the Sun direction.
- Add an "educator mode" that explains why the pole has months-long nights and days.
- Check the Space Apps rules on what may be prepared before the event, and credit this starting point.
