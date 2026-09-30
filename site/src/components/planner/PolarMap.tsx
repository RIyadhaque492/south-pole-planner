"use client";
import { useRef } from "react";
import type { Site } from "@/lib/ephemeris";
import { useI18n } from "@/lib/i18n";

/* View looking down on the south pole: 0° longitude at the top, 90°E to the right.
   The disc covers the 6° closest to the pole. Radius grows with the square root of distance from the pole,
   which spreads out the crowded Shackleton sites; rings are labelled so the scale stays honest.
   Sites farther out sit on the rim with an arrow. */
const S = 400, C = S / 2, R = 160, SPAN = 6;

const radius = (colat: number) => R * Math.sqrt(Math.max(0, colat) / SPAN);
const toXY = (lat: number, lon: number, rOverride?: number) => {
  const r = rOverride ?? radius(90 + lat), a = (lon * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)] as const;
};

function Glyph({ lon, r, kind }: { lon: number; r: number; kind: "sun" | "earth" }) {
  const [x, y] = toXY(0, lon, r);
  const col = kind === "sun" ? "var(--sun)" : "var(--earth)";
  return (
    <g aria-hidden="true">
      <line x1={C} y1={C} x2={x} y2={y} stroke={col} strokeOpacity={0.35} strokeDasharray="2 4" />
      <circle cx={x} cy={y} r={kind === "sun" ? 7 : 6} fill={col} />
      {kind === "sun" && <circle cx={x} cy={y} r={11} fill="none" stroke={col} strokeOpacity={0.4} />}
    </g>
  );
}

export function PolarMap({
  sites, selId, both, sunLon, earthLon, picking, onSelect, onPick,
}: {
  sites: Site[]; selId: string; both: Map<string, number>; sunLon: number; earthLon: number; picking: boolean;
  onSelect: (id: string) => void; onPick: (lat: number, lon: number) => void;
}) {
  const { t } = useI18n();
  const svg = useRef<SVGSVGElement>(null);

  const click = (e: React.MouseEvent) => {
    if (!picking || !svg.current) return;
    const b = svg.current.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * S - C, y = ((e.clientY - b.top) / b.height) * S - C;
    const r = Math.hypot(x, y);
    if (r > R) return;
    const lat = -90 + SPAN * (r / R) ** 2, lon = (Math.atan2(x, -y) * 180) / Math.PI;
    onPick(+lat.toFixed(3), +lon.toFixed(3));
  };

  return (
    <div className={`polar${picking ? " picking" : ""}`}>
      <svg ref={svg} viewBox={`0 0 ${S} ${S}`} onClick={click} role="group" aria-label={t("p.mapTitle")}>
        <circle cx={C} cy={C} r={R} className="disc" />
        {[1, 2, 3, 4, 5, 6].map((d) => (
          <circle key={d} cx={C} cy={C} r={radius(d)} className={`ring${d % 2 === 0 ? " major" : ""}`} />
        ))}
        {Array.from({ length: 12 }, (_, k) => k * 30).map((lon) => {
          const [x, y] = toXY(0, lon, R), [lx, ly] = toXY(0, lon, R - 11);
          const lab = lon === 0 ? "0°" : lon === 180 ? "180°" : lon < 180 ? `${lon}°E` : `${360 - lon}°W`;
          return (
            <g key={lon}>
              <line x1={C} y1={C} x2={x} y2={y} className="spoke" />
              <text x={lx} y={ly + 3} textAnchor="middle" className="lab">{lab}</text>
            </g>
          );
        })}
        {[89, 88, 86].map((lat) => {
          const [x, y] = toXY(0, 165, radius(90 - lat));
          return <text key={lat} x={x + 2} y={y - 2} className="lab">{lat}°S</text>;
        })}

        <Glyph lon={earthLon} r={R + 30} kind="earth" />
        <Glyph lon={sunLon} r={R + 17} kind="sun" />

        {sites.map((s) => {
          const colat = 90 + s.lat, off = colat > SPAN;
          const [x, y] = toXY(s.lat, s.lon, off ? R - 4 : undefined);
          const f = both.get(s.id) ?? 0, on = s.id === selId, rr = on ? 11 : 8, circ = 2 * Math.PI * rr;
          return (
            <g
              key={s.id}
              className="site-hit"
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${s.name}, ${Math.round(f * 100)}%`}
              onClick={(e) => { if (!picking) { e.stopPropagation(); onSelect(s.id); } }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.id); } }}
            >
              <circle cx={x} cy={y} r={rr + 6} fill="transparent" />
              <circle className="halo" cx={x} cy={y} r={rr} fill="var(--panel)" stroke={on ? "var(--sun)" : "var(--line-2)"} strokeWidth={on ? 1.5 : 1} />
              <circle cx={x} cy={y} r={rr} fill="none" stroke="var(--both)" strokeWidth={on ? 3 : 2.5}
                strokeDasharray={`${f * circ} ${circ}`} transform={`rotate(-90 ${x} ${y})`} />
              <circle cx={x} cy={y} r={on ? 3 : 2} fill={on ? "var(--sun)" : "var(--ink)"} />
              {off && (() => {
                const [ax, ay] = toXY(0, s.lon, R + 2), [bx, by] = toXY(0, s.lon, R + 12);
                return <line x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--muted)" markerEnd="url(#arrow)" />;
              })()}
              <text x={x < C - 2 ? x - rr - 3 : x + rr + 3} y={y - rr + 3} textAnchor={x < C - 2 ? "end" : "start"} className="sname">
                {on ? s.name : s.id}{off ? ` · ${Math.abs(s.lat).toFixed(0)}°S` : ""}
              </text>
            </g>
          );
        })}
        <defs>
          <marker id="arrow" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0L6 3L0 6z" fill="var(--muted)" />
          </marker>
        </defs>
      </svg>
      <div className="legend map-legend">
        <span><i style={{ background: "var(--sun)" }} />{t("p.mapSunNow")}</span>
        <span><i style={{ background: "var(--earth)" }} />{t("p.mapEarth")}</span>
        <span><i className="ringkey" />{t("p.cBoth")}</span>
      </div>
    </div>
  );
}
