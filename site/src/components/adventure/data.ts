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
