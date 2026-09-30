import type { NextRequest } from "next/server";
import { ensureGeometry } from "@/lib/server/geometry";
import { SITE_SEEDS } from "@/lib/sites";
import { clampTime, outlook } from "@/lib/sky";

/**
 * GET /api/sky?site=B&start=2026-10-01&days=30
 * Power/link statistics, rise and set events and an elevation trace for one site.
 * `site` may also be `lat,lon` for any point, e.g. site=-89.5,-140.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const key = q.get("site") ?? "B";
  let site = SITE_SEEDS.find((s) => s.id.toLowerCase() === key.toLowerCase());
  if (!site) {
    const [lat, lon] = key.split(",").map(Number);
    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 360))
      return Response.json({ error: `Unknown site "${key}". Use one of ${SITE_SEEDS.map((s) => s.id).join(", ")} or "lat,lon".` }, { status: 400 });
    site = { id: "custom", name: `${lat}, ${lon}`, lat, lon };
  }
  const start = Date.parse((q.get("start") ?? "") + "T00:00:00Z");
  const days = Math.max(1, Math.min(365, Number(q.get("days")) || 30));
  await ensureGeometry();
  const from = clampTime(isNaN(start) ? Date.now() : start);
  return Response.json({ site, ...outlook(site, from, days, days > 90 ? 12 : 3) }, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
