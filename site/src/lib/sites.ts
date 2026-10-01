import type { Site } from "./ephemeris";

export type SiteSeed = Pick<Site, "id" | "name" | "lat" | "lon" | "pub">;

/* Candidate sites from published south-pole illumination studies (coordinates approximate). */
export const SITE_SEEDS: SiteSeed[] = [
  { id: "A", name: "Shackleton rim A", lat: -89.68, lon: -166.0, pub: 81 },
  { id: "B", name: "Shackleton ridge B", lat: -89.44, lon: -141.8, pub: 82 },
  { id: "C", name: "de Gerlache rim C", lat: -88.71, lon: -68.7, pub: 85 },
  { id: "D", name: "Shackleton rim D", lat: -88.79, lon: 124.5, pub: 86 },
  { id: "M1", name: "Malapert Mountain M1", lat: -86.04, lon: 2.7, pub: 74 },
  { id: "M2", name: "Malapert Mountain M2", lat: -86.0, lon: -2.9, pub: 74 },
  { id: "LC", name: "Cabeus crater (LCROSS)", lat: -84.675, lon: -48.725 },
  { id: "C3", name: "Chandrayaan-3 landing site", lat: -69.373, lon: 32.319 },
];

export const makeSite = (s: SiteSeed): Site => ({ ...s, model: "smooth", raised: 1000, mask: null, maskName: "" });
export const initialSites = () => SITE_SEEDS.map(makeSite);
export const seedById = (id: string) => SITE_SEEDS.find((s) => s.id === id)!;
