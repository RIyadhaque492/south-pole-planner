"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { sfx } from "@/lib/sound";
import { flagImg, kidFace, suitFace, type Crew } from "./data";
import type { Landing } from "./Flight";

const load = (src: string) => new Promise<HTMLImageElement | null>((ok) => {
  if (!src) return ok(null);
  const img = new Image();
  img.onload = () => ok(img); img.onerror = () => ok(null);
  img.src = src;
});

/** Word-wrap `text` into lines no wider than `max`. Splits on spaces, which Bengali and Spanish also use. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > max && line) { out.push(line); line = w; } else line = test;
  }
  if (line) out.push(line);
  return out;
}

async function draw(crew: Crew, landing: Landing, t: (k: string, v?: Record<string, string | number>) => string, lang: string, brand: string) {
  const W = 1600, H = 1100, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const font = getComputedStyle(document.body).fontFamily;
  const [face, suit, flag, photo] = await Promise.all([load(kidFace(crew.kid)), suitFace(crew.suit, crew.kid, "salute").then(load), load(flagImg(crew.flag)), load(landing.photo)]);

  // Night sky with stars and a gold frame.
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1430"); bg.addColorStop(1, "#050812");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.7})`;
    g.beginPath(); g.arc(Math.random() * W, Math.random() * H, Math.random() * 1.6, 0, Math.PI * 2); g.fill();
  }
  const gold = g.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, "#f7d77a"); gold.addColorStop(0.5, "#c9962e"); gold.addColorStop(1, "#f5d27a");
  g.strokeStyle = gold; g.lineWidth = 10; g.strokeRect(34, 34, W - 68, H - 68);
  g.lineWidth = 2; g.strokeRect(54, 54, W - 108, H - 108);

  // Photo of Earth over the Moon, framed, on the right.
  const px = 930, py = 150, pw = 560, ph = 400;
  if (photo) {
    const s = Math.max(pw / photo.width, ph / photo.height), sw = pw / s, sh = ph / s;
    g.save(); g.beginPath(); g.roundRect(px, py, pw, ph, 18); g.clip();
    g.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, px, py, pw, ph);
    g.restore();
    g.strokeStyle = gold; g.lineWidth = 4; g.beginPath(); g.roundRect(px, py, pw, ph, 18); g.stroke();
  }
  if (suit) { const h = 470, w = h * suit.width / suit.height; g.drawImage(suit, px + pw - w * 0.55, py + ph - 160, w, h); }
  if (flag) {
    g.save(); g.translate(px + 40, py + ph + 40);
    g.fillStyle = "#ddd"; g.fillRect(0, 0, 6, 170);
    g.drawImage(flag, 6, 4, 150, 112);
    g.restore();
  }

  // Words on the left.
  g.textBaseline = "alphabetic"; g.fillStyle = "#f5d27a";
  g.font = `600 30px ${font}`; g.fillText(`${brand} · ${t("tagline")}`.toUpperCase(), 110, 150);
  g.fillStyle = "#ffffff"; g.font = `700 64px ${font}`;
  let y = 240;
  for (const l of wrap(g, t("adv.cert.title"), 760)) { g.fillText(l, 110, y); y += 74; }
  g.fillStyle = "#b9c6e4"; g.font = `400 32px ${font}`; g.fillText(t("adv.cert.line"), 110, y + 20);
  y += 120;
  if (face) {
    g.save(); g.beginPath(); g.arc(165, y - 30, 58, 0, Math.PI * 2); g.clip();
    g.drawImage(face, 107, y - 88, 116, 116); g.restore();
    g.strokeStyle = gold; g.lineWidth = 4; g.beginPath(); g.arc(165, y - 30, 58, 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = "#f5d27a"; g.font = `700 76px ${font}`;
  g.fillText(t("adv.you", { name: crew.name.trim() }), 250, y);
  y += 70;
  g.fillStyle = "#e7ecf7"; g.font = `400 34px ${font}`;
  for (const l of wrap(g, t("adv.cert.did"), 760)) { g.fillText(l, 110, y); y += 46; }
  y += 30;
  const date = new Intl.DateTimeFormat(lang, { year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const facts: [string, string][] = [[t("adv.cert.date"), date], [t("adv.cert.ship"), t(`adv.ships.${crew.ship}`)], [t("adv.cert.site"), landing.site]];
  for (const [k, v] of facts) {
    g.fillStyle = "#8fa2c9"; g.font = `500 24px ${font}`; g.fillText(k.toUpperCase(), 110, y);
    g.fillStyle = "#ffffff"; g.font = `600 32px ${font}`; g.fillText(v, 110, y + 38); y += 92;
  }
  g.fillStyle = "#b9c6e4"; g.font = `italic 400 26px ${font}`;
  y = H - 120;
  for (const l of wrap(g, t("adv.plaque", { name: crew.name.trim() }), 1380).slice(0, 2)) { g.fillText(l, 110, y); y += 36; }
  g.fillStyle = "#f5d27a"; g.font = `600 26px ${font}`;
  g.textAlign = "right"; g.fillText(`— ${t("adv.cert.signed")}`, W - 110, H - 84);
  return c.toDataURL("image/png");
}

export function Certificate({ crew, landing, onAgain }: { crew: Crew; landing: Landing; onAgain: () => void }) {
  const { t, lang } = useI18n();
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    void document.fonts.ready.then(() => draw(crew, landing, t, lang, t("brand"))).then((u) => { if (live) setUrl(u); });
    sfx("win");
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const save = () => {
    const a = document.createElement("a");
    a.href = url; a.download = `moon-certificate-${crew.name.trim().replace(/[^\p{L}\p{N}]+/gu, "-") || "astronaut"}.png`;
    a.click();
  };

  return (
    <div className="mm-cert">
      <div className="mm-confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}</div>
      <div className="mm-cert-card">
        {url ? <img src={url} alt={t("adv.cert.title")} /> : <div className="mm-cert-wait"><span className="mm-spinner" /></div>}
      </div>
      <div className="mm-cert-actions">
        <button type="button" className="mm-btn mm-go big" onClick={save} disabled={!url}>⬇ {t("adv.cert.download")}</button>
        <button type="button" className="mm-btn ghost" onClick={onAgain}>↺ {t("adv.cert.again")}</button>
        <Link className="mm-btn ghost" href="/game">{t("adv.cert.game")} →</Link>
        <Link className="mm-btn ghost" href="/">⌂ {t("adv.cert.home")}</Link>
      </div>
    </div>
  );
}
