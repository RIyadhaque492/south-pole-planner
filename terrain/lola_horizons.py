"""
Real terrain skylines for the candidate landing sites, straight from a NASA LOLA polar DEM.

Reads the PDS3 product as published (a raw .IMG grid plus its .LBL label), so it needs only numpy:
no GDAL, rasterio or pyproj. For every site it casts a ray every 1 degree of azimuth out to 150 km,
following the curved lunar surface, and keeps the highest elevation angle it meets: the skyline.

Get the DEMs from the LOLA science team's data node (each .IMG with the .LBL next to it):
  https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_85S_40M.IMG   (115 MB, 40 m/pixel, 85-90 S)
  https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_75S_120M.IMG  (116 MB, 120 m/pixel, 75-90 S)

Peaks of light: the published coordinates of the rim and ridge sites are illumination maxima found on other
elevation models (Kaguya and earlier LOLA releases). In this LOLA grid the same peaks sit a few hundred metres
to ~1 km away, and the listed points themselves fall on shadowed flanks. With --geometry, each site marked as a
peak is moved to the best-lit point within --snap-km (sunlight scored over 2027-2030 with the app's own JPL
table). Both the published and the adjusted coordinates are written out. Other sites (e.g. the LCROSS impact
point) are never moved.

Usage (what the web app ships):
  python lola_horizons.py LDEM_85S_40M.IMG LDEM_75S_120M.IMG --geometry ../ephemeris/geometry.json \
      --out ../site/public/terrain/horizons.json

Output: a JSON bundle the web app loads ({site id: 360 skyline angles in degrees}) and, optionally,
one CSV per site in the same format as horizon_mask.py (azimuth_deg,horizon_deg).
"""
import argparse
import json
import math
import re
from pathlib import Path

import numpy as np

R_MOON = 1737400.0

# Same list as site/src/lib/sites.ts. Sites outside the DEM are skipped and stay smooth-Moon in the app.
# The last field marks published peaks of light, which may be moved to the matching LOLA peak (see above).
SITES = [
    ("A", "Shackleton rim A", -89.68, -166.0, True),
    ("B", "Shackleton ridge B", -89.44, -141.8, True),
    ("C", "de Gerlache rim C", -88.71, -68.7, True),
    ("D", "Shackleton rim D", -88.79, 124.5, True),
    ("M1", "Malapert Mountain M1", -86.04, 2.7, True),
    ("M2", "Malapert Mountain M2", -86.00, -2.9, True),
    ("LC", "Cabeus crater (LCROSS)", -84.675, -48.725, False),
    ("C3", "Chandrayaan-3 landing site", -69.373, 32.319, False),
]


def read_label(path):
    txt = Path(path).read_text(errors="replace")
    num = lambda key: float(re.search(rf"^\s*{key}\s*=\s*([-\d.]+)", txt, re.M).group(1))
    return {
        "lines": int(num("LINES")), "samples": int(num("LINE_SAMPLES")),
        "scaling": num("SCALING_FACTOR"), "offset": num("OFFSET"),
        "map_scale": num("MAP_SCALE"), "line0": num("LINE_PROJECTION_OFFSET"), "sample0": num("SAMPLE_PROJECTION_OFFSET"),
        "max_lat": num("MAXIMUM_LATITUDE"), "center_lat": num("CENTER_LATITUDE"), "center_lon": num("CENTER_LONGITUDE"),
    }


class PolarDEM:
    """A PDS polar-stereographic LOLA grid. Heights in metres above the 1737.4 km sphere."""

    def __init__(self, img_path):
        img = Path(img_path)
        lbl = read_label(img.with_suffix(".LBL"))
        if lbl["center_lat"] != -90:
            raise SystemExit("expected a south-polar product (CENTER_LATITUDE = -90)")
        raw = np.fromfile(img, dtype="<i2")
        if raw.size != lbl["lines"] * lbl["samples"]:
            raise SystemExit(f"{img.name}: {raw.size} samples, label says {lbl['lines']}x{lbl['samples']}")
        self.z = raw.reshape(lbl["lines"], lbl["samples"]).astype("f4") * lbl["scaling"]
        self.lbl, self.name = lbl, img.name

    def pixel(self, lat_deg, lon_deg):
        """(line, sample) as floats, 0-based. PDS south-polar stereographic (DSMAP_POLAR):
        x = 2R tan(pi/4 + lat/2) sin(lon - lon0),  y = 2R tan(pi/4 + lat/2) cos(lon - lon0),
        sample = SAMPLE_OFFSET + x / scale,  line = LINE_OFFSET - y / scale.
        Orientation checked against landmarks on LDEM_75S_120M: Shackleton's floor comes out ~4.4 km below
        its rim (published ~4.2 km), Malapert Mountain ~+4.8 km, the Cabeus, Haworth and Faustini floors deep.
        The other sign of either axis puts Shackleton's centre above its own rim."""
        lat, lon = np.radians(lat_deg), np.radians(np.asarray(lon_deg) - self.lbl["center_lon"])
        rho = 2 * R_MOON * np.tan(np.pi / 4 + lat / 2)
        x, y = rho * np.sin(lon), rho * np.cos(lon)
        return self.lbl["line0"] - y / self.lbl["map_scale"], self.lbl["sample0"] + x / self.lbl["map_scale"]

    def sample(self, lat_deg, lon_deg):
        """Bilinear heights; NaN outside the grid."""
        line, samp = self.pixel(lat_deg, lon_deg)
        L, S = self.z.shape
        i, j = np.floor(line).astype(int), np.floor(samp).astype(int)
        ok = (i >= 0) & (j >= 0) & (i < L - 1) & (j < S - 1)
        i, j = np.clip(i, 0, L - 2), np.clip(j, 0, S - 2)
        u, v = line - i, samp - j
        z = self.z
        h = (z[i, j] * (1 - u) * (1 - v) + z[i + 1, j] * u * (1 - v) + z[i, j + 1] * (1 - u) * v + z[i + 1, j + 1] * u * v)
        return np.where(ok, h, np.nan)


class DEMStack:
    """Several polar DEMs used together: each point is sampled from the finest grid that covers it."""

    def __init__(self, paths):
        self.dems = sorted((PolarDEM(p) for p in paths), key=lambda d: d.lbl["map_scale"])
        self.lbl = self.dems[0].lbl  # finest grid sets the ray step
        self.name = " + ".join(d.name for d in self.dems)
        self.max_lat = max(d.lbl["max_lat"] for d in self.dems)

    def sample(self, lat_deg, lon_deg):
        h = self.dems[0].sample(lat_deg, lon_deg)
        for d in self.dems[1:]:
            gap = ~np.isfinite(h)
            if not gap.any():
                break
            h = np.where(gap, d.sample(lat_deg, lon_deg), h)
        return h


def destination(lat, lon, az, dist):
    """Great-circle destination points. lat/lon/az in radians, dist in metres (arrays ok)."""
    g = dist / R_MOON
    lat2 = np.arcsin(np.sin(lat) * np.cos(g) + np.cos(lat) * np.sin(g) * np.cos(az))
    lon2 = lon + np.arctan2(np.sin(az) * np.sin(g) * np.cos(lat), np.cos(g) - np.sin(lat) * np.sin(lat2))
    return lat2, lon2


def skyline(dem, lat, lon, max_km=150.0, obs_height=2.0):
    """Elevation angle of the skyline for azimuths 0..359 (clockwise from north), plus site height and coverage."""
    az = np.radians(np.arange(360.0))
    res = dem.lbl["map_scale"]
    # fine steps near the site, coarser far away (skyline angles change slowly with distance)
    d = np.concatenate([np.arange(res, 6000, res / 2), np.geomspace(6000, max_km * 1000, 1600)])
    h0 = float(dem.sample(np.array([lat]), np.array([lon]))[0])
    if not np.isfinite(h0):
        return None
    r0 = R_MOON + h0 + obs_height
    A, Dm = np.meshgrid(az, d, indexing="ij")
    la, lo = destination(math.radians(lat), math.radians(lon), A, Dm)
    h = dem.sample(np.degrees(la), np.degrees(lo))
    g = Dm / R_MOON
    r = R_MOON + h
    ang = np.degrees(np.arctan2(r * np.cos(g) - r0, r * np.sin(g)))
    coverage = float(np.isfinite(h).mean())
    ang[~np.isfinite(ang)] = -90.0
    return ang.max(axis=1), h0, coverage


def load_sun(geometry_json, start_ms=1798761600000, years=4):
    """Unit Sun vectors (Moon ME frame) every 3 h for `years` from 2027-01-01, from the app's JPL table."""
    import base64
    g = json.loads(Path(geometry_json).read_text())
    a = np.frombuffer(base64.b64decode(g["data"]), dtype="<f4").reshape(-1, 6).astype("f8")
    i0 = int((start_ms - g["start_utc_ms"]) / g["step_ms"])
    sun = a[i0:i0 + int(years * 365.25 * 24 * 3600e3 / g["step_ms"]), :3]
    return sun / np.linalg.norm(sun, axis=1)[:, None]


def sunlit_share(sun, hz, lat, lon):
    """Share of the time the Sun's centre (at least half its disc) is above the skyline."""
    la, lo = math.radians(lat), math.radians(lon)
    up = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    e = np.array([-math.sin(lo), math.cos(lo), 0.0])
    n = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    el = np.degrees(np.arcsin(sun @ up))
    az = (np.degrees(np.arctan2(sun @ e, sun @ n)) + 360) % 360
    k = np.floor(az).astype(int) % 360
    h = hz[k] + (hz[(k + 1) % 360] - hz[k]) * (az - np.floor(az))
    return float(np.mean(el >= h))


def best_lit_nearby(dem, sun, lat, lon, radius_m, spacing_m=125.0):
    """Search a grid around (lat, lon) for the point with the most sunlight, using a quick skyline."""
    def quick(la, lo):
        az = np.radians(np.arange(0, 360, 2.0))
        d = np.concatenate([np.arange(40, 4000, 40), np.geomspace(4000, 150000, 400)])
        h0 = float(dem.sample(np.array([la]), np.array([lo]))[0])
        if not np.isfinite(h0):
            return -1.0
        A, Dm = np.meshgrid(az, d, indexing="ij")
        la2, lo2 = destination(math.radians(la), math.radians(lo), A, Dm)
        h = dem.sample(np.degrees(la2), np.degrees(lo2)); g = Dm / R_MOON; r = R_MOON + h
        ang = np.degrees(np.arctan2(r * np.cos(g) - (R_MOON + h0 + 2), r * np.sin(g)))
        ang[~np.isfinite(ang)] = -90.0
        hz2 = ang.max(axis=1)
        return sunlit_share(sun, np.interp(np.arange(360), np.arange(0, 362, 2), np.append(hz2, hz2[0])), la, lo)

    best = (quick(lat, lon), lat, lon, 0.0)
    for dx in np.arange(-radius_m, radius_m + 1, spacing_m):
        for dy in np.arange(-radius_m, radius_m + 1, spacing_m):
            dist = math.hypot(dx, dy)
            if dist == 0 or dist > radius_m:
                continue
            la, lo = destination(math.radians(lat), math.radians(lon), np.array(math.atan2(dx, dy)), np.array(dist))
            la, lo = float(np.degrees(la)), float(np.degrees(lo))
            share = quick(la, lo)
            if share > best[0]:
                best = (share, la, lo, dist)
    return best


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("img", nargs="+", help="LOLA polar DEM .IMG file(s); each .LBL must sit next to its .IMG. "
                    "Give a fine and a coarse grid to get detail near the pole and coverage far out.")
    ap.add_argument("--out", default="horizons.json")
    ap.add_argument("--csv-dir")
    ap.add_argument("--max-km", type=float, default=150.0)
    ap.add_argument("--obs-height", type=float, default=2.0, help="height of panels/antenna above ground, m")
    ap.add_argument("--geometry", help="ephemeris/geometry.json: enables moving peak sites to the LOLA peak")
    ap.add_argument("--snap-km", type=float, default=1.0, help="search radius for the LOLA peak, km")
    a = ap.parse_args()
    sun = load_sun(a.geometry) if a.geometry else None

    dem = DEMStack(a.img)
    bundle = {"source": dem.name, "resolution_m": dem.lbl["map_scale"], "obs_height_m": a.obs_height, "max_km": a.max_km, "sites": {}}
    for sid, name, lat, lon, peak in SITES:
        pub_lat, pub_lon, moved = lat, lon, 0.0
        if lat > dem.max_lat:
            print(f"{sid:3} {name}: outside the DEM ({lat} > {dem.max_lat}), stays smooth-Moon")
            continue
        if peak and sun is not None:
            share, lat, lon, moved = best_lit_nearby(dem, sun, lat, lon, a.snap_km * 1000)
            lat, lon = round(lat, 5), round(lon, 4)
        res = skyline(dem, lat, lon, a.max_km, a.obs_height)
        if res is None:
            print(f"{sid:3} {name}: no data at the site, skipped")
            continue
        hz, h0, cov = res
        bundle["sites"][sid] = {"name": name, "lat": lat, "lon": lon, "published_lat": pub_lat, "published_lon": pub_lon,
                                "moved_m": round(moved), "site_height_m": round(h0, 1),
                                "coverage": round(cov, 3), "horizon": [round(float(x), 3) for x in hz]}
        lit = f"   sunlit {sunlit_share(sun, hz, lat, lon):.0%} (2027-30)" if sun is not None else ""
        where = f"   moved {moved:.0f} m to the LOLA peak" if moved else ""
        print(f"{sid:3} {name:28} height {h0:7.0f} m   skyline {hz.min():+.2f}..{hz.max():+.2f} deg{lit}{where}")
        if a.csv_dir:
            out = Path(a.csv_dir) / (re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") + ".csv")
            out.parent.mkdir(parents=True, exist_ok=True)
            with out.open("w") as f:
                f.write(f"# site: {name}\n# lat: {lat}\n# lon: {lon}\n# site_height_m: {h0:.1f}\n")
                f.write(f"# source: {dem.name}\n# obs_height_m: {a.obs_height}\n")
                f.write("azimuth_deg,horizon_deg\n")
                for x, y in enumerate(hz):
                    f.write(f"{x:.2f},{y:.3f}\n")
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(bundle, separators=(",", ":")))
    print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
