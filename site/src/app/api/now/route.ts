import { ensureGeometry } from "@/lib/server/geometry";
import { SITE_SEEDS } from "@/lib/sites";
import { clampTime, skyNow } from "@/lib/sky";

/** GET /api/now[?t=ISO] — Sun and Earth at every candidate site at one moment (default: now). */
export async function GET(request: Request) {
  await ensureGeometry();
  const q = new URL(request.url).searchParams.get("t");
  const parsed = q ? Date.parse(q) : NaN;
  const t = clampTime(isNaN(parsed) ? Date.now() : parsed);
  return Response.json(
    { t, utc: new Date(t).toISOString(), sites: SITE_SEEDS.map((s) => skyNow(s, t)) },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
