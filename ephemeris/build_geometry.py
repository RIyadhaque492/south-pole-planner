"""
Build the Sun/Earth geometry table used by the web app.

For every time step it stores, in the Moon's Mean-Earth/Polar-Axis (ME) body-fixed
frame (the frame LOLA topography uses):
  * the unit vector from the Moon's centre toward the Sun (light-time corrected)
  * the vector from the Moon's centre toward Earth's centre, in km (light-time corrected)

These two vectors do not depend on the landing site, so one small table lets the
browser compute Sun/Earth elevation and azimuth for ANY site on the Moon.

Source: JPL DE421 planetary and lunar ephemeris, including its lunar libration angles.

Usage:
    python build_geometry.py --de421 ./de421 --start 2024-01-01 --end 2032-12-31 --step-hours 3
Output:
    geometry.json  (base64 Float32 array + metadata)
"""
import argparse
import base64
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

C_KM_S = 299792.458
TT_MINUS_UTC_S = 69.184  # 37 leap seconds + 32.184 s (valid since 2017; no leap second announced through 2026)
ARCSEC = np.pi / 180 / 3600


def rot(axis, a):
    """Frame (passive) rotation matrix about x/y/z by angle a (radians)."""
    a = np.asarray(a, dtype=float)
    c, s = np.cos(a), np.sin(a)
    o, z = np.ones_like(a), np.zeros_like(a)
    if axis == "x":
        m = [[o, z, z], [z, c, s], [z, -s, c]]
    elif axis == "y":
        m = [[c, z, -s], [z, o, z], [s, z, c]]
    else:
        m = [[c, s, z], [-s, c, z], [z, z, o]]
    return np.moveaxis(np.array(m), [0, 1], [-2, -1])  # shape (..., 3, 3)


# DE421 Principal-Axis -> Mean-Earth/Polar-Axis offset (Williams et al. 2008, JPL D-32296;
# NAIF moon_080317.tf, frame 31007: angles 67.92", 78.56", 0.30" about axes 3, 2, 1).
def pa_to_me(sign=1.0):
    return (rot("x", sign * 0.30 * ARCSEC) @ rot("y", sign * 78.56 * ARCSEC)
            @ rot("z", sign * 67.92 * ARCSEC)).T


class DE421:
    def __init__(self, path):
        sys.path.insert(0, str(Path(path).resolve().parent))
        import de421  # noqa: E402
        from jplephem.ephem import Ephemeris
        self.e = Ephemeris(de421)
        consts = dict(np.load(Path(de421.__file__).parent / "constants.npy", allow_pickle=True))
        self.emrat = consts[b"EMRAT"]

    def pos(self, name, jd):
        return self.e.position(name, jd)

    def moon_geo(self, jd):          # geocentric Moon, ICRF, km
        return self.pos("moon", jd)

    def earth_bary(self, jd):
        return self.pos("earthmoon", jd) - self.moon_geo(jd) / (1.0 + self.emrat)

    def moon_bary(self, jd):
        return self.earth_bary(jd) + self.moon_geo(jd)

    def sun_bary(self, jd):
        return self.pos("sun", jd)

    def icrf_to_pa(self, jd):
        phi, theta, psi = self.pos("librations", jd)
        return rot("z", psi) @ rot("x", theta) @ rot("z", phi)


def build(eph, jd_utc, me_sign=1.0):
    jd = jd_utc + TT_MINUS_UTC_S / 86400.0  # TDB ~= TT (difference < 2 ms)
    moon = eph.moon_bary(jd)                # (3, N)
    # light-time corrected Sun and Earth as seen from the Moon
    sun = eph.sun_bary(jd) - moon
    sun = eph.sun_bary(jd - np.linalg.norm(sun, axis=0) / C_KM_S / 86400) - moon
    earth = eph.earth_bary(jd) - moon
    earth = eph.earth_bary(jd - np.linalg.norm(earth, axis=0) / C_KM_S / 86400) - moon
    sun_u = sun / np.linalg.norm(sun, axis=0)

    M = eph.icrf_to_pa(jd)                  # (N,3,3)
    P = pa_to_me(me_sign)
    sun_me = np.einsum("ij,njk,kn->ni", P, M, sun_u)
    earth_me = np.einsum("ij,njk,kn->ni", P, M, earth)
    return sun_me, earth_me


def jd_from_datetime(d):
    return 2440587.5 + d.timestamp() / 86400.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--de421", default=str(Path(__file__).parent / "de421"))
    ap.add_argument("--start", default="2024-01-01")
    ap.add_argument("--end", default="2032-12-31")
    ap.add_argument("--step-hours", type=float, default=3.0)
    ap.add_argument("--out", default=str(Path(__file__).parent / "geometry.json"))
    a = ap.parse_args()

    t0 = dt.datetime.fromisoformat(a.start).replace(tzinfo=dt.timezone.utc)
    t1 = dt.datetime.fromisoformat(a.end).replace(tzinfo=dt.timezone.utc)
    n = int((t1 - t0).total_seconds() // (a.step_hours * 3600)) + 1
    jd = jd_from_datetime(t0) + np.arange(n) * a.step_hours / 24.0

    eph = DE421(a.de421)
    sun, earth = build(eph, jd)
    table = np.hstack([sun, earth]).astype("<f4")   # N x 6
    out = {
        "source": "JPL DE421 ephemeris + lunar librations, Moon ME frame",
        "start_utc_ms": int(t0.timestamp() * 1000),
        "step_ms": int(a.step_hours * 3600 * 1000),
        "count": n,
        "layout": "float32 little-endian, per row: sunX sunY sunZ (unit) earthX earthY earthZ (km)",
        "data": base64.b64encode(table.tobytes()).decode(),
    }
    Path(a.out).write_text(json.dumps(out))
    print(f"wrote {a.out}: {n} rows, {table.nbytes/1e3:.0f} kB raw")


if __name__ == "__main__":
    main()
