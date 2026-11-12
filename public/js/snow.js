/**
 * Drifting snow on a 2D canvas, in three depth layers:
 * far flakes are small and crisp, near flakes are large, soft bokeh.
 * Sprites are pre-rendered once, so each frame is just drawImage calls.
 */

const LAYERS = [
  { share: 0.58, size: [1.2, 2.4], speed: [14, 26], alpha: 0.55, blur: 0.15, depth: 0.2 },
  { share: 0.32, size: [3, 6], speed: [26, 44], alpha: 0.42, blur: 0.45, depth: 0.55 },
  { share: 0.1, size: [12, 26], speed: [40, 70], alpha: 0.16, blur: 0.95, depth: 1 },
];

/**
 * Pre-render one soft flake sprite for a layer.
 * @param {number} softness 0 = crisp disc, 1 = fully blurred
 * @returns {HTMLCanvasElement}
 */
function makeSprite(softness) {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,247,236,1)');
  g.addColorStop(Math.max(0.05, 0.75 - softness * 0.7), 'rgba(255,247,236,0.9)');
  g.addColorStop(1, 'rgba(255,247,236,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return c;
}

/**
 * Random float in [a, b).
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Attach a snowfall to a canvas.
 * @param {HTMLCanvasElement} canvas full-viewport canvas
 * @param {{reduced?:boolean}} [options]
 * @returns {{setReduced:(reduced:boolean)=>void, destroy:()=>void}}
 */
export function createSnow(canvas, { reduced = false } = {}) {
  const ctx = canvas.getContext('2d');
  const sprites = LAYERS.map((l) => makeSprite(l.blur));
  let flakes = [];
  let w = 0;
  let h = 0;
  let raf = 0;
  let last = 0;
  let isReduced = reduced;
  let isPaused = false;
  const parallax = { x: 0, tx: 0 };

  /**
   * Create one flake for a layer, anywhere on screen or just above it.
   * @param {number} layer index into LAYERS
   * @param {boolean} anywhere spawn across the full height
   * @returns {object}
   */
  function makeFlake(layer, anywhere) {
    const l = LAYERS[layer];
    return {
      layer,
      x: rand(0, w),
      y: anywhere ? rand(0, h) : rand(-40, -10),
      r: rand(l.size[0], l.size[1]),
      vy: rand(l.speed[0], l.speed[1]),
      sway: rand(8, 22) * l.depth,
      phase: rand(0, Math.PI * 2),
    };
  }

  /**
   * Match the canvas to the viewport and repopulate.
   */
  function resize() {
    const dpr = 1;
    // Mobile URL bars change the height constantly; only repopulate on real width changes.
    const repopulate = !flakes.length || Math.abs(window.innerWidth - w) > 40;
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (repopulate) {
      const total = Math.min(110, Math.round((w * h) / 11000));
      flakes = [];
      LAYERS.forEach((l, i) => {
        for (let n = 0; n < Math.round(total * l.share); n++) flakes.push(makeFlake(i, true));
      });
    }
    if (isReduced) draw(0);
  }

  /**
   * Paint all flakes.
   * @param {number} t seconds
   */
  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      const l = LAYERS[f.layer];
      const x = f.x + Math.sin(t * 0.6 + f.phase) * f.sway + parallax.x * l.depth * 18;
      const d = f.r * 2;
      ctx.globalAlpha = l.alpha;
      ctx.drawImage(sprites[f.layer], x - f.r, f.y - f.r, d, d);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Advance and paint one frame.
   * @param {number} now rAF timestamp
   */
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    parallax.x += (parallax.tx - parallax.x) * 0.03;
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      f.y += f.vy * dt;
      if (f.y - f.r > h) flakes[i] = makeFlake(f.layer, false);
    }
    draw(now / 1000);
  }

  /** Start the loop unless motion is reduced. */
  function start() {
    cancelAnimationFrame(raf);
    if (isPaused) return;
    if (isReduced) {
      draw(0);
      return;
    }
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  /**
   * Shift layers slightly with the mouse.
   * @param {PointerEvent} e
   */
  function onPointer(e) {
    if (e.pointerType === 'mouse') parallax.tx = (e.clientX / w - 0.5) * 2;
  }

  /** Pause while the tab is hidden. */
  function onVisibility() {
    if (document.hidden || isPaused) cancelAnimationFrame(raf);
    else start();
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  start();

  return {
    setReduced(value) {
      isReduced = value;
      start();
    },
    /** Stop drawing while something covers the page. */
    pause() {
      isPaused = true;
      cancelAnimationFrame(raf);
    },
    resume() {
      isPaused = false;
      start();
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
