"use client";
import { useEffect, useState } from "react";
import { isGeometryLoaded, loadGeometry } from "./ephemeris";
import { isTerrainReady, loadTerrain } from "./terrain";

/** "loading" until the ephemeris table and the terrain skylines are in memory, then "ready" (or "error"). */
export function useGeometry() {
  // Already loaded on client-side navigation between pages; always "loading" during server render.
  const [state, setState] = useState<"loading" | "ready" | "error">(() => (isGeometryLoaded() && isTerrainReady() ? "ready" : "loading"));
  useEffect(() => {
    let alive = true;
    Promise.all([loadGeometry(), loadTerrain()]).then(
      () => alive && setState("ready"),
      () => alive && setState("error"),
    );
    return () => { alive = false; };
  }, []);
  return state;
}
