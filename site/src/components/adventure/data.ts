/* Mission Moonlight: the choices a young astronaut makes, and where their pictures live. */

export const ART = "/adventure";

export const KIDS = ["kid-1", "kid-2", "kid-3", "kid-4"] as const;
export const SUITS = ["white", "orange", "blue"] as const;
export const SHIPS = ["rocket", "shuttle", "future"] as const;

export type Kid = (typeof KIDS)[number];
export type Suit = (typeof SUITS)[number];
export type Ship = (typeof SHIPS)[number];

export interface Crew { name: string; kid: Kid; suit: Suit; ship: Ship; flag: string }

export const kidImg = (k: Kid) => `${ART}/${k}.webp`;
export const kidFace = (k: Kid) => `${ART}/${k}-face.webp`;
export const suitImg = (s: Suit, pose: "wave" | "salute" = "wave") => `${ART}/suit-${s}-${pose}.webp`;
export const shipImg = (s: Ship) => `${ART}/ship-${s}.webp`;
export const LANDER = `${ART}/lander.webp`;
export const flagImg = (code: string) => `${ART}/flags/${code}.svg`;

/** Flags shipped in public/adventure/flags (flag-icons, MIT): ISO country codes plus England, Scotland and Wales. */
export const FLAGS = ("ad,ae,af,ag,ai,al,am,ao,aq,ar,as,at,au,aw,ax,az,ba,bb,bd,be,bf,bg,bh,bi,bj,bl,bm,bn,bo,bq,br,bs,bt,bv,bw,by,bz,ca,cc,cd,cf,cg,ch,ci,ck,cl,cm,cn,co,cp,cr,cu,cv,cw,cx,cy,cz,de,dg,dj,dk,dm,do,dz,ec,ee,eg,eh,er,es,et,eu,fi,fj,fk,fm,fo,fr,ga,gb,gb-eng,gb-sct,gb-wls,gd,ge,gf,gg,gh,gi,gl,gm,gn,gp,gq,gr,gs,gt,gu,gw,gy,hk,hm,hn,hr,ht,hu,ic,id,ie,il,im,in,io,iq,ir,is,it,je,jm,jo,jp,ke,kg,kh,ki,km,kn,kp,kr,kw,ky,kz,la,lb,lc,li,lk,lr,ls,lt,lu,lv,ly,ma,mc,md,me,mf,mg,mh,mk,ml,mm,mn,mo,mp,mq,mr,ms,mt,mu,mv,mw,mx,my,mz,na,nc,ne,nf,ng,ni,nl,no,np,nr,nu,nz,om,pa,pe,pf,pg,ph,pk,pl,pm,pn,pr,ps,pt,pw,py,qa,re,ro,rs,ru,rw,sa,sb,sc,sd,se,sg,sh,si,sj,sk,sl,sm,sn,so,sr,ss,st,sv,sx,sy,sz,tc,td,tf,tg,th,tj,tk,tl,tm,tn,to,tr,tt,tv,tw,tz,ua,ug,um,un,us,uy,uz,va,vc,ve,vg,vi,vn,vu,wf,ws,xk,ye,yt,za,zm,zw").split(",");

const SUBDIVISIONS: Record<string, string> = { "gb-eng": "England", "gb-sct": "Scotland", "gb-wls": "Wales", eu: "European Union", un: "United Nations" };

/** Country names in the reader's language, sorted, with codes the browser can't name left out. */
export function flagList(lang: string) {
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames([lang, "en"], { type: "region" }); } catch {}
  const list = FLAGS.map((code) => {
    let name = "";
    if (names && !code.includes("-")) { try { name = names.of(code.toUpperCase()) ?? ""; } catch {} }
    if (!name || name.toUpperCase() === code.toUpperCase()) name = SUBDIVISIONS[code] ?? "";
    return { code, name };
  }).filter((f) => f.name);
  return list.sort((a, b) => a.name.localeCompare(b.name, lang));
}

/** A guess at the visitor's own flag from the browser language, so it can be offered first. */
export function homeFlag(): string {
  try {
    for (const l of navigator.languages ?? [navigator.language]) {
      const region = new Intl.Locale(l).maximize().region?.toLowerCase();
      if (region && FLAGS.includes(region)) return region;
    }
  } catch {}
  return "un";
}

export const kidHead = (k: Kid) => `${ART}/${k}-head.webp`;
export const CABIN = `${ART}/cabin.webp`;

/** Where each suit's visor sits in its picture: centre x, centre y, radius x, radius y, as fractions of the picture's size. */
const VISOR: Record<string, [number, number, number, number]> = {
  "white-wave": [0.587, 0.161, 0.25, 0.109], "white-salute": [0.556, 0.161, 0.241, 0.11],
  "orange-wave": [0.603, 0.152, 0.241, 0.11], "orange-salute": [0.57, 0.172, 0.223, 0.106],
  "blue-wave": [0.572, 0.176, 0.23, 0.109], "blue-salute": [0.566, 0.185, 0.233, 0.11],
};

const suitFaces = new Map<string, Promise<string>>();
const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

/** The child's own face inside the chosen suit's helmet, with the gold visor swapped for clear glass. A PNG data URL. */
export function suitFace(s: Suit, kid: Kid, pose: "wave" | "salute" = "wave"): Promise<string> {
  const key = `${s}-${pose}-${kid}`;
  let p = suitFaces.get(key);
  if (!p) {
    p = Promise.all([loadImg(suitImg(s, pose)), loadImg(kidHead(kid))]).then(([suit, head]) => {
      const W = suit.naturalWidth, H = suit.naturalHeight, c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d")!;
      g.drawImage(suit, 0, 0);
      const [fx, fy, frx, fry] = VISOR[`${s}-${pose}`];
      const cx = fx * W, cy = fy * H, rx = frx * W, ry = fry * H;
      g.save();
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.clip();
      const inside = g.createRadialGradient(cx, cy - ry * 0.3, 0, cx, cy, rx * 1.1);
      inside.addColorStop(0, "#3a4258"); inside.addColorStop(1, "#141826");
      g.fillStyle = inside; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
      const hw = rx * 2.1;
      g.drawImage(head, cx - hw / 2, cy - ry * 1.05, hw, hw);
      // Inner shadow at the rim, then a soft reflection across the clear glass.
      const rim = g.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.75, cx, cy, Math.max(rx, ry) * 1.02);
      rim.addColorStop(0, "rgba(0,0,0,0)"); rim.addColorStop(1, "rgba(0,0,0,0.55)");
      g.fillStyle = rim; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
      const gloss = g.createLinearGradient(cx - rx, cy - ry, cx + rx * 0.2, cy + ry * 0.4);
      gloss.addColorStop(0, "rgba(255,255,255,0.38)"); gloss.addColorStop(0.35, "rgba(255,255,255,0.06)"); gloss.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gloss; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
      g.restore();
      g.lineWidth = Math.max(2, rx * 0.04); g.strokeStyle = "rgba(255,255,255,0.35)";
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.45); g.stroke();
      return c.toDataURL("image/png");
    }).catch(() => suitImg(s, pose));
    suitFaces.set(key, p);
  }
  return p;
}
