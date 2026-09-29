"""
Compute a terrain horizon mask for a lunar landing site from a LOLA digital elevation model.

The horizon mask is the elevation angle of the skyline in every compass direction, as seen
from the site. At the lunar south pole the Sun and Earth skim the horizon, so crater rims and
massifs decide when a lander has power and when it can talk to Earth. The web app uses this
mask in place of its smooth-Moon horizon.

Input: a LOLA polar DEM GeoTIFF, e.g. from NASA's Planetary Geodesy Data Archive (PGDA):
  https://pgda.gsfc.nasa.gov/products/90   (south pole DEMs, 5-20 m/pixel, polar stereographic)
  https://pgda.gsfc.nasa.gov/products/78   (LOLA polar gridded products)
The file must carry its map projection (standard for these GeoTIFFs). Heights are assumed to be
metres above the 1737.4 km reference sphere; use --height-scale / --height-offset if not.

Usage:
  python horizon_mask.py LDEM_83S_10MPP_ADJ.TIF --lat -89.44 --lon -141.8 --name "Shackleton ridge B"
  python horizon_mask.py --demo   # builds a synthetic test DEM to check the pipeline (NOT real data)

Output: <name>.csv with columns azimuth_deg,horizon_deg (azimuth clockwise from north)
"""
import argparse
import math
import re
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from scipy.ndimage import map_coordinates

R_MOON = 1737400.0


def destination(lat, lon, az, dist):
    """Great-circle destination points. lat/lon/az in radians, dist in metres (arrays ok)."""
    g = dist / R_MOON
    lat2 = np.arcsin(np.sin(lat) * np.cos(g) + np.cos(lat) * np.sin(g) * np.cos(az))
    lon2 = lon + np.arctan2(np.sin(az) * np.sin(g) * np.cos(lat), np.cos(g) - np.sin(lat) * np.sin(lat2))
    return lat2, lon2


class DEM:
    def __init__(self, path, scale=1.0, offset=0.0):
        with rasterio.open(path) as src:
            self.z = src.read(1).astype("f4") * scale + offset
            nod = src.nodata
            if nod is not None:
                self.z[src.read(1) == nod] = np.nan
            self.inv = ~src.transform
            self.res = abs(src.transform.a)
            crs = CRS.from_wkt(src.crs.to_wkt())
        geo = crs.geodetic_crs or CRS.from_proj4(f"+proj=longlat +R={R_MOON} +no_defs")
        self.to_xy = Transformer.from_crs(geo, crs, always_xy=True)

    def sample(self, lat_deg, lon_deg):
        x, y = self.to_xy.transform(lon_deg, lat_deg)
        col, row = self.inv * (x, y)
        return map_coordinates(self.z, [np.asarray(row) - 0.5, np.asarray(col) - 0.5],
                               order=1, mode="constant", cval=np.nan)


def horizon(dem, lat, lon, az_step=1.0, max_km=150.0, obs_height=2.0):
    az = np.radians(np.arange(0, 360, az_step))
    step = max(dem.res, 5.0)
    # fine steps near the site, coarser far away (skyline angles change slowly with distance)
    near = np.arange(2 * step, 5000, step)
    far = np.geomspace(5000, max_km * 1000, 1500)
    d = np.concatenate([near, far])

    h0 = float(dem.sample(np.array([lat]), np.array([lon]))[0])
    if not np.isfinite(h0):
        raise SystemExit("Site is outside the DEM (or on a no-data pixel). Check lat/lon and the file.")
    r0 = R_MOON + h0 + obs_height

    A, D = np.meshgrid(az, d, indexing="ij")
    la, lo = destination(math.radians(lat), math.radians(lon), A, D)
    h = dem.sample(np.degrees(la), np.degrees(lo))
    g = D / R_MOON
    r = R_MOON + h
    ang = np.degrees(np.arctan2(r * np.cos(g) - r0, r * np.sin(g)))
    ang[~np.isfinite(ang)] = -90.0
    coverage = np.isfinite(h).mean(axis=1)
    return np.degrees(az), ang.max(axis=1), h0, coverage


def make_demo_dem(path):
    """Synthetic south-polar DEM: a 21 km crater near the pole plus a massif. For testing only."""
    crs = CRS.from_proj4(f"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R={R_MOON} +units=m +no_defs")
    n, res = 1200, 100.0
    xs = (np.arange(n) - n / 2 + 0.5) * res
    X, Y = np.meshgrid(xs, -xs)
    rim = np.hypot(X - 3000, Y + 2000)
    z = 1500 * np.exp(-((rim - 10500) / 1800) ** 2) - 3000 * (rim < 10500) * (1 - (rim / 10500) ** 2)
    z += 4500 * np.exp(-(np.hypot(X + 40000, Y - 25000) / 9000) ** 2)
    transform = rasterio.transform.from_origin(xs[0] - res / 2, -xs[0] + res / 2, res, res)
    with rasterio.open(path, "w", driver="GTiff", height=n, width=n, count=1, dtype="float32",
                       crs=crs.to_wkt(), transform=transform) as dst:
        dst.write(z.astype("f4"), 1)
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dem", nargs="?")
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float, help="east longitude, degrees (-180..360)")
    ap.add_argument("--name", default="site")
    ap.add_argument("--az-step", type=float, default=1.0)
    ap.add_argument("--max-km", type=float, default=150.0)
    ap.add_argument("--obs-height", type=float, default=2.0, help="height of panels/antenna above ground, m")
    ap.add_argument("--height-scale", type=float, default=1.0)
    ap.add_argument("--height-offset", type=float, default=0.0)
    ap.add_argument("--out")
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()

    if a.demo:
        a.dem = make_demo_dem("demo_synthetic_dem.tif")
        a.lat, a.lon, a.name = -89.8, 45.0, "SYNTHETIC demo site"
        print("Built a SYNTHETIC test DEM (not real lunar terrain).")
    if not (a.dem and a.lat is not None and a.lon is not None):
        ap.error("need DEM path, --lat and --lon (or --demo)")

    dem = DEM(a.dem, a.height_scale, a.height_offset)
    az, hz, h0, cov = horizon(dem, a.lat, a.lon, a.az_step, a.max_km, a.obs_height)
    if cov.min() < 0.5:
        print(f"warning: rays leave the DEM early in some directions (min coverage {cov.min():.0%}); "
              "use a larger DEM or smaller --max-km")

    out = Path(a.out or re.sub(r"[^A-Za-z0-9_-]+", "_", a.name).strip("_") + ".csv")
    with out.open("w") as f:
        f.write(f"# site: {a.name}\n# lat: {a.lat}\n# lon: {a.lon}\n# site_height_m: {h0:.1f}\n")
        f.write(f"# source: {Path(a.dem).name}\n# obs_height_m: {a.obs_height}\n")
        f.write("azimuth_deg,horizon_deg\n")
        for x, y in zip(az, hz):
            f.write(f"{x:.2f},{y:.3f}\n")
    print(f"wrote {out}  (site height {h0:.0f} m, horizon {hz.min():+.2f}..{hz.max():+.2f} deg)")


if __name__ == "__main__":
    main()
