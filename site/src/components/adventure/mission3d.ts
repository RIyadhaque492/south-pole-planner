/* The 3D half of Mission Moonlight, in plain three.js.
   Space: Earth, Moon, stars and the child's rocket (a billboard of their chosen picture), with the in-flight
   tasks (water balls, space rocks, waving at Earth). Surface: a procedural south-pole landscape lit by a Sun a
   few degrees above the horizon, the lander, the astronaut and the flag. The React side drives the story and
   calls the methods below; this file only draws and reports back. Distances are not to scale except where a
   comment says so. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export type View = "orbit" | "cockpit" | "lookBack" | "galaxy" | "approach" | "earthrise" | "surface";
/** Where the Sun and Earth stand in the landing site's sky, in degrees (azimuth clockwise from north). */
export interface SkyDirs { sunAz: number; sunEl: number; earthAz: number; earthEl: number }
export interface Art { ship: string; lander: string; suit: string; salute: string; earth: string; moon: string }
export interface Telemetry { u: number; alt: number; vy: number }

const EARTH_R = 10, MOON_R = 2.73, ORBIT_R = 14, MOON_ORBIT_R = MOON_R + 1.4;
const MOON_POS = new THREE.Vector3(-430, 30, -415);
const UP = new THREE.Vector3(0, 1, 0);
const G_MOON = 1.62;
/** The astronaut is drawn a little larger than life so children can see themselves beside the 6 m lander. */
const ASTRO_H = 2.6;
const D2R = Math.PI / 180;
/** Toward the bright core of the Milky Way: behind the ship on the way out, so Earth hangs small in front of it. */
const GAL_DIR = new THREE.Vector3(0.62, 0.42, 0.66).normalize();
const GAL_TILT = 0.45;

/* ---------- small helpers ---------- */

const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
function fbm(x: number, y: number, oct = 5) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * noise(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return v;
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const ease = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);
/** Unit vector for an azimuth/elevation pair: north is -z, east is +x. */
const dirOf = (az: number, el: number) => new THREE.Vector3(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R));

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = (stops: [number, string][]) => canvasTex(256, 256, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  for (const [o, c] of stops) r.addColorStop(o, c);
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
/** Fine regolith grain for close-up ground and the Moon's limb: speckles and tiny craters. */
const grainTex = () => {
  const t = canvasTex(512, 512, (g, w) => {
    g.fillStyle = "#808080"; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 9000; i++) {
      const v = 100 + Math.floor(Math.random() * 60);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(Math.random() * w, Math.random() * w, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * w, y = Math.random() * w, r = 2 + Math.random() ** 2 * 18;
      g.strokeStyle = "rgba(170,170,170,0.55)"; g.lineWidth = Math.max(1, r * 0.25);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "rgba(60,60,60,0.45)"; g.beginPath(); g.arc(x + r * 0.15, y + r * 0.15, r * 0.8, 0, Math.PI * 2); g.fill();
    }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

/** A picture standing upright in the world, with its feet at y = 0. */
function standee(tex: THREE.Texture, height: number) {
  const img = tex.image as { width: number; height: number };
  const w = height * img.width / img.height;
  const geo = new THREE.PlaneGeometry(w, height);
  geo.translate(0, height / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, color: 0xe8e8e8 });
  return new THREE.Mesh(geo, mat);
}

/** A soft dark streak on the ground: the long shadow of something standing in a low Sun. */
function longShadow(tex: THREE.Texture) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.02, 0.5);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.75, color: 0x000000 }));
}

interface Particle { m: THREE.Sprite; v: THREE.Vector3; life: number; max: number; grow: number }
interface Rock { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; pushed: boolean }
interface Drop { m: THREE.Mesh; base: THREE.Vector3; phase: number; popping: number }

export class Mission {
  private r: THREE.WebGLRenderer;
  private clock = new THREE.Timer();
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private slowFrames = 0; private frames = 0; private lite = false;

  // shared
  private textures: Record<string, THREE.Texture> = {};
  private glowSun!: THREE.Texture; private glowFire!: THREE.Texture; private glowDust!: THREE.Texture; private shadowBlob!: THREE.Texture;
  private particles: Particle[] = [];
  private scene!: THREE.Scene;
  private cam = new THREE.PerspectiveCamera(50, 1, 0.05, 6000);
  private view: View = "orbit";
  private ray = new THREE.Raycaster();
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private yaw = 0; private pitch = 0;

  // space
  private space = new THREE.Scene();
  private earth!: THREE.Mesh; private moon!: THREE.Mesh;
  private ship!: THREE.Mesh; private flame!: THREE.Sprite;
  private cockpit = new THREE.Group();
  private shipPos = new THREE.Vector3(); private shipFwd = new THREE.Vector3(0, 0, 1);
  private theta = -1.9; // start over the day side (the Sun is toward -z)
  private phase: "earthOrbit" | "transfer" | "arrive" | "moonOrbit" = "earthOrbit";
  private bez: THREE.Vector3[] = [];
  private u = 0; private cap = 0; private burn = 0; private burnHold = false;
  private moonAxis = new THREE.Vector3(); private moonE1 = new THREE.Vector3(); private phi = 0;
  private rise = 0;
  private drops: Drop[] = []; private rocks: Rock[] = [];
  private rockGoal = 0; private rockPushed = 0; private rockTimer = 0;
  private onDrop: ((left: number) => void) | null = null;
  private onRock: ((pushed: number) => void) | null = null;
  private onEarth: (() => void) | null = null;
  private env: THREE.Texture | null = null;

  // surface
  private surf: THREE.Scene | null = null;
  private height = (x: number, z: number) => 0 * x * z;
  private lander!: THREE.Mesh; private landerShadow!: THREE.Mesh; private landerFire!: THREE.Sprite;
  private astro!: THREE.Mesh; private astroShadow!: THREE.Mesh;
  private flagPole: THREE.Group | null = null; private flagCloth: THREE.Mesh | null = null; private flagT = -1;
  private sunDir = new THREE.Vector3(); private earthDir = new THREE.Vector3();
  private alt = 60; private vy = -6; private thrust = false; private landed = false;
  private onTouch: ((speed: number) => void) | null = null;
  private walkT = -1; private onWalked: (() => void) | null = null;
  private jumpV = 0; private jumpY = 0; private airborne = false; private onJumpLand: (() => void) | null = null;
  private astroAt = new THREE.Vector3(3.2, 0, 3.4);
  private flagSide = new THREE.Vector3(1, 0, 0);
  private focus = new THREE.Vector3(); private camFrom = new THREE.Vector3(); private orbitCam = 0;
  private sunLight!: THREE.DirectionalLight;

  onTelemetry: ((t: Telemetry) => void) | null = null;
  onSlow: (() => void) | null = null;

  static async create(canvas: HTMLCanvasElement, art: Art) {
    const m = new Mission(canvas);
    await m.load(art);
    m.buildSpace();
    m.start();
    return m;
  }

  private constructor(private canvas: HTMLCanvasElement) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.05;
    this.scene = this.space;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    canvas.addEventListener("pointerdown", this.down);
    window.addEventListener("pointermove", this.move);
    window.addEventListener("pointerup", this.up);
  }

  private async load(art: Art) {
    const loader = new THREE.TextureLoader();
    const entries = await Promise.all(Object.entries(art).map(async ([k, url]) => {
      const t = await loader.loadAsync(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return [k, t] as const;
    }));
    this.textures = Object.fromEntries(entries);
    this.glowSun = glowTex([[0, "rgba(255,250,235,1)"], [0.08, "rgba(255,240,200,0.95)"], [0.25, "rgba(255,200,120,0.25)"], [1, "rgba(255,180,90,0)"]]);
    this.glowFire = glowTex([[0, "rgba(255,255,240,1)"], [0.2, "rgba(255,220,120,0.95)"], [0.5, "rgba(255,120,30,0.5)"], [1, "rgba(255,60,0,0)"]]);
    this.glowDust = glowTex([[0, "rgba(200,195,185,0.7)"], [0.6, "rgba(160,155,145,0.25)"], [1, "rgba(150,145,135,0)"]]);
    this.shadowBlob = canvasTex(64, 256, (g, w, h) => {
      const l = g.createLinearGradient(0, 0, 0, h);
      l.addColorStop(0, "rgba(0,0,0,0.95)"); l.addColorStop(0.7, "rgba(0,0,0,0.6)"); l.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = l;
      g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
    }, false);
  }

  /* ---------- space ---------- */

  private stars(radius: number, n: number) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(radius);
      pos.set([v.x, v.y, v.z], i * 3);
      c.setHSL(Math.random() < 0.5 ? 0.6 : 0.08, 0.3, 0.6 + Math.random() * 0.4);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const big = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    big.frustumCulled = false;
    return big;
  }

  /** The Milky Way: a glowing band of light with dark dust lanes and a bright core, plus the dense stars along it. */
  private milkyWay() {
    const g = new THREE.Group();
    const W = 1024, H = 512;
    const tex = canvasTex(W, H, (c) => {
      const img = c.createImageData(W, H), d = img.data;
      for (let y = 0; y < H; y++) {
        const lat = (y / H - 0.5) * Math.PI;
        for (let x = 0; x < W; x++) {
          const lon = Math.abs(x / W - 0.5) * Math.PI * 2;
          const core = Math.exp(-((lon / 0.55) ** 2));
          const width = 0.09 + 0.14 * core;
          const band = Math.exp(-((lat / width) ** 2));
          const i = (y * W + x) * 4;
          d[i + 3] = 255;
          if (band < 0.004) continue;
          const n = fbm(x / W * 30, y / H * 14, 4);
          const laneLat = lat - 0.012 * Math.sin(x / W * 40) - 0.01;
          const lane = Math.exp(-((laneLat / (0.018 + 0.03 * core)) ** 2)) * clamp(fbm(x / W * 60 + 7, y / H * 30, 3) * 1.6 - 0.25, 0, 1);
          const b = band * (0.15 + 1.1 * n * n * n) * (0.35 + 1.2 * core) * (1 - 0.9 * lane);
          const neb = clamp(fbm(x / W * 18 + 31, y / H * 9, 3) * 2.2 - 1.15, 0, 1) * band;
          const warm = core * 0.8;
          d[i] = clamp((0.62 + 0.38 * warm) * b * 255 + neb * 120, 0, 255);
          d[i + 1] = clamp((0.68 + 0.17 * warm) * b * 255 + neb * 30, 0, 255);
          d[i + 2] = clamp((1.0 - 0.35 * warm) * b * 255 + neb * 80, 0, 255);
        }
      }
      c.putImageData(img, 0, 0);
    });
    const band = new THREE.Mesh(new THREE.SphereGeometry(2800, 64, 32),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
    band.renderOrder = -1;
    g.add(band);

    // Thousands of faint stars crowded along the band, thickest toward the core.
    const n = 9000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    for (let i = 0; i < n; i++) {
      const lon = gauss() * Math.PI * (Math.random() < 0.5 ? 0.35 : 1);
      const lat = gauss() * (0.1 + 0.12 * Math.exp(-((lon / 0.55) ** 2)));
      pos.set([Math.cos(lat) * Math.cos(lon) * 2700, Math.sin(lat) * 2700, Math.cos(lat) * Math.sin(lon) * 2700], i * 3);
      c.setHSL(Math.random() < 0.6 ? 0.6 : 0.1, 0.4, 0.55 + Math.random() * 0.4);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.1, sizeAttenuation: false, vertexColors: true, depthWrite: false, transparent: true, opacity: 0.85 }));
    pts.frustumCulled = false;
    g.add(pts);

    g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), GAL_DIR);
    g.rotateOnWorldAxis(GAL_DIR, GAL_TILT);
    return g;
  }

  private buildSpace() {
    const s = this.space;
    s.background = new THREE.Color(0x010204);
    s.add(this.stars(3000, 5000));
    s.add(this.milkyWay());
    const sunDir = new THREE.Vector3(0.23, 0.27, -0.89).normalize(); // to the side of the Earth-Moon line: Earth from the Moon is a bright gibbous
    const sun = new THREE.DirectionalLight(0xffffff, 3.2);
    sun.position.copy(sunDir);
    s.add(sun, new THREE.AmbientLight(0x223344, 0.12));
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowSun, blending: THREE.AdditiveBlending, depthWrite: false }));
    sunGlow.position.copy(sunDir).multiplyScalar(2500); sunGlow.scale.setScalar(420);
    s.add(sunGlow);

    // Earth with an atmosphere that glows at the edge.
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 96, 64), new THREE.MeshStandardMaterial({ map: this.textures.earth, roughness: 0.75, metalness: 0 }));
    this.earth.rotation.z = 23.4 * D2R;
    s.add(this.earth);
    const rim = (scale: number, side: THREE.Side, power: number, strength: number) => new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R * scale, 64, 48),
      new THREE.ShaderMaterial({
        side, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { sun: { value: sunDir }, power: { value: power }, strength: { value: strength } },
        vertexShader: "varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); vW=normalize((modelMatrix*vec4(position,0.)).xyz); gl_Position=projectionMatrix*mv; }",
        fragmentShader: "uniform vec3 sun; uniform float power; uniform float strength; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ float f=pow(1.-abs(dot(vN,vV)),power); float lit=smoothstep(-0.25,0.35,dot(vW,sun)); gl_FragColor=vec4(vec3(0.3,0.6,1.)*f*strength*lit,1.); }",
      }));
    s.add(rim(1.012, THREE.FrontSide, 2.5, 1.1), rim(1.07, THREE.BackSide, 4.0, 2.2));

    // The Moon, with fine grain so its edge stays crisp up close.
    const grain = grainTex();
    grain.repeat.set(96, 48);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 128, 96), new THREE.MeshStandardMaterial({ map: this.textures.moon, bumpMap: grain, bumpScale: 0.6, roughness: 1, metalness: 0 }));
    this.moon.position.copy(MOON_POS);
    s.add(this.moon);

    // The rocket: the child's picture, always turned to the camera with its nose along the path.
    this.ship = standee(this.textures.ship, 2.2);
    this.ship.geometry.translate(0, -1.1, 0);
    (this.ship.material as THREE.MeshBasicMaterial).color.set(0xffffff);
    s.add(this.ship);
    this.flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowFire, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.add(this.flame);

    s.add(this.cam);
    this.cam.add(this.cockpit);

    const pm = new THREE.PMREMGenerator(this.r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.placeShip(0);
    this.camFrom.copy(this.shipPos).add(new THREE.Vector3(30, 12, 0));
    this.cam.position.copy(this.camFrom);
  }

  private placeShip(dt: number) {
    if (this.phase === "earthOrbit") {
      this.theta += dt * (Math.PI * 2 / 70);
      this.shipPos.set(Math.cos(this.theta) * ORBIT_R, 0, Math.sin(this.theta) * ORBIT_R);
      this.shipFwd.set(-Math.sin(this.theta), 0, Math.cos(this.theta));
    } else if (this.phase === "transfer") {
      // Coast toward the cap the story has reached; slow near the ends like a real transfer.
      const speed = 0.028;
      this.u = Math.min(this.cap, this.u + dt * speed);
      const [a, b, c, d] = this.bez, t = this.u, k = 1 - t;
      this.shipPos.set(0, 0, 0)
        .addScaledVector(a, k * k * k).addScaledVector(b, 3 * k * k * t).addScaledVector(c, 3 * k * t * t).addScaledVector(d, t * t * t);
      const der = new THREE.Vector3()
        .addScaledVector(b.clone().sub(a), 3 * k * k).addScaledVector(c.clone().sub(b), 6 * k * t).addScaledVector(d.clone().sub(c), 3 * t * t);
      if (der.lengthSq() > 1e-6) this.shipFwd.copy(der.normalize());
      if (this.u >= 1) this.enterMoonOrbit();
    } else {
      this.phi += dt * (this.phase === "moonOrbit" ? 0.16 : 0.04);
      const e2 = new THREE.Vector3().crossVectors(this.moonAxis, this.moonE1);
      this.shipPos.copy(MOON_POS).addScaledVector(this.moonE1, Math.cos(this.phi) * MOON_ORBIT_R).addScaledVector(e2, Math.sin(this.phi) * MOON_ORBIT_R);
      this.shipFwd.copy(this.moonE1).multiplyScalar(-Math.sin(this.phi)).addScaledVector(e2, Math.cos(this.phi)).normalize();
    }
  }

  private enterMoonOrbit() {
    this.phase = "arrive";
    const d = this.bez[3];
    this.moonE1.copy(d).sub(MOON_POS).normalize();
    this.moonAxis.crossVectors(this.moonE1, this.shipFwd).normalize();
    if (this.moonAxis.lengthSq() < 0.5) this.moonAxis.copy(UP);
    this.phi = 0;
  }

  /** Fire the engine out of Earth orbit toward the Moon (trans-lunar injection). */
  fireToMoon() {
    if (this.phase !== "earthOrbit") return;
    const p0 = this.shipPos.clone(), t0 = this.shipFwd.clone();
    const toEarth = new THREE.Vector3().sub(MOON_POS).normalize();
    const side = new THREE.Vector3().crossVectors(toEarth, UP).normalize();
    const arrive = MOON_POS.clone().addScaledVector(side, MOON_ORBIT_R);
    this.bez = [p0, p0.clone().addScaledVector(t0, 160), arrive.clone().addScaledVector(toEarth, 180).addScaledVector(side, 40), arrive];
    this.phase = "transfer"; this.u = 0; this.cap = 0.3;
    this.burn = 3;
  }
  /** How far along the transfer the ship may coast before the story catches up (0..1). */
  setCap(c: number) { this.cap = c; }
  setBurn(on: boolean) { this.burnHold = on; }
  /** Braking done: settle into a proper orbit around the Moon. */
  captured() { if (this.phase === "arrive") this.phase = "moonOrbit"; }
  get progress() { return this.u; }

  setView(v: View) {
    this.view = v;
    this.yaw = 0; this.pitch = 0;
    if (v === "earthrise") this.rise = 0;
    if (v === "surface" && this.surf) this.scene = this.surf;
  }

  /** How much further back the camera stands on a tall, narrow (phone) screen so the subject still fits. */
  private get narrow() { return clamp(1.3 / this.cam.aspect, 1, 2.4); }

  /* ---------- in-flight tasks ---------- */

  /** Floating water balls inside the cabin; `onLeft` reports how many are still floating. */
  spawnWater(n: number, onLeft: (left: number) => void) {
    this.onDrop = onLeft;
    const mat = this.lite
      ? new THREE.MeshStandardMaterial({ color: 0x6fc2ff, roughness: 0.04, metalness: 0.35, envMap: this.env, envMapIntensity: 2.2, transparent: true, opacity: 0.8 })
      : new THREE.MeshPhysicalMaterial({ color: 0xa8dcff, roughness: 0.02, metalness: 0, transmission: 0.92, thickness: 0.4, ior: 1.33, envMap: this.env, envMapIntensity: 1.6, clearcoat: 1 });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.06, 40, 28), mat);
      const wide = Math.min(1, this.cam.aspect), tall = this.cam.aspect < 1 ? 2.2 : 1.1;
      const base = new THREE.Vector3(((i / (n - 1) - 0.5) * 2.4 + (Math.random() - 0.5) * 0.3) * wide, (Math.random() - 0.5) * tall, -2.6 - Math.random() * 0.8);
      m.position.copy(base);
      this.cockpit.add(m);
      this.drops.push({ m, base, phase: Math.random() * 6, popping: -1 });
    }
    const light = new THREE.PointLight(0xffffff, 3, 6);
    light.position.set(0.5, 1, 0);
    light.name = "cabin";
    this.cockpit.add(light);
  }

  /** Space rocks drifting at the window: push `goal` of them away. */
  spawnRocks(goal: number, onPushed: (pushed: number) => void) {
    this.rockGoal = goal; this.rockPushed = 0; this.rockTimer = 0; this.onRock = onPushed;
  }

  private newRock() {
    const geo = new THREE.IcosahedronGeometry(0.55 + Math.random() * 0.35, 4);
    const p = geo.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(), seed = Math.random() * 100;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      const d = 1 + 0.35 * (fbm(n.x * 2 + seed, n.y * 2 + n.z * 1.7, 4) - 0.5) + 0.12 * (noise(n.x * 9 + seed, n.z * 9) - 0.5);
      v.multiplyScalar(d);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.textures.moon, color: 0x9a8f85, roughness: 1, metalness: 0 }));
    const side = Math.random() < 0.5 ? -1 : 1;
    m.position.set(side * (0.6 + Math.random() * 2.2) * Math.min(1, this.cam.aspect), (Math.random() - 0.5) * 2.2, -60);
    m.scale.setScalar(1.2);
    this.cockpit.add(m);
    this.rocks.push({ m, v: new THREE.Vector3(0, 0, 9 + Math.random() * 3), spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.5), pushed: false });
  }

  /** Let the child tap Earth (to wave goodbye). */
  tapEarth(cb: (() => void) | null) { this.onEarth = cb; }

  /** A JPEG of exactly what the camera sees now. */
  snapshot() {
    this.r.render(this.scene, this.cam);
    return this.canvas.toDataURL("image/jpeg", 0.88);
  }

  /* ---------- surface ---------- */

  /** Switch to the landing: build the ground and start the lander high above it. */
  startDescent(sky: SkyDirs, onTouch: (speed: number) => void) {
    this.buildSurface(sky);
    this.space.remove(this.cam); // a camera parented to the other scene would keep a stale world matrix
    this.scene = this.surf!;
    this.view = "surface";
    this.alt = 55; this.vy = -6; this.landed = false; this.onTouch = onTouch;
    this.cam.fov = 50; this.cam.updateProjectionMatrix();
  }
  setThrust(on: boolean) { this.thrust = on; }

  private buildSurface(sky: SkyDirs) {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x000000);
    s.add(this.stars(2500, 2500));
    this.sunDir = dirOf(sky.sunAz, sky.sunEl);
    this.earthDir = dirOf(sky.earthAz, sky.earthEl);

    // Ground: rolling regolith, scattered craters, one deep crater that the low Sun never reaches,
    // a mountain ridge on the horizon, and a flat landing pad in the middle.
    const craters: [number, number, number][] = [];
    for (let i = 0; i < 70; i++) {
      const r = 2 + Math.random() ** 2.4 * 26, a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 260;
      craters.push([Math.cos(a) * d, Math.sin(a) * d, r]);
    }
    const back = this.earthDir.clone().setY(0).normalize();
    const deep = back.clone().multiplyScalar(-1).applyAxisAngle(UP, 0.9).multiplyScalar(170);
    craters.push([deep.x, deep.z, 75]);
    const ridge = back.clone().applyAxisAngle(UP, 0.6).multiplyScalar(330);
    this.height = (x: number, z: number) => {
      const d = Math.hypot(x, z);
      let h = (fbm(x * 0.012, z * 0.012) - 0.5) * 9 + (fbm(x * 0.08 + 40, z * 0.08) - 0.5) * 1.4;
      for (const [cx, cz, r] of craters) {
        const q = Math.hypot(x - cx, z - cz) / r;
        if (q > 1.6) continue;
        const depth = r > 50 ? 0.32 * r : 0.22 * r;
        h += q < 1 ? -depth * (1 - q * q) : 0;
        h += 0.1 * r * Math.exp(-(((q - 1) / 0.22) ** 2));
      }
      const rq = Math.hypot(x - ridge.x, z - ridge.z);
      h += 46 * Math.exp(-((rq / 120) ** 2)) * (0.7 + 0.6 * fbm(x * 0.02, z * 0.02));
      h *= smooth(clamp((d - 9) / 24, 0, 1));
      return h - (d * d) / 3200;
    };
    const seg = this.lite ? 150 : 260, size = 900;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, this.height(x, z));
      const v = 0.78 + 0.22 * fbm(x * 0.03 + 9, z * 0.03);
      colors.set([v, v * 0.985, v * 0.955], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const grain = grainTex();
    grain.repeat.set(160, 160);
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9a968e, vertexColors: true, roughness: 1, metalness: 0, bumpMap: grain, bumpScale: 2.2 }));
    ground.receiveShadow = true; ground.castShadow = true;
    s.add(ground);

    const sun = new THREE.DirectionalLight(0xfff4e6, 4.2);
    sun.position.copy(this.sunDir).multiplyScalar(300);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 1; sc.far = 900;
    sun.shadow.mapSize.setScalar(this.lite ? 1024 : 2048);
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
    s.add(sun, sun.target);
    this.sunLight = sun;
    s.add(new THREE.HemisphereLight(0x9ab6e0, 0x2a2826, 0.22)); // earthshine and light bounced off sunlit hills

    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowSun, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true }));
    sunGlow.position.copy(this.sunDir).multiplyScalar(1500); sunGlow.scale.setScalar(260);
    s.add(sunGlow);

    // Earth hangs low over the horizon, lit from the real Sun direction, so its phase is right too.
    const earth = new THREE.Mesh(new THREE.SphereGeometry(30, 64, 48), new THREE.MeshStandardMaterial({ map: this.textures.earth, roughness: 0.8 }));
    earth.position.copy(this.earthDir).multiplyScalar(1200);
    earth.rotation.set(0.3, 2.2, 0.4);
    s.add(earth);

    // Lander, its fire, and long shadows streaming away from the Sun.
    this.lander = standee(this.textures.lander, 6);
    this.landerFire = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowFire, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.landerShadow = longShadow(this.shadowBlob);
    this.astro = standee(this.textures.suit, ASTRO_H);
    this.astro.visible = false;
    this.astroShadow = longShadow(this.shadowBlob);
    this.astroShadow.visible = false;
    s.add(this.lander, this.landerFire, this.landerShadow, this.astro, this.astroShadow);

    this.surf = s;
    this.focus.set(0, 3, 0);
    const side = new THREE.Vector3().crossVectors(back, UP).normalize();
    this.camFrom.copy(back).multiplyScalar(-19).addScaledVector(side, 7).setY(this.height(0, 0) + 4.2);
    // Stand the astronaut between the lander and the camera, a little to the right as the camera sees it.
    const toCam = this.camFrom.clone().setY(0).normalize(), right = new THREE.Vector3().crossVectors(toCam, UP).multiplyScalar(-1);
    this.astroAt.copy(toCam).multiplyScalar(5.5).addScaledVector(right, 3.2);
    this.flagSide.copy(right);
    this.cam.position.copy(this.camFrom);
    this.cam.position.y += 40;
  }

  /** The astronaut climbs out and bounds to a spot beside the lander. */
  walkOut(onDone: () => void) {
    this.astro.visible = true; this.astroShadow.visible = true;
    this.walkT = 0; this.onWalked = onDone;
    (this.astro.material as THREE.MeshBasicMaterial).opacity = 0;
  }
  /** One big low-gravity jump. */
  jump(onLand: () => void) {
    if (this.airborne || this.walkT >= 0) return;
    this.airborne = true; this.jumpV = 2.6; this.jumpY = 0; this.onJumpLand = onLand;
  }
  salute() {
    const mat = this.astro.material as THREE.MeshBasicMaterial;
    mat.map = this.textures.salute; mat.needsUpdate = true;
    const img = this.textures.salute.image as { width: number; height: number };
    this.astro.geometry.dispose();
    const g = new THREE.PlaneGeometry(ASTRO_H * img.width / img.height, ASTRO_H);
    g.translate(0, ASTRO_H / 2, 0);
    this.astro.geometry = g;
    this.orbitCam = 0.0001;
  }

  /** Plant a flag beside the astronaut. The cloth ripples from the push and then hangs still: there is no wind. */
  async plantFlag(svgUrl: string) {
    const img = new Image();
    img.src = svgUrl;
    await img.decode().catch(() => {});
    const tex = canvasTex(640, 480, (g, w, h) => {
      try { g.drawImage(img, 0, 0, w, h); } catch { g.fillStyle = "#4a90d9"; g.fillRect(0, 0, w, h); }
    });
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.3 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.3, 12), metal);
    pole.position.y = 1.65; pole.castShadow = true;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.82, 10), metal);
    rod.rotation.z = Math.PI / 2; rod.position.set(0.91, 3.26, 0); rod.castShadow = true;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.35, 24, 12), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }));
    cloth.geometry.translate(0.9, -0.675, 0);
    cloth.position.set(0.03, 3.25, 0); cloth.castShadow = true;
    cloth.userData.base = Float32Array.from((cloth.geometry.attributes.position as THREE.BufferAttribute).array);
    group.add(pole, rod, cloth);
    const at = this.astroAt.clone().addScaledVector(this.flagSide, 1.3);
    at.y = this.height(at.x, at.z) + 3;
    group.position.copy(at);
    // Turn the flag to face the camera's side of the scene.
    group.rotation.y = Math.atan2(this.camFrom.x - at.x, this.camFrom.z - at.z) - 0.35;
    this.surf!.add(group);
    this.flagPole = group; this.flagCloth = cloth; this.flagT = 0;
  }

  /* ---------- input ---------- */

  private pick(e: PointerEvent, objs: THREE.Object3D[]) {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.cam);
    return this.ray.intersectObjects(objs, false)[0]?.object ?? null;
  }

  private down = (e: PointerEvent) => {
    const drop = this.pick(e, this.drops.filter((d) => d.popping < 0).map((d) => d.m));
    if (drop) { this.popDrop(drop); return; }
    const rock = this.pick(e, this.rocks.filter((r) => !r.pushed).map((r) => r.m));
    if (rock) { this.pushRock(rock, e); return; }
    if (this.onEarth && this.pick(e, [this.earth])) { this.onEarth(); return; }
    this.drag = { x: e.clientX, y: e.clientY, moved: false };
  };
  private move = (e: PointerEvent) => {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX; this.drag.y = e.clientY;
    if (this.view === "cockpit" || this.view === "earthrise") return;
    this.yaw -= dx * 0.006; this.pitch = clamp(this.pitch + dy * 0.004, -0.6, 0.9);
  };
  private up = () => { this.drag = null; };

  private popDrop(m: THREE.Object3D) {
    const d = this.drops.find((x) => x.m === m);
    if (!d) return;
    d.popping = 0;
    const world = d.m.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 10; i++) this.puff(world, new THREE.Vector3().randomDirection().multiplyScalar(1.4), 0.07, 0.5, 0x9fd8ff, 0.4);
    this.onDrop?.(this.drops.filter((x) => x.popping < 0).length);
  }
  private pushRock(m: THREE.Object3D, e: PointerEvent) {
    const r = this.rocks.find((x) => x.m === m);
    if (!r) return;
    r.pushed = true;
    const rect = this.canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width - 0.5;
    r.v.set(sx < 0 ? -14 : 14, 4 + Math.random() * 4, -2);
    r.spin.multiplyScalar(5);
    const world = r.m.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 14; i++) this.puff(world, new THREE.Vector3().randomDirection().multiplyScalar(3), 0.5, 0.7, 0xffc070, 0.8);
    this.rockPushed++;
    this.onRock?.(this.rockPushed);
  }

  /** A short-lived glowing sprite: sparks, spray, dust. */
  private puff(at: THREE.Vector3, v: THREE.Vector3, size: number, life: number, color: number, grow = 1, map = this.glowFire) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: map === this.glowDust ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    m.position.copy(at); m.scale.setScalar(size);
    this.scene.add(m);
    this.particles.push({ m, v, life, max: life, grow });
  }

  /* ---------- loop ---------- */

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }

  private start() {
    const tick = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      this.clock.update();
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.watchSpeed(dt);
      if (this.scene === this.space) this.tickSpace(dt); else this.tickSurface(dt);
      this.tickParticles(dt);
      this.r.render(this.scene, this.cam);
    };
    tick();
  }

  private watchSpeed(dt: number) {
    if (this.lite || this.frames > 400) return;
    this.frames++;
    if (this.frames > 60 && dt > 0.042) this.slowFrames++;
    if (this.slowFrames > 90) {
      this.lite = true;
      this.r.setPixelRatio(1);
      this.resize();
      this.onSlow?.();
    }
  }

  private tickParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { p.m.removeFromParent(); p.m.material.dispose(); this.particles.splice(i, 1); continue; }
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.multiplyScalar(1 + p.grow * dt);
      p.m.material.opacity = p.life / p.max;
    }
  }

  private tickSpace(dt: number) {
    const t = this.clock.getElapsed();
    this.earth.rotation.y += dt * 0.02;
    this.moon.rotation.y += dt * 0.004;
    this.placeShip(dt);

    // Camera choreography.
    const f = this.shipFwd, side = new THREE.Vector3().crossVectors(UP, f).normalize();
    const want = new THREE.Vector3(), look = new THREE.Vector3();
    let fov = 50;
    if (this.view === "cockpit") {
      want.copy(this.shipPos).addScaledVector(f, 1.2);
      look.copy(want).addScaledVector(f, 10);
    } else if (this.view === "lookBack") {
      want.copy(this.shipPos).addScaledVector(f, 7 * this.narrow).addScaledVector(side, 2.5).addScaledVector(UP, 1.4);
      look.copy(this.shipPos).lerp(new THREE.Vector3(), 0.02);
    } else if (this.view === "galaxy") {
      // Inside the cabin, looking out of the window at the Milky Way; it drifts slowly as the ship turns. Drag to look around.
      want.copy(this.shipPos);
      const t2 = this.clock.getElapsed() * 0.05;
      const dir = GAL_DIR.clone().applyAxisAngle(UP, Math.sin(t2) * 0.12 + this.yaw * 0.6);
      dir.applyAxisAngle(new THREE.Vector3().crossVectors(dir, UP).normalize(), -this.pitch * 0.5 + 0.05);
      look.copy(want).addScaledVector(dir, 100);
      fov = 62;
    } else if (this.view === "approach") {
      want.copy(this.shipPos).addScaledVector(f, -7 * this.narrow).addScaledVector(side, 3).addScaledVector(UP, 1.6);
      look.copy(this.shipPos).addScaledVector(f, 6);
    } else if (this.view === "earthrise") {
      // Low over the Moon's limb, looking at the horizon while Earth climbs out from behind it.
      this.rise = Math.min(1, this.rise + dt / 9);
      const toE = new THREE.Vector3().sub(MOON_POS).normalize();
      const axis = new THREE.Vector3().crossVectors(toE, UP).normalize();
      // From 0.32 above the surface the limb dips about 26°, so Earth clears it once alpha is under ~116°.
      const alpha = (119 - 7.5 * smooth(this.rise)) * D2R;
      const n = toE.clone().applyAxisAngle(axis, alpha);
      want.copy(MOON_POS).addScaledVector(n, MOON_R + 0.32);
      look.copy(want).addScaledVector(toE, 50).addScaledVector(n, -2.6);
      fov = 16;
      this.cam.up.copy(n);
    } else {
      // Orbit/transfer: from the side and a little above, so the planet sits behind the ship. Drag swings around.
      const off = new THREE.Vector3().addScaledVector(side, 6.5).addScaledVector(UP, 2.4).addScaledVector(f, -1.5);
      off.applyAxisAngle(UP, this.yaw);
      off.applyAxisAngle(side, -this.pitch * 0.8);
      off.multiplyScalar(this.narrow);
      want.copy(this.shipPos).add(off);
      look.copy(this.shipPos).addScaledVector(f, 1.5);
    }
    if (this.view !== "earthrise") this.cam.up.lerp(UP, ease(dt, 3));
    const jump = this.cam.position.distanceTo(want) > 80;
    this.cam.position.lerp(want, jump ? 1 : ease(dt, this.view === "cockpit" ? 6 : 2.2));
    this.focus.lerp(look, jump ? 1 : ease(dt, 4));
    this.cam.lookAt(this.focus);
    if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov += (fov - this.cam.fov) * ease(dt, 3); this.cam.updateProjectionMatrix(); }

    // Ship billboard: face the camera, nose along the direction of travel as it appears on screen.
    const hide = this.view === "cockpit" || this.view === "earthrise" || this.view === "galaxy";
    this.ship.visible = !hide;
    this.ship.position.copy(this.shipPos);
    this.ship.quaternion.copy(this.cam.quaternion);
    const fc = f.clone().applyQuaternion(this.cam.quaternion.clone().invert());
    this.ship.rotateZ(Math.atan2(fc.y, fc.x) - Math.PI / 2);

    this.burn = Math.max(0, this.burn - dt);
    const firing = this.burn > 0 || this.burnHold;
    this.flame.visible = firing && !hide;
    if (this.flame.visible) {
      const s = 0.9 + Math.sin(t * 40) * 0.12 + Math.random() * 0.1;
      this.flame.position.copy(this.shipPos).addScaledVector(f, -1.3);
      this.flame.scale.set(s, s, 1);
      if (Math.random() < 0.6) this.puff(this.flame.position, f.clone().multiplyScalar(-3).add(new THREE.Vector3().randomDirection().multiplyScalar(0.4)), 0.4, 0.5, 0xffa040, 1.5);
    }

    // Water balls wobble; popped ones burst and vanish.
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.popping >= 0) {
        d.popping += dt;
        d.m.scale.setScalar(1 + d.popping * 6);
        if (d.popping > 0.12) { d.m.removeFromParent(); d.m.geometry.dispose(); this.drops.splice(i, 1); }
        continue;
      }
      const w = Math.sin(t * 4 + d.phase) * 0.09;
      d.m.scale.set(1 + w, 1 - w, 1 + w * 0.5);
      d.m.position.copy(d.base).add(new THREE.Vector3(Math.sin(t * 0.7 + d.phase) * 0.12, Math.sin(t * 0.9 + d.phase * 2) * 0.1, 0));
    }
    if (!this.drops.length) { const l = this.cockpit.getObjectByName("cabin"); if (l) l.removeFromParent(); }

    // Space rocks drift in from ahead until enough have been pushed away.
    if (this.rockGoal > 0 && this.rockPushed < this.rockGoal) {
      this.rockTimer -= dt;
      if (this.rockTimer <= 0 && this.rocks.filter((r) => !r.pushed).length < 3) { this.newRock(); this.rockTimer = 1.6; }
    }
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.m.position.addScaledVector(r.v, dt);
      r.m.rotation.x += r.spin.x * dt; r.m.rotation.y += r.spin.y * dt;
      if (!r.pushed && r.m.position.z > -6) r.m.position.x += Math.sign(r.m.position.x || 1) * dt * 3; // slide past the window, never into it
      if (r.m.position.z > 2 || r.m.position.length() > 90) { r.m.removeFromParent(); r.m.geometry.dispose(); this.rocks.splice(i, 1); }
    }

    this.onTelemetry?.({ u: this.u, alt: 0, vy: 0 });
  }

  private tickSurface(dt: number) {
    const ground0 = this.height(0, 0);

    // Lander physics: 1 unit = 1 metre, Moon gravity is real.
    if (!this.landed) {
      this.vy += (-G_MOON + (this.thrust ? 3.4 : 0)) * dt;
      this.vy = Math.min(this.vy, 1.5);
      this.alt += this.vy * dt;
      if (this.alt <= 0) {
        const speed = -this.vy;
        this.alt = 0; this.landed = true; this.thrust = false;
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2;
          this.puff(new THREE.Vector3(0, ground0 + 0.3, 0), new THREE.Vector3(Math.cos(a) * 6, 0.4 + Math.random(), Math.sin(a) * 6), 1.5, 2.2, 0xb8b2a8, 1.2, this.glowDust);
        }
        this.onTouch?.(speed);
      }
      this.onTelemetry?.({ u: 1, alt: this.alt, vy: this.vy });
    }
    this.lander.position.set(0, ground0 + this.alt, 0);
    const fireOn = this.thrust && !this.landed;
    this.landerFire.visible = fireOn;
    if (fireOn) {
      const s = 2.2 + Math.random() * 0.5;
      this.landerFire.position.set(0, ground0 + this.alt + 0.3, 0);
      this.landerFire.scale.set(s * 0.7, s, 1);
      if (this.alt < 16 && Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2, k = 1 - this.alt / 16;
        this.puff(new THREE.Vector3(Math.cos(a) * 1.5, ground0 + 0.3, Math.sin(a) * 1.5), new THREE.Vector3(Math.cos(a) * 9 * k, 0.3, Math.sin(a) * 9 * k), 1.2, 1.4, 0xb0aa9f, 1.4, this.glowDust);
      }
    }

    // Astronaut: fade in at the hatch, bound out with low-gravity hops, jump on request.
    const astroMat = this.astro.material as THREE.MeshBasicMaterial;
    if (this.walkT >= 0) {
      this.walkT += dt;
      const k = Math.min(1, this.walkT / 3.4);
      astroMat.opacity = Math.min(1, this.walkT * 2);
      const from = new THREE.Vector3(0.6, 0, 1.2);
      const pos = from.lerp(this.astroAt, smooth(k));
      pos.y = this.height(pos.x, pos.z) + Math.abs(Math.sin(k * Math.PI * 4)) * 0.55 * (1 - k * 0.3);
      this.astro.position.copy(pos);
      if (k >= 1) { this.walkT = -1; astroMat.opacity = 1; this.onWalked?.(); this.onWalked = null; }
    } else if (this.astro.visible) {
      if (this.airborne) {
        this.jumpV -= G_MOON * dt; this.jumpY += this.jumpV * dt;
        if (this.jumpY <= 0) {
          this.jumpY = 0; this.airborne = false;
          for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2;
            this.puff(this.astro.position.clone().setY(this.height(this.astroAt.x, this.astroAt.z) + 0.1), new THREE.Vector3(Math.cos(a) * 1.6, 0.25, Math.sin(a) * 1.6), 0.5, 1.4, 0xb8b2a8, 1.2, this.glowDust);
          }
          this.onJumpLand?.(); this.onJumpLand = null;
        }
      }
      this.astro.position.set(this.astroAt.x, this.height(this.astroAt.x, this.astroAt.z) + this.jumpY, this.astroAt.z);
    }

    // Billboards turn about the vertical to face the camera; shadows stretch away from the Sun.
    for (const [m, sh, h] of [[this.lander, this.landerShadow, 6], [this.astro, this.astroShadow, ASTRO_H]] as const) {
      m.rotation.y = Math.atan2(this.cam.position.x - m.position.x, this.cam.position.z - m.position.z);
      const gy = this.height(m.position.x, m.position.z);
      const len = Math.min(70, h / Math.tan(Math.max(1.5, Math.asin(this.sunDir.y) / D2R) * D2R));
      const lift = m.position.y - gy;
      sh.position.set(m.position.x, gy + 0.05, m.position.z);
      sh.rotation.y = Math.atan2(-this.sunDir.x, -this.sunDir.z);
      sh.scale.set(h * 0.45 * (1 + lift * 0.05), 1, len);
      (sh.material as THREE.MeshBasicMaterial).opacity = 0.7 / (1 + lift * 0.15);
    }

    // Flag: sinks into the dust, then the cloth swings from the push and settles. No wind, so it stays still.
    if (this.flagPole && this.flagCloth && this.flagT >= 0) {
      this.flagT += dt;
      const g = this.height(this.flagPole.position.x, this.flagPole.position.z) - 0.35;
      this.flagPole.position.y = this.flagT < 0.5 ? g + 3 * (1 - this.flagT / 0.5) ** 2 : g;
      const amp = this.flagT < 0.5 ? 0 : 0.12 * Math.exp(-(this.flagT - 0.5) * 0.9);
      const pos = this.flagCloth.geometry.attributes.position as THREE.BufferAttribute, base = this.flagCloth.userData.base as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        pos.setZ(i, amp * Math.sin(x * 4.5 - this.flagT * 7) * (x / 1.8));
      }
      pos.needsUpdate = true;
      this.flagCloth.geometry.computeVertexNormals();
      if (this.flagT > 0.5 && this.flagT - dt <= 0.5) {
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2;
          this.puff(this.flagPole.position.clone().setY(g + 0.4), new THREE.Vector3(Math.cos(a) * 1.4, 0.4, Math.sin(a) * 1.4), 0.4, 1.4, 0xb8b2a8, 1.2, this.glowDust);
        }
      }
    }

    // Camera: follow the lander down, then frame lander, astronaut and flag; drag swings around.
    const target = this.landed ? this.astroAt.clone().multiplyScalar(0.5).setY(ground0 + 2) : new THREE.Vector3(0, ground0 + this.alt + 2.5, 0);
    let from = this.camFrom.clone();
    if (!this.landed) from.y += this.alt * 0.85;
    else from.sub(target).multiplyScalar(0.72).add(target); // step in closer once down
    if (this.orbitCam > 0) {
      this.orbitCam += dt;
      from = from.sub(target).applyAxisAngle(UP, Math.sin(this.orbitCam * 0.25) * 0.5).multiplyScalar(0.8).add(target);
      from.y = Math.max(from.y, this.height(from.x, from.z) + 1.5);
    }
    from.sub(target).applyAxisAngle(UP, this.yaw).multiplyScalar(this.narrow ** 0.75).add(target);
    from.y += this.pitch * 6;
    from.y = Math.max(from.y, this.height(from.x, from.z) + 1.2);
    this.cam.position.lerp(from, ease(dt, 2));
    this.focus.lerp(target, ease(dt, 3));
    this.cam.up.copy(UP);
    this.cam.lookAt(this.focus);
    this.sunLight.position.copy(this.focus).addScaledVector(this.sunDir, 300);
    this.sunLight.target.position.copy(this.focus);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener("pointerdown", this.down);
    window.removeEventListener("pointermove", this.move);
    window.removeEventListener("pointerup", this.up);
    for (const sc of [this.space, this.surf]) sc?.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) mat.dispose();
    });
    for (const t of Object.values(this.textures)) t.dispose();
    this.env?.dispose();
    this.r.dispose();
  }
}
