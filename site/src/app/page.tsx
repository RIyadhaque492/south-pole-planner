import { connection } from "next/server";
import { Landing } from "@/components/landing/Landing";
import { ensureGeometry } from "@/lib/server/geometry";
import { SITE_SEEDS, seedById } from "@/lib/sites";
import { currentTime, outlook, skyNow } from "@/lib/sky";

// Rendered on every request: the live board and the outlook are computed for the current moment.
export default async function Home() {
  await connection();
  await ensureGeometry();
  const now = currentTime();
  const featured = seedById("B");
  return (
    <Landing
      now={now}
      live={{ t: now, sites: SITE_SEEDS.map((s) => skyNow(s, now)) }}
      featured={{ id: featured.id, name: featured.name, outlook: outlook(featured, now, 30, 3) }}
    />
  );
}
