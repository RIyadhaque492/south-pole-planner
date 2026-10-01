/* Server-only: load public/geometry.bin and the LOLA skylines from disk once per process. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isGeometryLoaded, setGeometry } from "../ephemeris";
import { setTerrain } from "../terrain";

let pending: Promise<void> | null = null;

export function ensureGeometry() {
  if (isGeometryLoaded()) return Promise.resolve();
  const pub = path.join(process.cwd(), "public");
  pending ??= Promise.all([
    readFile(path.join(pub, "geometry.bin")).then((b) => {
      const copy = new Uint8Array(b.byteLength);
      copy.set(b);
      setGeometry(new Float32Array(copy.buffer));
    }),
    readFile(path.join(pub, "terrain", "horizons.json"), "utf8").then((t) => setTerrain(JSON.parse(t)), () => setTerrain(null)),
  ]).then(() => undefined);
  return pending;
}
