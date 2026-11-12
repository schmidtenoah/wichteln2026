/**
 * The reveal, in the same room as the landing picture.
 *
 * The camera is the Blender camera of the tree scene, so the live 3D gift
 * stands exactly where the rendered one stands in the picture. The page
 * zooms into the picture; this scene follows that zoom by cropping its view
 * (setViewOffset), which keeps both in register at every frame. The other
 * gifts are here too, invisible, as depth only: whatever stands in front of
 * your gift in the picture still covers it.
 *
 * Choreography: the bow is pulled loose and drops to the floor, the lid
 * trembles, pops and lands beside the box, light pours out, and the wish list
 * rises from the light. The paper tag and the wish list are HTML (the very
 * elements you saw), laid onto planes in this scene with a projective CSS
 * transform; the scene reports where their corners are on screen.
 *
 * The scene is built ahead of time (while the password is typed), so shader
 * compilation and texture uploads never land in an animation.
 */

import {
  Group, Mesh, Sprite, Points, InstancedMesh, Object3D, PlaneGeometry, BufferGeometry, BufferAttribute,
  MeshBasicMaterial, MeshStandardMaterial, SpriteMaterial, ShaderMaterial, PointLight, DirectionalLight, Vector3,
  AdditiveBlending, DoubleSide, CanvasTexture, TextureLoader, SRGBColorSpace, RepeatWrapping, PerspectiveCamera,
} from '../../vendor/three.min.js';
import {
  loadModel, cloneModel, createStage, canvasTexture, radialTexture,
  clamp01, range, easeOutCubic, easeOutQuint, easeInQuad, rand,
} from './assets.js';

/* Model proportions (from Blender, before the per-gift scale). */
const W = 1.6;
const H = 1.15;
const WALL = 0.07;
/* The room group's scale: gifts under the tree are 0.8 of the model. */
const U = 0.8;
/* Paper tag leaning against the box, and the wish list, in gift units. */
const TAG_W = 0.62;
const SHEET_W = 1.55;

/* Timeline in seconds, from the moment the tag has come to rest. */
const T = {
  nudge: 0,
  untie: 0.35,
  untie2: 0.85,
  bowOff: 1.3,
  bowLand: 1.95,
  anticipate: 1.95,
  pop: 2.45,
  lidLand: 3.5,
  rise: 2.65,
  riseEnd: 4.6,
};

/** Light rays fanning upward from a narrow base, softly blurred. */
function makeRays() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(10px)';
  for (const [spread, alpha] of [[-0.4, 0.16], [-0.2, 0.24], [-0.04, 0.2], [0.12, 0.26], [0.3, 0.18], [0.46, 0.12]]) {
    const g = ctx.createLinearGradient(0, 512, 0, 0);
    g.addColorStop(0, `rgba(255,228,170,${alpha * 2})`);
    g.addColorStop(0.5, `rgba(255,205,130,${alpha * 0.8})`);
    g.addColorStop(1, 'rgba(255,205,130,0)');
    ctx.fillStyle = g;
    const half = 12 + Math.abs(spread) * 18;
    ctx.beginPath();
    ctx.moveTo(128 + spread * 90 - 10, 512);
    ctx.lineTo(128 + spread * 260 - half, 0);
    ctx.lineTo(128 + spread * 260 + half, 0);
    ctx.lineTo(128 + spread * 90 + 10, 512);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** The glowing opening: an opaque, warm surface of light filling the box. */
function makeLightSurface() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#ffe2a8';
    ctx.fillRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.75);
    g.addColorStop(0, 'rgba(255,252,242,1)');
    g.addColorStop(0.6, 'rgba(255,244,214,0.75)');
    g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Sparks: one short burst that burns out completely. @param {number} count */
function buildSparks(count) {
  const geometry = new BufferGeometry();
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  geometry.setAttribute('aAlpha', new BufferAttribute(alpha, 1));
  const material = new ShaderMaterial({
    uniforms: { uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale / -mv.z;
        vAlpha = aAlpha;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = (1.0 - smoothstep(0.1, 0.5, d)) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.58) * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return { points, geometry, material, pos, size, alpha, vel: new Float32Array(count * 3), life: new Float32Array(count).fill(-1), max: new Float32Array(count) };
}

/** Smooth start and end. @param {number} u */
const easeInOutSine = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);

/** Parametric hop from a to b with an arc, for things that fall and land. */
function hop(out, a, b, u, height) {
  out.lerpVectors(a, b, u);
  out.y = a.y + (b.y - a.y) * easeInQuad(u) + height * 4 * u * (1 - u) * (1 - u * 0.35);
  return out;
}

/**
 * Build the reveal scene. Nothing moves until play().
 * @param {HTMLElement} container full-viewport element for the canvas
 * @param {{
 *   gift:{paper:number, ribbon:{color:number[], metalness:number, roughness:number}, scale:number[]},
 *   place:{x:number, z:number, yaw:number},
 *   others:{x:number, z:number, yaw:number, scale:number[]}[],
 *   view:{camera:number[], target:number[], vfov:number, aspect:number},
 *   onMoment?:(name:string)=>void, onFrame?:()=>void, lowPower?:boolean, still?:boolean
 * }} options
 */
export async function createGiftScene(container, { gift: design, place, others = [], view, onMoment = () => {}, onFrame = () => {}, lowPower = false, still = false }) {
  const source = await loadModel();
  const stage = createStage(container, { lowPower });
  const { renderer, scene } = stage;
  const textures = [];
  const extra = [];
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  // The Blender camera. `base` never moves; `camera` gets the zoom crop.
  const camera = new PerspectiveCamera(view.vfov, view.aspect, 0.5, 80);
  camera.position.fromArray(view.camera);
  camera.lookAt(new Vector3().fromArray(view.target));
  camera.updateMatrixWorld();
  const base = camera.clone();
  base.updateProjectionMatrix();

  // Light as in the Blender scene: warm key from above right, rim from behind left, soft fill from the front.
  scene.traverse((o) => {
    if (o.isDirectionalLight && o.intensity > 2) {
      o.position.set(2, 9, 3.2);
      o.intensity = 2.5;
    } else if (o.isDirectionalLight) {
      o.position.set(-5, 3.2, -4);
      o.intensity = 1.3;
    } else if (o.isHemisphereLight) o.intensity = 0.62;
  });
  const fill = new DirectionalLight('#f2ccbf', 0.7);
  fill.position.set(-1.5, 2, 7);
  scene.add(fill);

  // Everything of this gift lives in the room group, in gift units, centred on the gift.
  const room = new Group();
  room.position.set(place.x, 0, place.z);
  room.scale.setScalar(U);
  scene.add(room);
  room.updateMatrixWorld();

  const model = cloneModel(source);
  const get = (n) => model.get(n);
  const gift = get('Gift');
  const lid = get('Lid');
  const bow = get('Bow');
  const tails = [get('BowTailL'), get('BowTailR')];
  const loops = [get('BowLoopL'), get('BowLoopR')];
  const knot = get('BowKnot');
  room.add(gift);

  const [sx, sy, sz] = design.scale;
  gift.scale.set(sx, sy, sz);
  gift.rotation.y = place.yaw;
  const mat = (name) => model.materials.find((m) => m.name === name);
  const paper = mat('Geschenkpapier');
  const ribbon = mat('Satinband');
  ribbon.color.setRGB(...design.ribbon.color);
  ribbon.metalness = design.ribbon.metalness;
  ribbon.roughness = design.ribbon.roughness;
  const loader = new TextureLoader();
  const loadTex = (kind, srgb) =>
    loader.loadAsync(`models/papiere/papier${design.paper}_${kind}.webp`).then((t) => {
      t.flipY = false;
      t.wrapS = t.wrapT = RepeatWrapping;
      t.anisotropy = maxAniso;
      if (srgb) t.colorSpace = SRGBColorSpace;
      textures.push(t);
      return t;
    });
  try {
    const [color, orm, normal] = await Promise.all([loadTex('farbe', true), loadTex('orm', false), loadTex('normal', false)]);
    paper.map = color;
    paper.roughnessMap = orm;
    paper.metalnessMap = orm;
    paper.normalMap = normal;
    paper.needsUpdate = true;
  } catch {
    /* keep the paper from the model */
  }

  const depthOnly = new MeshBasicMaterial({ colorWrite: false });
  const giftSource = source.getObjectByName('Gift');

  // Where things go, worked out in the room's frame.
  const camLocal = room.worldToLocal(camera.position.clone());
  const toCam = new Vector3(camLocal.x, 0, camLocal.z).normalize();
  const around = (deg, radius) => toCam.clone().applyAxisAngle(new Vector3(0, 1, 0), (deg * Math.PI) / 180).multiplyScalar(radius);
  // Footprints on the floor, as circles (centre, radius) in gift units: nothing may land inside another.
  const HALF_DIAG = (W / 2) * Math.SQRT2;
  const obstacles = [{ c: new Vector3(), r: HALF_DIAG * Math.max(sx, sz) }].concat(
    others.map((o) => ({ c: new Vector3((o.x - place.x) / U, 0, (o.z - place.z) / U), r: (HALF_DIAG * Math.max(o.scale[0], o.scale[2])) / U }))
  );
  // In the picture, a spot must not lie behind one of the gifts standing in front of it:
  // something lying there would seem to sit on that gift.
  const camRight = new Vector3().setFromMatrixColumn(base.matrixWorld, 0);
  const proj = (w) => {
    const p = w.clone().project(base);
    return [(p.x + 1) / 2, (1 - p.y) / 2];
  };
  const rect = (pts) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const frontGifts = others.map((o) => {
    const hw = (W / 2) * Math.max(o.scale[0], o.scale[2]) * 1.1;
    const pts = [-1, 1].flatMap((x) => [-1, 1].flatMap((z) => [0, (H + 0.75) * o.scale[1]].map((y) => proj(new Vector3(o.x + x * hw, y, o.z + z * hw)))));
    const r = rect(pts);
    // A little room above it too: something lying just behind would seem to sit on it.
    r[1] -= (r[3] - r[1]) * 0.35;
    return { d: base.position.distanceTo(new Vector3(o.x, 0, o.z)) - hw * 0.9, r };
  });
  /** Whether something of radius r and height h at local point p would be hidden behind another gift. */
  /** How much of something of radius r and height h at local point p hides behind gifts in front (0..1). */
  const coverAt = (p, r, h) => {
    const w = room.localToWorld(p.clone());
    const d = base.position.distanceTo(w);
    const box = rect([proj(w.clone().addScaledVector(camRight, r * U)), proj(w.clone().addScaledVector(camRight, -r * U)), proj(w.clone().setY(h * U))]);
    const area = (box[2] - box[0]) * (box[3] - box[1]) || 1e-6;
    let cover = 0;
    for (const g of frontGifts) {
      if (g.d > d - 0.15) continue;
      const ix = Math.min(box[2], g.r[2]) - Math.max(box[0], g.r[0]);
      const iy = Math.min(box[3], g.r[3]) - Math.max(box[1], g.r[1]);
      if (ix > 0 && iy > 0) cover = Math.max(cover, (ix * iy) / area);
    }
    return Math.min(1, cover);
  };
  const hiddenAt = (p, r, h) => coverAt(p, r, h) > 0.08;

  /**
   * The nearest free spot for something of radius r: on a ring around the gift, not behind it,
   * clear of every footprint so far (with a little air), preferring the given angles.
   * @param {number} r
   * @param {(deg:number)=>number} prefer extra cost by angle (0 = ideal)
   */
  const freeSpot = (r, prefer, h = 0.3, shift = 0) => {
    let best = null;
    for (let deg = -125; deg <= 125; deg += 5) {
      for (let k = 0; k < 22; k++) {
        const radius = obstacles[0].r + r + 0.14 + k * 0.1;
        const p = around(deg, radius);
        const q = p.clone().addScaledVector(toCam, shift);
        if (!obstacles.every((o) => o.c.distanceTo(q) >= o.r + r + 0.1)) continue;
        // Hidden spots are allowed only if nothing better exists: being in view weighs most.
        const cover = coverAt(q, r, h);
        const cost = k * 0.1 + prefer(deg) + (cover > 0.08 ? 3 + cover * 6 : 0);
        if (!best || cost < best.cost) best = { p, cost };
        if (cover <= 0.08) break;
      }
    }
    return best?.p ?? around(0, obstacles[0].r + r + 2.4);
  };

  // The box face that looks at you: the tag leans there, on the half away from the lid.
  const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => {
    const n = new Vector3(x, 0, z).applyAxisAngle(new Vector3(0, 1, 0), place.yaw);
    return { n, half: (W / 2) * (x ? sx : sz), width: (W / 2) * (x ? sz : sx), score: n.dot(toCam) };
  });
  const face = faces.sort((a, b) => b.score - a.score)[0];
  const front = face.n;
  const along = new Vector3(front.z, 0, -front.x);
  // First the tag: it leans on the half of the front face that is better in view.
  const degOf = (p) => (Math.atan2(toCam.clone().cross(p).y, p.dot(toCam)) * 180) / Math.PI;
  const tagFoot = (side) => front.clone().multiplyScalar(face.half + 0.32).addScaledVector(along, side * 0.3);
  const tagSide = hiddenAt(tagFoot(1), 0.4, 0.8) && !hiddenAt(tagFoot(-1), 0.4, 0.8) ? -1 : 1;
  obstacles.push({ c: tagFoot(tagSide), r: 0.48 });
  const tagDeg = degOf(tagFoot(tagSide));
  // Then the loose ribbon of the untied bow: in front of the gift, near, on the other half from the tag.
  // It lands with its ends towards you; its footprint reaches that way (ends about 1 unit long).
  const RIBBON_R = 0.6 * Math.max(sx, sz);
  const RIBBON_SHIFT = 0.45 * Math.max(sx, sz);
  const bowTo = freeSpot(RIBBON_R, (deg) => (Math.sign(deg) === Math.sign(tagDeg) ? 0.6 : 0) + Math.abs(Math.abs(deg) - 25) * 0.012 + (Math.abs(deg) > 70 ? 1 : 0), 0.12, RIBBON_SHIFT);
  obstacles.push({ c: bowTo.clone().addScaledVector(toCam, RIBBON_SHIFT), r: RIBBON_R });
  bowTo.y = 0.03;
  const ribbonYaw = Math.atan2(toCam.x, toCam.z);
  // Last the lid: beside the box (seen from you), never behind it, clear of everything above.
  const LID_R = (1.72 / 2) * Math.SQRT2 * Math.max(sx, sz);
  const ribbonDeg = degOf(bowTo);
  const lidTo = freeSpot(LID_R, (deg) => Math.abs(Math.abs(deg) - 70) * 0.012 + (Math.sign(deg) === Math.sign(ribbonDeg) ? 0.3 : 0), 0.4 * sy);
  obstacles.push({ c: lidTo.clone(), r: LID_R });
  lidTo.y = 0.16 * sy;

  // The other gifts, as depth only: where they stand in front of yours in the picture, they hide it.
  // Only those that overlap the part of the picture where something happens, and only their solid
  // parts (box, lid, bow); the flat ribbons lie on the box anyway.
  const occluders = (() => {
    const box2d = (pts) => {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    };
    const project = (w) => {
      const p = w.clone().project(base);
      return [(p.x + 1) / 2, (1 - p.y) / 2];
    };
    const toWorld = (l) => room.localToWorld(l.clone());
    const action = box2d(
      [
        ...[-1, 1].flatMap((x) => [-1, 1].flatMap((z) => [0, H * sy + 1.6].map((y) => new Vector3((x * W * sx) / 2 + x * 0.3, y, (z * W * sz) / 2 + z * 0.3)))),
        lidTo.clone().add(new Vector3(1, 0.4, 1)), lidTo.clone().add(new Vector3(-1, 0.4, -1)),
        bowTo.clone().add(new Vector3(0.7, 0.6, 0.7)), bowTo.clone().add(new Vector3(-0.7, 0.6, -0.7)),
        front.clone().multiplyScalar(face.half + 1.2),
      ].map((l) => project(toWorld(l)))
    );
    const ours = camera.position.distanceTo(room.position);
    const keep = /^(Body|LidShell|BowLoop|BowKnot|BowTail)/;
    return others
      .filter((o) => {
        const centre = new Vector3(o.x, 0, o.z);
        if (camera.position.distanceTo(centre) > ours + 1.5) return false;
        const hw = 0.95 * Math.max(o.scale[0], o.scale[2]);
        const b = box2d([-1, 1].flatMap((x) => [-1, 1].flatMap((z) => [0, (H + 0.9) * o.scale[1]].map((y) => project(new Vector3(o.x + x * hw, y, o.z + z * hw))))));
        return b[0] < action[2] && b[2] > action[0] && b[1] < action[3] && b[3] > action[1];
      })
      .map((o) => {
        const g = giftSource.clone(true);
        const drop = [];
        g.traverse((m) => {
          if (!m.isMesh) return;
          if (!keep.test(m.name)) drop.push(m);
          m.material = depthOnly;
          m.renderOrder = -1;
        });
        drop.forEach((m) => m.removeFromParent());
        g.position.set(o.x, 0, o.z);
        g.rotation.y = o.yaw;
        g.scale.fromArray(o.scale);
        scene.add(g);
        return g;
      });
  })();

  // Soft contact shadows for everything that rests on the floor.
  const shadowTex = radialTexture(['rgba(18,2,5,0.62)', 'rgba(18,2,5,0.26)', 'rgba(18,2,5,0)']);
  textures.push(shadowTex);
  const blob = (w, d = w) => {
    const m = new Mesh(new PlaneGeometry(w, d), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.003;
    room.add(m);
    extra.push(m);
    return m;
  };
  const giftShadow = blob(2.6 * Math.max(sx, sz));
  const lidShadow = blob(2.0 * Math.max(sx, sz));
  const bowShadow = blob(1.0);
  const tagShadow = blob(TAG_W * 1.4, 0.55);
  lidShadow.material.opacity = 0;
  bowShadow.material.opacity = 0;
  tagShadow.material.opacity = 0;

  // The tag plane (the HTML tag is laid onto it). Its height follows the tag's own proportions.
  const tag = { aspect: 1.5, matrix: null, h: TAG_W * 1.5 };
  const up = new Vector3(0, 1, 0);
  function placeTag() {
    const th = TAG_W * tag.aspect;
    tag.h = th;
    const lean = Math.min(0.62, Math.max(0.3, Math.acos(Math.min(1, (H * sy * 0.94) / th))));
    const normal = front.clone().multiplyScalar(Math.cos(lean)).addScaledVector(up, Math.sin(lean));
    const tagUp = up.clone().multiplyScalar(Math.cos(lean)).addScaledVector(front, -Math.sin(lean));
    const right = tagUp.clone().cross(normal);
    const foot = front.clone().multiplyScalar(face.half + Math.sin(lean) * th + 0.02).addScaledVector(along, tagSide * Math.min(0.32, face.width - TAG_W / 2));
    const centre = foot.clone().addScaledVector(tagUp, th / 2).addScaledVector(normal, 0.004);
    tag.centre = centre;
    tag.right = right;
    tag.up = tagUp;
    tagShadow.position.copy(front.clone().multiplyScalar(face.half + Math.sin(lean) * th * 0.5).addScaledVector(along, tagSide * 0.3)).setY(0.004);
    tagShadow.rotation.z = Math.atan2(front.x, front.z);
  }
  placeTag();

  // The wish list plane: faces you, rises from the box.
  const sheet = { aspect: 1.32, visible: false, clip: 1, glow: 1, centre: new Vector3(), right: new Vector3(), up: new Vector3() };

  // Light pouring out: an opaque surface of light in the opening, rays, one point light.
  const surfaceTex = makeLightSurface();
  const surface = new Mesh(
    new PlaneGeometry(W - WALL * 2 + 0.01, W - WALL * 2 + 0.01),
    new MeshBasicMaterial({ map: surfaceTex, transparent: true, opacity: 0, toneMapped: false, depthWrite: false })
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = H - 0.035;
  surface.renderOrder = 2;
  gift.add(surface);
  const raysTex = makeRays();
  const rays = new Sprite(new SpriteMaterial({ map: raysTex, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  rays.center.set(0.5, 0.02);
  room.add(rays);
  const glow = new PointLight('#ffc983', 0, 5, 2);
  room.add(glow);
  textures.push(surfaceTex, raysTex);
  extra.push(surface, rays);

  // Sparks and foil confetti.
  const sparkCount = lowPower ? 70 : 120;
  const sparks = buildSparks(sparkCount);
  room.add(sparks.points);
  extra.push(sparks.points);
  const foil = new MeshStandardMaterial({ color: '#e5c070', metalness: 1, roughness: 0.25, side: DoubleSide });
  const confettiCount = lowPower ? 50 : 90;
  const confetti = {
    mesh: new InstancedMesh(new PlaneGeometry(0.07, 0.042), foil, confettiCount),
    pos: new Float32Array(confettiCount * 3),
    vel: new Float32Array(confettiCount * 3),
    rot: new Float32Array(confettiCount * 3),
    spin: new Float32Array(confettiCount * 3),
    landed: new Uint8Array(confettiCount),
  };
  confetti.mesh.count = 0;
  confetti.mesh.frustumCulled = false;
  room.add(confetti.mesh);
  extra.push(confetti.mesh);
  const dummy = new Object3D();

  // State.
  const lidRest = lid.position.clone();
  const bowRest = bow.position.clone();
  const v = new Vector3();
  let bowFlight = null;
  let lidFlight = null;
  let fired = new Set();
  let raf = 0;
  let started = 0;
  let last = 0;
  let paused = false;
  let playing = false;
  let disposed = false;
  let time = 0;
  let pixelRatio = renderer.getPixelRatio();
  let slow = 0;
  let frames = 0;
  let viewRect = null;

  const size = () => ({ w: container.clientWidth || window.innerWidth, h: container.clientHeight || window.innerHeight });

  /** @param {string} name */
  function moment(name) {
    if (fired.has(name)) return;
    fired.add(name);
    onMoment(name);
  }

  /** Burst from the opening. */
  function burst() {
    const top = H * sy;
    for (let i = 0; i < sparkCount; i++) {
      const p = i * 3;
      sparks.pos[p] = rand(-0.5, 0.5) * sx;
      sparks.pos[p + 1] = top;
      sparks.pos[p + 2] = rand(-0.5, 0.5) * sz;
      sparks.vel[p] = rand(-1.4, 1.4) + sparks.pos[p];
      sparks.vel[p + 1] = rand(2.4, 5.2);
      sparks.vel[p + 2] = rand(-1.4, 1.4) + sparks.pos[p + 2];
      sparks.life[i] = 0;
      sparks.max[i] = rand(0.9, 1.9);
      sparks.size[i] = rand(0.025, 0.06);
    }
    confetti.mesh.count = confettiCount;
    for (let i = 0; i < confettiCount; i++) {
      const p = i * 3;
      confetti.pos[p] = rand(-0.5, 0.5) * sx;
      confetti.pos[p + 1] = top + 0.05;
      confetti.pos[p + 2] = rand(-0.5, 0.5) * sz;
      confetti.vel[p] = rand(-1.6, 1.6) + confetti.pos[p];
      confetti.vel[p + 1] = rand(2.6, 5);
      confetti.vel[p + 2] = rand(-1.6, 1.6) + confetti.pos[p + 2];
      confetti.rot.set([rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)], p);
      confetti.spin.set([rand(-9, 9), rand(-9, 9), rand(-9, 9)], p);
      confetti.landed[i] = 0;
    }
  }

  /** @param {number} dt */
  function updateSparks(dt) {
    let any = false;
    for (let i = 0; i < sparkCount; i++) {
      const p = i * 3;
      if (sparks.life[i] < 0) {
        sparks.alpha[i] = 0;
        continue;
      }
      any = true;
      sparks.life[i] += dt;
      const age = sparks.life[i] / sparks.max[i];
      if (age >= 1) {
        sparks.life[i] = -1;
        sparks.alpha[i] = 0;
        continue;
      }
      const k = Math.pow(0.97, dt * 60);
      sparks.vel[p] *= k;
      sparks.vel[p + 2] *= k;
      sparks.vel[p + 1] = sparks.vel[p + 1] * k - 2.2 * dt;
      sparks.pos[p] += sparks.vel[p] * dt;
      sparks.pos[p + 1] += sparks.vel[p + 1] * dt;
      sparks.pos[p + 2] += sparks.vel[p + 2] * dt;
      sparks.alpha[i] = clamp01(sparks.life[i] / 0.08) * (1 - age) ** 1.6;
    }
    if (any) for (const n of ['position', 'aAlpha', 'aSize']) sparks.geometry.attributes[n].needsUpdate = true;
  }

  /** Whether a floor point lies inside a footprint other than the gift's own. */
  const blocked = (x, z) => obstacles.slice(1).some((o) => Math.hypot(o.c.x - x, o.c.z - z) < o.r * 0.92);

  /** @param {number} dt */
  function updateConfetti(dt) {
    const c = confetti;
    if (!c.mesh.count) return;
    const k = Math.pow(0.975, dt * 60);
    const hx = (W / 2) * sx;
    const hz = (W / 2) * sz;
    const ca = Math.cos(-place.yaw);
    const sa = Math.sin(-place.yaw);
    let moving = false;
    for (let i = 0; i < c.mesh.count; i++) {
      if (c.landed[i]) continue;
      const p = i * 3;
      moving = true;
      c.vel[p] *= k;
      c.vel[p + 2] *= k;
      c.vel[p + 1] = Math.max(c.vel[p + 1] * k - 2.3 * dt, -1.1);
      c.pos[p] += c.vel[p] * dt;
      c.pos[p + 1] += c.vel[p + 1] * dt;
      c.pos[p + 2] += c.vel[p + 2] * dt;
      for (let a = 0; a < 3; a++) c.rot[p + a] += c.spin[p + a] * dt;
      // In the box frame: pieces that fall back into the box vanish in the light; the rest settle on the floor.
      const lx = c.pos[p] * ca - c.pos[p + 2] * sa;
      const lz = c.pos[p] * sa + c.pos[p + 2] * ca;
      const inside = Math.abs(lx) < hx + 0.05 && Math.abs(lz) < hz + 0.05;
      if (inside && c.pos[p + 1] < H * sy && c.vel[p + 1] < 0) c.landed[i] = 2;
      if (!inside && c.pos[p + 1] <= 0.008 && c.vel[p + 1] < 0 && blocked(c.pos[p], c.pos[p + 2])) {
        c.landed[i] = 2;
      } else if (!inside && c.pos[p + 1] <= 0.008 && c.vel[p + 1] < 0) {
        c.pos[p + 1] = 0.008;
        c.landed[i] = 1;
        c.rot[p] = -Math.PI / 2;
        c.rot[p + 2] = 0;
      }
      dummy.position.set(c.pos[p], c.pos[p + 1], c.pos[p + 2]);
      dummy.rotation.set(c.rot[p], c.rot[p + 1], c.rot[p + 2]);
      dummy.scale.setScalar(c.landed[i] === 2 ? 0.0001 : 1);
      dummy.updateMatrix();
      c.mesh.setMatrixAt(i, dummy.matrix);
    }
    if (moving) c.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Pose of the wish list at time t: it rises out of the light, turning to face
   * you, and then hovers above the open box.
   * @param {number} t
   */
  function posSheet(t) {
    const rim = H * sy;
    const sh = SHEET_W * sheet.aspect;
    const e = easeOutQuint(range(t, T.rise, T.riseEnd));
    const hover = t > T.riseEnd ? Math.sin((t - T.riseEnd) * 1.2) * 0.035 : 0;
    // Facing the camera, leaning back a little less than the view angle.
    const centreEnd = new Vector3(0, rim + 0.28 + sh / 2, 0).addScaledVector(toCam, 0.35);
    const n = camLocal.clone().sub(centreEnd).normalize();
    const flat = new Vector3(n.x, 0, n.z).normalize();
    const facing = flat.clone().multiplyScalar(Math.cos(Math.asin(n.y) * 0.85)).setY(Math.sin(Math.asin(n.y) * 0.85)).normalize();
    // While rising it is still turned away a bit and stands upright.
    const turn = (1 - e) * 1.1 + Math.sin(t * 0.5) * 0.04 * e;
    const normal = new Vector3(facing.x, facing.y * e, facing.z).normalize().applyAxisAngle(up, turn);
    const right = up.clone().cross(normal).normalize();
    const sUp = normal.clone().cross(right).normalize();
    const startY = rim - (sh / 2) * sUp.y - 0.04;
    sheet.centre.set(centreEnd.x * e, startY + (centreEnd.y - startY) * e + hover, centreEnd.z * e);
    sheet.right.copy(right);
    sheet.up.copy(sUp);
    // Below the rim the list is still inside the box.
    const bottom = sheet.centre.y - (sh / 2) * sUp.y;
    sheet.clip = clamp01((rim - 0.02 - bottom) / (sh * sUp.y));
    sheet.glow = 1 - 0.8 * easeOutCubic(range(t, T.rise + 0.5, T.riseEnd + 0.6));
    sheet.visible = t > T.rise;
  }

  /**
   * Pose everything for time t.
   * @param {number} t
   * @param {number} dt
   */
  function update(t, dt) {
    time = t;
    // A small jolt as the tag arrives, then the anticipation before the pop.
    let squash = 1 - 0.035 * Math.exp(-7 * t) * Math.sin(16 * t);
    const ant = range(t, T.anticipate, T.pop);
    if (ant > 0 && t < T.pop) squash *= 1 - 0.04 * easeInQuad(ant);
    if (t >= T.pop) squash *= 1 + 0.06 * Math.exp(-6 * (t - T.pop)) * Math.sin(16 * (t - T.pop));
    gift.scale.set(sx / Math.sqrt(squash), sy * squash, sz / Math.sqrt(squash));

    // Bow: untied like a real one. The right end is pulled out, its loop slips through the knot;
    // then the left. What is left is a loose, flat ribbon that slides off the lid and lands flat.
    const a = easeInOutSine(range(t, T.untie, T.untie2 + 0.1));
    const b = easeInOutSine(range(t, T.untie2, T.bowOff));
    if (a > 0) moment('untie');
    if (!bowFlight) {
      const [loopL, loopR] = loops;
      const [tailL, tailR] = tails;
      // A loop being pulled through: it narrows, shrinks into the knot and leans towards it.
      const slip = (loop, u, dir) => {
        loop.visible = u < 0.985;
        loop.scale.set(1 - 0.9 * u, 1 - 0.95 * u, 1 - 0.55 * u);
        loop.rotation.set(0, 0, dir * 0.35 * Math.sin(u * Math.PI));
      };
      slip(loopR, a, 1);
      slip(loopL, b, -1);
      // The ends: the pulled one stretches out and swings a little, the other follows later.
      tailR.scale.z = 1 + 0.75 * a + 0.2 * b;
      tailR.rotation.y = -0.22 * Math.sin(a * Math.PI) - 0.12 * a;
      tailL.scale.z = 1 + 0.5 * b;
      tailL.rotation.y = 0.18 * Math.sin(b * Math.PI) + 0.08 * b;
      // The knot loosens and turns as the ribbon runs through it; the bow tugs up with each pull.
      knot.scale.setScalar(1 - 0.25 * a - 0.2 * b);
      knot.rotation.y = 0.5 * a - 0.3 * b;
      bow.position.y = bowRest.y + 0.045 * Math.sin(a * Math.PI) + 0.035 * Math.sin(b * Math.PI);
      bow.rotation.z = 0.06 * Math.sin(a * Math.PI) - 0.05 * Math.sin(b * Math.PI);
    }
    if (t >= T.bowOff && !bowFlight) {
      room.attach(bow);
      // Turn the shortest way to lie with its ends towards you.
      const r0 = bow.rotation.y;
      const turn = Math.atan2(Math.sin(ribbonYaw - r0), Math.cos(ribbonYaw - r0));
      bowFlight = { from: bow.position.clone(), to: bowTo, rot0: bow.rotation.clone(), spin: turn };
    }
    if (bowFlight) {
      // It slides off the edge first, then drops, settling flat on the floor.
      const u = range(t, T.bowOff, T.bowLand);
      const e = easeInOutSine(u);
      // Let go of, the stretched ends shorten again.
      tails[1].scale.z = 1.95 - 0.6 * e;
      tails[0].scale.z = 1.5 - 0.3 * e;
      tails[1].rotation.y *= 0.9;
      tails[0].rotation.y *= 0.9;
      hop(bow.position, bowFlight.from, bowFlight.to, e, 0.32);
      const flat = easeOutCubic(range(u, 0.35, 1));
      bow.rotation.set(
        bowFlight.rot0.x * (1 - flat) + Math.sin(u * Math.PI) * 0.35,
        bowFlight.rot0.y + bowFlight.spin * e,
        bowFlight.rot0.z * (1 - flat) + Math.sin(u * Math.PI) * 0.25
      );
      if (u >= 1) {
        moment('bow-land');
        const s = t - T.bowLand;
        bow.position.y = bowFlight.to.y + Math.abs(Math.sin(s * 16)) * 0.025 * Math.exp(-9 * s);
      }
      bowShadow.position.set(bow.position.x, 0.004, bow.position.z);
      bowShadow.material.opacity = 0.7 * clamp01(1 - bow.position.y / 1.5);
    }

    // Lid: trembles, pops, tumbles once and lands beside the box.
    if (!lidFlight) {
      lid.position.y = lidRest.y + (ant > 0 ? 0.025 * ant + Math.abs(Math.sin(t * 36)) * 0.018 * ant : 0);
      lid.rotation.z = ant > 0 ? Math.sin(t * 31) * 0.03 * ant : 0;
      lid.rotation.x = ant > 0 ? Math.sin(t * 27 + 1) * 0.02 * ant : 0;
    }
    if (t >= T.pop && !lidFlight) {
      moment('pop');
      room.attach(lid);
      lidFlight = { from: lid.position.clone(), to: lidTo, rot0: lid.rotation.clone() };
      burst();
    }
    if (lidFlight) {
      const u = range(t, T.pop, T.lidLand);
      hop(lid.position, lidFlight.from, lidFlight.to, u, 1.4);
      const turn = easeOutCubic(u);
      lid.rotation.set(lidFlight.rot0.x - turn * Math.PI * 2, lidFlight.rot0.y + turn * 0.9, lidFlight.rot0.z * (1 - u) + Math.sin(u * Math.PI) * 0.35);
      if (u >= 1) {
        moment('lid-land');
        const s = t - T.lidLand;
        lid.position.y = lidFlight.to.y + Math.abs(Math.sin(s * 12)) * 0.07 * Math.exp(-6 * s);
      }
      lidShadow.position.set(lid.position.x, 0.004, lid.position.z);
      lidShadow.material.opacity = 0.85 * clamp01(1 - (lid.position.y - lidFlight.to.y) / 2);
    }

    // Light: a seam during the tremble, then a steady glow that breathes.
    const top = H * sy * squash;
    const open = t >= T.pop ? easeOutCubic(range(t, T.pop + 0.05, T.pop + 0.95)) : 0;
    const breathe = 1 + Math.sin(t * 1.7) * 0.04;
    surface.material.opacity = open * 0.94;
    glow.intensity = (t < T.pop ? ant * 2 : open * 5) * breathe;
    glow.position.set(0, top + 0.6, 0).addScaledVector(toCam, 0.35);
    const rayU = easeOutCubic(range(t, T.pop + 0.15, T.pop + 1.4));
    rays.position.set(0, top - 0.02, 0);
    rays.scale.set(0.6 + 2.4 * rayU, 0.01 + 4 * rayU, 1);
    rays.material.opacity = 0.3 * rayU * breathe;

    if (t > T.rise) moment('magazine');
    if (t >= T.riseEnd) moment('ready');
    posSheet(t);
  }

  /** Frames slower than ~45 fps for a while: draw fewer pixels (never below 1). @param {number} dt */
  const floorRatio = Math.min(window.devicePixelRatio || 1, 1);
  function adapt(dt) {
    if (pixelRatio <= floorRatio) return;
    frames++;
    if (dt > 1 / 45) slow++;
    if (frames < 24) return;
    if (slow > 8) {
      pixelRatio = Math.max(floorRatio, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      resize();
    }
    frames = 0;
    slow = 0;
  }

  /** Canvas size, and the crop that keeps the 3D view on top of the picture. */
  function resize() {
    const { w, h } = size();
    renderer.setSize(w, h, false);
    if (viewRect) applyView();
  }

  function applyView() {
    const { w, h } = size();
    const r = viewRect;
    camera.aspect = view.aspect;
    camera.setViewOffset(r.width, r.height, -r.left, -r.top, w, h);
    camera.updateProjectionMatrix();
    sparks.material.uniforms.uScale.value = (renderer.getPixelRatio() * r.height) / (2 * Math.tan((view.vfov * Math.PI) / 360)) * U;
  }

  /** Screen point of a room-local point. */
  function screen(local) {
    const { w, h } = size();
    v.copy(local).applyMatrix4(room.matrixWorld).project(camera);
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
  }

  /** Point of a room-local point in the uncropped picture, as fractions. */
  function imagePoint(local) {
    v.copy(local).applyMatrix4(room.matrixWorld).project(base);
    return [(v.x + 1) / 2, (1 - v.y) / 2];
  }

  /** Corners of a plane (centre, right, up, w, h) on screen: top left, top right, bottom right, bottom left. */
  function planeCorners(c, right, upv, w, h) {
    return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => screen(c.clone().addScaledVector(right, (x * w) / 2).addScaledVector(upv, (y * h) / 2)));
  }

  let lastDraw = 0;
  function render() {
    const now = performance.now();
    const gap = now - lastDraw;
    lastDraw = now;
    if (gap < 250) adapt(gap / 1000);
    renderer.render(scene, camera);
    onFrame();
  }

  /** @param {number} now */
  function frame(now) {
    if (disposed || paused) return;
    raf = requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    const dt = Math.min(rawDt, 1 / 30);
    last = now;
    const t = (now - started) / 1000;
    update(t, dt);
    updateSparks(dt);
    updateConfetti(dt);
    render();
  }

  /** End state for reduced motion: walk the timeline silently, draw once. */
  function drawStill() {
    const silent = onMoment;
    onMoment = () => {};
    for (let s = 0; s <= T.riseEnd + 1; s += 0.05) update(s, 0.05);
    onMoment = silent;
    sparks.alpha.fill(0);
    sparks.geometry.attributes.aAlpha.needsUpdate = true;
    confetti.mesh.count = 0;
    tagShadow.material.opacity = 0.5;
    render();
  }

  const ro = new ResizeObserver(() => {
    resize();
    if (!paused) render();
  });
  ro.observe(container);
  resize();
  update(0, 0);
  sheet.visible = false;

  // Warm up now, while nobody is watching: every shader, every texture on the GPU.
  {
    confetti.mesh.count = 1;
    const was = { lid: lidShadow.material.opacity };
    lidShadow.material.opacity = 0.5;
    try {
      if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
    } catch {
      renderer.compile(scene, camera);
    }
    textures.forEach((tex) => renderer.initTexture?.(tex));
    confetti.mesh.count = 0;
    lidShadow.material.opacity = was.lid;
  }

  return {
    /**
     * Follow the picture: where the full render is on screen right now (it may be zoomed far beyond the viewport).
     * @param {{left:number, top:number, width:number, height:number}} rect
     */
    setView(rect) {
      viewRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      applyView();
    },

    /** Draw one picture now (while the page zooms, before play). */
    render,

    /**
     * Points that must be in frame once everything has happened (gift, lid, bow, tag, the hovering list),
     * as fractions of the full render.
     * @returns {number[][]}
     */
    keyPoints() {
      const sh = SHEET_W * sheet.aspect;
      const rim = H * sy;
      const top = new Vector3(0, rim + 0.28 + sh + 0.15, 0).addScaledVector(toCam, 0.35);
      const pts = [new Vector3(0, 0, 0), top, top.clone().addScaledVector(along, SHEET_W / 2 + 0.1), top.clone().addScaledVector(along, -SHEET_W / 2 - 0.1)];
      // The lid and the bow may lie at the edge of the picture; the list and the gift come first.
      const outward = (p, r) => p.clone().setY(0).addScaledVector(p.clone().setY(0).normalize(), r);
      pts.push(outward(lidTo, LID_R * 0.75), outward(bowTo, RIBBON_R), bowTo.clone().addScaledVector(toCam, RIBBON_SHIFT + RIBBON_R));
      pts.push(tag.centre.clone().addScaledVector(up, -tag.h / 2 - 0.3).addScaledVector(front, 0.2));
      return pts.map(imagePoint);
    },

    /** The gift's footprint in the picture, as fractions [x, y]. */
    giftPoint() {
      return imagePoint(new Vector3(0, H * sy * 0.5, 0));
    },

    /** Proportions of the HTML tag (height / width), so the plane matches it. @param {number} a */
    setTagAspect(a) {
      tag.aspect = a;
      placeTag();
    },

    /** Proportions of the HTML wish list (height / width). @param {number} a */
    setSheetAspect(a) {
      sheet.aspect = a;
      posSheet(time);
    },

    /** The four corners of the tag on screen (top left, top right, bottom right, bottom left). */
    tagCorners() {
      room.updateMatrixWorld();
      return planeCorners(tag.centre, tag.right, tag.up, TAG_W, tag.h);
    },

    /** The tag lies there now: its shadow appears. */
    showTag() {
      tagShadow.material.opacity = 0.5;
      if (!playing) render();
    },

    /**
     * The wish list right now: corners on screen, how much is still inside the box (from the bottom), how much light is on it.
     * @returns {{visible:boolean, corners:number[][], clip:number, glow:number}}
     */
    sheetState() {
      return { visible: sheet.visible, corners: planeCorners(sheet.centre, sheet.right, sheet.up, SHEET_W, SHEET_W * sheet.aspect), clip: sheet.clip, glow: sheet.glow };
    },

    /**
     * Screen corners of a rectangle on the wish list's plane, in fractions of the card
     * (0,0 = top left, 1,1 = bottom right; values outside reach beyond the card).
     */
    sheetRect(u0, v0, u1, v1) {
      room.updateMatrixWorld();
      const sh = SHEET_W * sheet.aspect;
      const at = (u, v) => screen(sheet.centre.clone().addScaledVector(sheet.right, (u - 0.5) * SHEET_W).addScaledVector(sheet.up, (0.5 - v) * sh));
      return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
    },

    /** Whether the scene draws by itself right now. */
    get running() {
      return playing && !paused && !disposed && !still;
    },

    /** Start the choreography. */
    play() {
      playing = true;
      if (still) {
        drawStill();
        onMoment('ready');
        return;
      }
      started = last = performance.now();
      fired = new Set();
      raf = requestAnimationFrame(frame);
    },

    /** Stop drawing (the last picture stays on screen). */
    pause() {
      paused = true;
      cancelAnimationFrame(raf);
    },
    resume() {
      if (!paused || disposed) return;
      paused = false;
      if (!playing) return;
      if (still) {
        drawStill();
        return;
      }
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },

    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      extra.forEach((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
      model.materials.forEach((m) => m.dispose());
      occluders.forEach((g) => scene.remove(g));
      depthOnly.dispose();
      foil.dispose();
      textures.forEach((t) => t.dispose());
      stage.dispose();
    },
  };
}
