/**
 * The three.js scene behind the globe. This is the only module that imports
 * three, and it is only ever loaded through a dynamic import.
 *
 * World axes are J2000 equatorial: +Z the celestial north pole, +X the vernal
 * equinox. The camera sits at the origin; stars, the Milky Way and every body
 * are drawn on (or scaled against) a sphere of radius SKY_RADIUS.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PerspectiveCamera,
  Points,
  RepeatWrapping,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from "three";
import { cross, normalize, scale as scaleVec, type Vec3, type ViewOffset } from "./camera";
import { BODY_MAGNIFICATION, MAPBOX_FOV_RAD, MAX_DPR, MIN_BODY_PX, SKY_RADIUS } from "./constants";
import { MOON_POLE, SATURN_POLE, type BodyId, type BodyState } from "./ephemeris";
import { BODY_FRAGMENT, BODY_VERTEX, SKY_FRAGMENT, SKY_VERTEX, STAR_FRAGMENT, STAR_VERTEX } from "./shaders";
import { SPECTRAL_RGB, type StarSet } from "./stars";

export type SceneScheme = "dark" | "light";

export type SpaceScene = {
  resize(width: number, height: number, dpr: number): void;
  setCamera(forward: Vec3, up: Vec3, view: ViewOffset): void;
  /** Place and size every body; `viewportHeightCss` converts pixel minimums into world units. */
  setBodies(states: readonly BodyState[], viewportHeightCss: number): void;
  setScheme(scheme: SceneScheme): void;
  loadMilkyWay(url: string): Promise<void>;
  loadMoonTexture(url: string): Promise<void>;
  render(): void;
  dispose(): void;
};

const DEG = Math.PI / 180;
const FOV_DEG = MAPBOX_FOV_RAD / DEG;

type BodyLook = { color: string; glow: string; ring?: boolean; pole?: Vec3; textured?: boolean };
const LOOKS: Record<BodyId, BodyLook> = {
  sun: { color: "#fff6dc", glow: "#ffd98a" },
  moon: { color: "#bdbdb6", glow: "#e8ecf2", pole: MOON_POLE, textured: true },
  mercury: { color: "#a89f93", glow: "#d9d0c4" },
  venus: { color: "#efe4c9", glow: "#fff3d0" },
  mars: { color: "#d2764b", glow: "#ff9b6a" },
  jupiter: { color: "#d8b792", glow: "#ffe1b8" },
  saturn: { color: "#e2cf9d", glow: "#fff0c0", ring: true, pole: SATURN_POLE },
  uranus: { color: "#9fd8e3", glow: "#bfeef5" },
  neptune: { color: "#5b7fe0", glow: "#8fb0ff" },
};

function glowTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(0.6, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.minFilter = LinearFilter;
  return tex;
}

function makeStars(stars: StarSet, pixelRatio: number): Points<BufferGeometry, ShaderMaterial> {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(stars.count * 3);
  const colors = new Float32Array(stars.count * 3);
  for (let i = 0; i < stars.count; i++) {
    positions[i * 3] = stars.positions[i * 3]! * SKY_RADIUS;
    positions[i * 3 + 1] = stars.positions[i * 3 + 1]! * SKY_RADIUS;
    positions[i * 3 + 2] = stars.positions[i * 3 + 2]! * SKY_RADIUS;
    const rgb = SPECTRAL_RGB[stars.classes[i]!] ?? SPECTRAL_RGB[7]!;
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aMag", new BufferAttribute(stars.mags, 1));
  const material = new ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: { uPixelRatio: { value: pixelRatio }, uIntensity: { value: 1 } },
    transparent: true,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1;
  return points;
}

function makeSky(): Mesh<BufferGeometry, ShaderMaterial> {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const material = new ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: { uMap: { value: null }, uInvViewProj: { value: new Matrix4() }, uIntensity: { value: 0 }, uRaFlip: { value: 1 } },
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return mesh;
}

type BodyNode = {
  id: BodyId;
  group: Group;
  sphere: Mesh<SphereGeometry, ShaderMaterial> | null;
  glow: Sprite;
  halo: Sprite | null;
  ring: Mesh<RingGeometry, MeshBasicMaterial> | null;
};

function makeBody(id: BodyId, glowMap: Texture): BodyNode {
  const look = LOOKS[id];
  const group = new Group();
  const glow = new Sprite(new SpriteMaterial({ map: glowMap, color: new Color(look.glow), transparent: true, blending: AdditiveBlending, depthTest: false, depthWrite: false }));
  glow.renderOrder = 2;
  group.add(glow);
  let sphere: BodyNode["sphere"] = null;
  let halo: BodyNode["halo"] = null;
  let ring: BodyNode["ring"] = null;
  if (id === "sun") {
    halo = new Sprite(new SpriteMaterial({ map: glowMap, color: new Color("#ffb45a"), transparent: true, opacity: 0.16, blending: AdditiveBlending, depthTest: false, depthWrite: false }));
    halo.renderOrder = 2;
    group.add(halo);
  } else {
    sphere = new Mesh(
      new SphereGeometry(1, 40, 24),
      new ShaderMaterial({
        vertexShader: BODY_VERTEX,
        fragmentShader: BODY_FRAGMENT,
        uniforms: {
          uToSun: { value: new Vector3(1, 0, 0) },
          uColor: { value: new Color(look.color) },
          uMap: { value: null },
          uHasMap: { value: 0 },
          uAmbient: { value: 0.06 },
        },
        depthTest: false,
        depthWrite: false,
      }),
    );
    sphere.renderOrder = 3;
    group.add(sphere);
    if (look.ring) {
      ring = new Mesh(new RingGeometry(1.25, 2.3, 96), new MeshBasicMaterial({ color: new Color("#cdbc93"), side: DoubleSide, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; // ring normal along the body's local +Y (its pole)
      ring.renderOrder = 3;
      group.add(ring);
    }
  }
  return { id, group, sphere, glow, halo, ring };
}

/** Orient a body so local +Y is its pole and the texture centre (local +X) faces Earth. */
function orient(group: Group, dir: Vec3, pole: Vec3 | undefined) {
  const toEarth = scaleVec(dir, -1);
  const y = pole ?? [0, 0, 1];
  const d = toEarth[0] * y[0] + toEarth[1] * y[1] + toEarth[2] * y[2];
  let x = normalize([toEarth[0] - y[0] * d, toEarth[1] - y[1] * d, toEarth[2] - y[2] * d]);
  if (x[0] === 0 && x[1] === 0 && x[2] === 0) x = normalize(cross(y, [1, 0, 0]));
  const z = cross(x, y);
  group.matrix.makeBasis(new Vector3(...x), new Vector3(...y), new Vector3(...z));
  group.matrix.setPosition(dir[0] * SKY_RADIUS, dir[1] * SKY_RADIUS, dir[2] * SKY_RADIUS);
  group.matrixAutoUpdate = false;
  group.matrixWorldNeedsUpdate = true;
}

async function loadTexture(url: string): Promise<Texture> {
  const tex = await new TextureLoader().loadAsync(url);
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = RepeatWrapping;
  return tex;
}

export function createSpaceScene(canvas: HTMLCanvasElement, stars: StarSet): SpaceScene {
  const renderer = new WebGLRenderer({ canvas, alpha: false, antialias: false, powerPreference: "low-power", stencil: false });
  renderer.setClearColor(new Color("#05090d"), 1);
  renderer.autoClear = true;
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV_DEG, 1, 1, SKY_RADIUS * 4);
  camera.position.set(0, 0, 0);

  let pixelRatio = 1;
  const starPoints = makeStars(stars, pixelRatio);
  const sky = makeSky();
  const glowMap = glowTexture();
  const bodies = new Map<BodyId, BodyNode>();
  for (const id of Object.keys(LOOKS) as BodyId[]) {
    const node = makeBody(id, glowMap);
    node.group.visible = false;
    bodies.set(id, node);
    scene.add(node.group);
  }
  scene.add(sky, starPoints);

  const invViewProj = new Matrix4();
  const textures: Texture[] = [glowMap];
  let viewportHeightCss = 1;
  let disposed = false;

  const worldPerPx = () => (2 * SKY_RADIUS * Math.tan(MAPBOX_FOV_RAD / 2)) / viewportHeightCss;

  return {
    resize(width, height, dpr) {
      pixelRatio = Math.min(dpr, MAX_DPR);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      starPoints.material.uniforms.uPixelRatio!.value = pixelRatio;
      viewportHeightCss = Math.max(1, height);
    },

    setCamera(forward, up, view) {
      const m = new Matrix4().lookAt(new Vector3(0, 0, 0), new Vector3(...forward), new Vector3(...up));
      camera.quaternion.setFromRotationMatrix(m);
      camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
    },

    setBodies(states, heightCss) {
      viewportHeightCss = Math.max(1, heightCss);
      const wpp = worldPerPx();
      const minAngular = MIN_BODY_PX * wpp; // world diameter for the pixel floor
      for (const s of states) {
        const node = bodies.get(s.id);
        if (!node) continue;
        node.group.visible = true;
        const look = LOOKS[s.id];
        orient(node.group, s.dir, look.pole);
        const trueDiameter = 2 * SKY_RADIUS * Math.tan((s.angularDiameterDeg * DEG) / 2);
        const diameter = Math.max(trueDiameter * BODY_MAGNIFICATION, minAngular);
        const radius = diameter / 2;
        if (node.sphere) {
          node.sphere.scale.setScalar(radius);
          node.sphere.material.uniforms.uToSun!.value.set(s.toSun[0], s.toSun[1], s.toSun[2]);
        }
        node.ring?.scale.setScalar(radius);
        // Glow: brighter bodies get a wider, stronger halo; the Sun keeps a deliberately restrained one.
        if (s.id === "sun") {
          node.glow.scale.setScalar(diameter * 1.15);
          node.glow.material.opacity = 0.95;
          node.halo?.scale.setScalar(diameter * 4.5);
        } else {
          const glowPx = Math.min(44, Math.max(10, 12 + 12 * (2 - s.mag)));
          node.glow.scale.setScalar(Math.max(glowPx * wpp, diameter * 1.6));
          node.glow.material.opacity = Math.min(0.7, Math.max(0.12, 0.22 + 0.14 * (2 - s.mag)));
        }
      }
    },

    setScheme(scheme) {
      // Space stays dark in both schemes; the light map just gets a slightly quieter field.
      starPoints.material.uniforms.uIntensity!.value = scheme === "dark" ? 1 : 0.85;
    },

    async loadMilkyWay(url) {
      const tex = await loadTexture(url);
      if (disposed) {
        tex.dispose();
        return;
      }
      textures.push(tex);
      sky.material.uniforms.uMap!.value = tex;
      sky.material.uniforms.uIntensity!.value = 1;
    },

    async loadMoonTexture(url) {
      const tex = await loadTexture(url);
      const moon = bodies.get("moon");
      if (disposed || !moon?.sphere) {
        tex.dispose();
        return;
      }
      textures.push(tex);
      moon.sphere.material.uniforms.uMap!.value = tex;
      moon.sphere.material.uniforms.uHasMap!.value = 1;
    },

    render() {
      if (disposed) return;
      invViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
      sky.material.uniforms.uInvViewProj!.value.copy(invViewProj);
      renderer.render(scene, camera);
    },

    dispose() {
      disposed = true;
      starPoints.geometry.dispose();
      starPoints.material.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
      for (const node of bodies.values()) {
        node.sphere?.geometry.dispose();
        node.sphere?.material.dispose();
        node.ring?.geometry.dispose();
        node.ring?.material.dispose();
        node.glow.material.dispose();
        node.halo?.material.dispose();
      }
      for (const t of textures) t.dispose();
      renderer.dispose();
    },
  };
}
