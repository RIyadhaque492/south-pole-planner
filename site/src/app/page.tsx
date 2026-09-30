import { connection } from "next/server";
import { Landing } from "@/components/landing/Landing";
import { ensureGeometry } from "@/lib/server/geometry";
import { SITE_SEEDS } from "@/lib/sites";
import { currentTime, skyNow } from "@/lib/sky";

// Rendered on every request: the live board is computed for the current moment.
export default async function Home() {
  await connection();
  await ensureGeometry();
  const now = currentTime();
  return <Landing now={now} live={{ t: now, sites: SITE_SEEDS.map((s) => skyNow(s, now)) }} />;
}
