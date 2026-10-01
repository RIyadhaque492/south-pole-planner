import { connection } from "next/server";
import { Landing } from "@/components/landing/Landing";
import { ensureGeometry } from "@/lib/server/geometry";
import { SITE_SEEDS } from "@/lib/sites";
import { board, currentTime } from "@/lib/sky";

// Rendered on every request: the live board is computed from the current moment, 30 days ahead.
export default async function Home() {
  await connection();
  await ensureGeometry();
  const now = currentTime();
  return <Landing now={now} board={board(SITE_SEEDS, now)} />;
}
