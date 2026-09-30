/* Server-only: load public/geometry.bin from disk once per process. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isGeometryLoaded, setGeometry } from "../ephemeris";

let pending: Promise<void> | null = null;

export function ensureGeometry() {
  if (isGeometryLoaded()) return Promise.resolve();
  pending ??= readFile(path.join(process.cwd(), "public", "geometry.bin")).then((b) => {
    const copy = new Uint8Array(b.byteLength);
    copy.set(b);
    setGeometry(new Float32Array(copy.buffer));
  });
  return pending;
}
