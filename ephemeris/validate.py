"""
Sanity checks for build_geometry.py.

1. Compares the DE421 Moon orientation (librations + PA->ME offset) with the independent
   IAU WGCCRE 2009 lunar rotation model, by computing the sub-Earth point both ways.
2. Checks physical ranges: sub-solar latitude within ~ +/-1.6 deg, sub-Earth latitude
   (latitude libration) within ~ +/-7 deg, Earth distance 356,000-407,000 km.
"""
import datetime as dt
import numpy as np
from build_geometry import DE421, build, jd_from_datetime, rot, pa_to_me, TT_MINUS_UTC_S

D = np.pi / 180


def iau_icrf_to_body(jd_tdb):
    d = jd_tdb - 2451545.0
    T = d / 36525
    E = {i: np.radians(v) for i, v in {
        1: 125.045 - 0.0529921 * d, 2: 250.089 - 0.1059842 * d, 3: 260.008 + 13.0120009 * d,
        4: 176.625 + 13.3407154 * d, 5: 357.529 + 0.9856003 * d, 6: 311.589 + 26.4057084 * d,
        7: 134.963 + 13.0649930 * d, 8: 276.617 + 0.3287146 * d, 9: 34.226 + 1.7484877 * d,
        10: 15.134 - 0.1589763 * d, 11: 119.743 + 0.0036096 * d, 12: 239.961 + 0.1643573 * d,
        13: 25.053 + 12.9590088 * d}.items()}
    s, c = np.sin, np.cos
    a0 = (269.9949 + 0.0031 * T - 3.8787 * s(E[1]) - 0.1204 * s(E[2]) + 0.0700 * s(E[3])
          - 0.0172 * s(E[4]) + 0.0072 * s(E[6]) - 0.0052 * s(E[10]) + 0.0043 * s(E[13]))
    d0 = (66.5392 + 0.0130 * T + 1.5419 * c(E[1]) + 0.0239 * c(E[2]) - 0.0278 * c(E[3])
          + 0.0068 * c(E[4]) - 0.0029 * c(E[6]) + 0.0009 * c(E[7]) + 0.0008 * c(E[10])
          - 0.0009 * c(E[13]))
    W = (38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.5610 * s(E[1]) + 0.1208 * s(E[2])
         - 0.0642 * s(E[3]) + 0.0158 * s(E[4]) + 0.0252 * s(E[5]) - 0.0066 * s(E[6])
         - 0.0047 * s(E[7]) - 0.0046 * s(E[8]) + 0.0028 * s(E[9]) + 0.0052 * s(E[10])
         + 0.0040 * s(E[11]) + 0.0019 * s(E[12]) - 0.0044 * s(E[13]))
    return rot("z", W * D) @ rot("x", (90 - d0) * D) @ rot("z", (90 + a0) * D)


def latlon(v):
    v = v / np.linalg.norm(v)
    return np.degrees(np.arcsin(v[2])), np.degrees(np.arctan2(v[1], v[0]))


def main():
    eph = DE421("de421")
    t0 = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
    jd = jd_from_datetime(t0) + np.arange(0, 7 * 365, 1.37)
    sun, earth = build(eph, jd)

    lat_s, _ = zip(*map(latlon, sun))
    lat_e, _ = zip(*map(latlon, earth))
    dist = np.linalg.norm(earth, axis=1)
    print(f"sub-solar latitude range : {min(lat_s):+.2f} .. {max(lat_s):+.2f} deg")
    print(f"sub-Earth latitude range : {min(lat_e):+.2f} .. {max(lat_e):+.2f} deg")
    print(f"Earth distance range     : {dist.min():,.0f} .. {dist.max():,.0f} km")

    # Independent orientation check against IAU model (same Earth vector in ICRF)
    for sign in (+1, -1):
        errs = []
        for j in jd[::10]:
            jt = j + TT_MINUS_UTC_S / 86400
            e_icrf = np.ravel(eph.earth_bary(jt) - eph.moon_bary(jt))
            a = np.ravel(pa_to_me(sign) @ eph.icrf_to_pa(jt) @ e_icrf)
            b = iau_icrf_to_body(jt) @ e_icrf
            errs.append(np.degrees(np.arccos(np.clip(a @ b / np.linalg.norm(a) / np.linalg.norm(b), -1, 1))))
        print(f"PA->ME sign {sign:+d}: DE421 vs IAU sub-Earth point, mean {np.mean(errs)*3600:.1f}\" "
              f"max {np.max(errs)*3600:.1f}\"")


if __name__ == "__main__":
    main()
