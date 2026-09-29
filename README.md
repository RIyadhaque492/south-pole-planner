# South Pole Window Planner

A tool for the NASA Space Apps 2026 **CLPS Lunar Mission Browser** challenge. Pick landing sites
near the Moon's south pole and a date range, and see at a glance:

- where the **Sun** and **Earth** sit relative to the local skyline, hour by hour
- when a lander has **power** (Sun above the skyline) and a **direct-to-Earth link** (Earth above it)
- **side-by-side site comparison**: % sunlit, longest night, % Earth in view, % with both
- **best touchdown times** for a mission of N days, ranked by time with power + link together

It opens in any browser as a single file (`web/index.html`). No server, no install.

It comes with **Race the Shadow** (`web/game.html`), a survival game for students and the public that runs on the same
real sky data: keep a lander alive through the lunar night and send science home while Earth is up. See `GAME_DESIGN.md`.

## Put it online (GitHub Pages)

Copy both pages to the top of the repo, commit and push, then turn on **Settings → Pages → main / (root)**:

```bash
cp web/index.html index.html
cp web/game.html game.html
```

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
massifs decide everything. With a smooth Moon, Shackleton rim sites come out ~50% sunlit over a year;
terrain-based studies give 81–86%. The app therefore supports three horizon models per site:

1. **Smooth Moon**: a 1737.4 km sphere (default, exact geometry, no terrain)
2. **Raised site**: horizon dip for a site standing X m above flat surroundings (quick what-if)
3. **LOLA terrain mask**: the real skyline in every direction, from `terrain/horizon_mask.py`

### Make a terrain mask (do this for your final demo)

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
terrain/horizon_mask.py       LOLA DEM -> terrain horizon CSV for any site
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

- Site coordinates come from published illumination studies and mission reports; they are approximate.
- Terrain masks are only as good as the DEM and its coverage (`horizon_mask.py` warns if rays leave the map).
- Out of scope: relay satellites, Deep Space Network scheduling, thermal limits, slope/hazard safety.

## Ideas for the hackathon weekend

- Precompute LOLA terrain masks for all built-in sites and ship them with the app (biggest win).
- Load the official Artemis III candidate regions and CLPS target sites from the challenge data.
- Add a 3D view (CesiumJS / Three.js) with LOLA terrain and the Sun direction.
- Add an "educator mode" that explains why the pole has months-long nights and days.
- Check the Space Apps rules on what may be prepared before the event, and credit this starting point.
