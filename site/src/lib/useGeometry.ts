"use client";
import { useEffect, useState } from "react";
import { isGeometryLoaded, loadGeometry } from "./ephemeris";

/** "loading" until public/geometry.bin is in memory, then "ready" (or "error"). */
export function useGeometry() {
  // Already loaded on client-side navigation between pages; always "loading" during server render.
  const [state, setState] = useState<"loading" | "ready" | "error">(() => (isGeometryLoaded() ? "ready" : "loading"));
  useEffect(() => {
    let alive = true;
    loadGeometry().then(
      () => alive && setState("ready"),
      () => alive && setState("error"),
    );
    return () => { alive = false; };
  }, []);
  return state;
}
