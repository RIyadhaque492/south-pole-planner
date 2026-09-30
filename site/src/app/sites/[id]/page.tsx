import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SiteView } from "@/components/site/SiteView";
import { ensureGeometry } from "@/lib/server/geometry";
import { SITE_SEEDS } from "@/lib/sites";
import { currentTime, outlook, skyNow } from "@/lib/sky";

const find = (id: string) => SITE_SEEDS.find((s) => s.id.toLowerCase() === id.toLowerCase());

export async function generateMetadata({ params }: PageProps<"/sites/[id]">): Promise<Metadata> {
  const s = find((await params).id);
  return s
    ? { title: s.name, description: `Sunlight and Earth visibility at ${s.name} (${Math.abs(s.lat)}°S) for the coming month and year.` }
    : { title: "Unknown site" };
}

// Rendered per request so "now", the next events and the outlook are always current.
export default async function SitePage({ params }: PageProps<"/sites/[id]">) {
  const site = find((await params).id);
  if (!site) notFound();
  await connection();
  await ensureGeometry();
  const now = currentTime();
  const month = outlook(site, now, 30, 3), year = outlook(site, now, 365, 24).stats;
  return (
    <SiteView
      site={site}
      now={skyNow(site, now)}
      month={month}
      year={year}
      others={SITE_SEEDS.filter((s) => s.id !== site.id).map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
