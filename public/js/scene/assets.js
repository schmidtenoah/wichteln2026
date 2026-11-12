/**
 * Shared 3D setup: the Blender model (models/wichteln.glb), a renderer with
 * soft studio reflections, warm lights, and small helpers both scenes use.
 *
 * The model was built in Blender (blender/wichteln-modelle.blend) with
 * bevels and subdivision surfaces and exported with meshopt compression.
 * Node names: Gift > Body, BodyRibbonA/B, Lid > LidShell, LidRibbonA/B,
 * Bow > BowKnot, BowLoopL/R, BowTailL/R; plus a separate Star.
 */

import {
  WebGLRenderer, Scene, PerspectiveCamera, PMREMGenerator, DirectionalLight, HemisphereLight,
  CanvasTexture, NeutralToneMapping, SRGBColorSpace, RoomEnvironment, GLTFLoader, MeshoptDecoder,
} from '../../vendor/three.min.js';

const MODEL_URL = new URL('../../models/wichteln.glb', import.meta.url).href;
let modelPromise = null;

/**
 * Load the model once; every scene clones from it.
 * @returns {Promise<import('three').Group>} the glTF scene root
 */
export function loadModel() {
  modelPromise ??= new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(MODEL_URL)
    .then((gltf) => {
      gltf.scene.traverse((o) => {
        if (o.isMesh) o.frustumCulled = false;
      });
      return gltf.scene;
    })
    .catch((err) => {
      modelPromise = null;
      throw err;
    });
  return modelPromise;
}

/**
 * Deep-clone the gift (and star) with their own materials, so one scene can
 * fade or tint without touching the other. Geometry stays shared.
 * @param {import('three').Group} source
 * @returns {{root:import('three').Group, get:(name:string)=>import('three').Object3D, materials:import('three').Material[]}}
 */
export function cloneModel(source) {
  const root = source.clone(true);
  const materials = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!materials.has(o.material)) materials.set(o.material, o.material.clone());
    o.material = materials.get(o.material);
  });
  return {
    root,
    get: (name) => root.getObjectByName(name),
    materials: [...materials.values()],
  };
}

/**
 * Renderer, scene, camera and lights, transparent so the page shows through.
 * @param {HTMLElement} container
 * @param {{lowPower?:boolean}} [options]
 */
export function createStage(container, { lowPower = false } = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  // Capped: the scene is soft and warm, so full retina resolution buys little and costs a lot.
  // The scene lowers it further by itself if frames come in slow.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.035);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.55;

  const camera = new PerspectiveCamera(30, 1, 0.1, 80);

  // Candlelight: warm key, coppery rim from behind, a wine-red bounce from below.
  const key = new DirectionalLight('#ffe6c8', 2.4);
  key.position.set(3.2, 6.5, 5.5);
  const rim = new DirectionalLight('#ffc48f', 1.6);
  rim.position.set(-5, 3.2, -4);
  const hemi = new HemisphereLight('#ffe1cc', '#3a0910', 0.55);
  scene.add(key, rim, hemi);

  return {
    renderer,
    scene,
    camera,
    dispose() {
      envTarget.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

/**
 * Small square canvas texture painted by a callback.
 * @param {number} size
 * @param {(ctx:CanvasRenderingContext2D, size:number)=>void} paint
 * @returns {CanvasTexture}
 */
export function canvasTexture(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Radial glow texture.
 * @param {string[]} stops colours from centre outwards
 * @returns {CanvasTexture}
 */
export function radialTexture(stops) {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Clamp into [0, 1]. @param {number} v */
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** Progress of t inside [a, b]. */
export const range = (t, a, b) => clamp01((t - a) / (b - a));
/** Cubic ease-out. */
export const easeOutCubic = (u) => 1 - (1 - u) ** 3;
/** Quintic ease-out, for long soft settles. */
export const easeOutQuint = (u) => 1 - (1 - u) ** 5;
/** Quadratic ease-in. */
export const easeInQuad = (u) => u * u;
/** Back ease-in: pulls back slightly before moving. */
export const easeInBack = (u) => 2.7 * u * u * u - 1.7 * u * u;
/** Back ease-out: overshoots slightly, then settles. */
export const easeOutBack = (u) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2;
/** Random float in [a, b). */
export const rand = (a, b) => a + Math.random() * (b - a);
