const pad = (x: number) => String(x).padStart(2, "0");

export const fmtD = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const fmt = (ms: number) => {
  const d = new Date(ms);
  return `${fmtD(ms)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
export const pct = (x: number) => Math.round(x * 100);
export const latlon = (s: { lat: number; lon: number }) =>
  `${Math.abs(s.lat).toFixed(2)}°${s.lat < 0 ? "S" : "N"} ${Math.abs(s.lon).toFixed(2)}°${s.lon < 0 ? "W" : "E"}`;
export { pad };
