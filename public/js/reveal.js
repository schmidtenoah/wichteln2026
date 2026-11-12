/**
 * The reveal, in the same room: the page flies into the picture, down to your
 * gift. On the way, the rendered gift hands over to the live 3D one standing
 * in exactly the same spot (a "clean plate" from Blender hides the rendered
 * one), the tag from the dialog comes to rest against it, the gift opens, and
 * the wish list rises out of the light. Tap it and it comes to you, flat and
 * readable; every picture and name on it is a link.
 *
 * The 3D scene is built while the password is typed (prepare), so nothing
 * heavy happens once things start moving.
 */

import { prefersReducedMotion, hasWebGL, isLowPower } from './motion.js';
import { play, startMusic } from './sound.js';
import { giftFor, placement, VIEWS, PLATES } from './gifts.js';
import { currentLayout } from './landing.js';
import { createWishlist, genitive } from './wishlist.js';
import { quadTransform, rectCorners, mixCorners } from './quad.js';

const ZOOM_MS = 1700;
const OPEN_MS = 680;

let scenePromise = null;

/**
 * Start downloading Three.js, the scene and the model early (when a tag opens).
 * @returns {Promise<object>|null}
 */
export function prefetchScene() {
  if (!hasWebGL()) return null;
  scenePromise ??= import('./scene/gift-scene.js')
    .then(async (mod) => {
      const assets = await import('./scene/assets.js');
      await assets.loadModel();
      return mod;
    })
    .catch((err) => {
      scenePromise = null;
      throw err;
    });
  return scenePromise;
}

/** Smooth in-out. @param {number} u */
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Wire up the reveal.
 * @param {{section:HTMLElement, landing:HTMLElement, onClosed:(giver:string)=>void, onOpened?:()=>void}} options
 */
export function initReveal({ section, landing, onClosed, onOpened = () => {} }) {
  const stage = section.querySelector('.reveal__stage');
  const props = section.querySelector('.reveal__props');
  const sheetLayer = section.querySelector('.reveal__sheet');
  const back = section.querySelector('.reveal__back');
  const switchBtn = section.querySelector('.reveal__switch');
  const fromEl = section.querySelector('.minilabel__from');
  const toEl = section.querySelector('.minilabel__to');
  const sceneBox = landing.querySelector('.scene');

  let three = null;
  let data = null;
  let giver = '';
  let open = false;
  let ready = false;
  let reading = false;
  let busy = false;
  let mode = 'gift';
  let layout = 'breit';
  let giftId = 0;
  /** Current zoom of the picture: scale k and offset, plus how far the 3D gift has taken over. */
  let zoom = { k: 1, tx: 0, ty: 0, fade: 0 };
  let plate = null;
  let resting = null;
  /** The wish list: wrapper (what gets transformed), the card inside, its size when read. */
  const sheet = { wrap: null, card: null, ratio: 1.36, w: 0, h: 0 };
  /** @type {{index:number, promise:Promise<object|null>}|null} */
  let prepared = null;

  /* ------------------------------------------------------------------ */
  /* The picture and the camera                                           */
  /* ------------------------------------------------------------------ */

  /** Where the picture sits without zoom. */
  function baseRect() {
    const keep = sceneBox.style.transform;
    sceneBox.style.transform = 'none';
    const r = sceneBox.getBoundingClientRect();
    sceneBox.style.transform = keep;
    return r;
  }
  let base = null;

  /** The full render on screen at a given zoom. */
  const viewRect = (z) => ({ left: base.left + z.tx, top: base.top + z.ty, width: base.width * z.k, height: base.height * z.k });

  /** Put the picture, the plate and the 3D view where the zoom says. */
  function applyZoom(z) {
    zoom = z;
    sceneBox.style.transform = `translate(${z.tx}px, ${z.ty}px) scale(${z.k})`;
    // Depth of field: the room goes soft as you come close; your gift stays sharp.
    const blur = clamp01((z.k - 1) / 2.5) * 3.2;
    sceneBox.style.filter = blur > 0.05 ? `blur(${(blur / z.k).toFixed(3)}px) saturate(${1 - 0.12 * clamp01((z.k - 1) / 3)})` : '';
    if (plate) plate.style.opacity = String(z.fade);
    const tagText = sceneBox.querySelectorAll('.gift__tag')[giftId];
    if (tagText) tagText.style.opacity = String(1 - z.fade);
    section.style.setProperty('--fade', String(z.fade));
    section.style.setProperty('--near', String(clamp01((z.k - 1) / 2)));
    if (three) {
      three.setView(viewRect(z));
      if (!ready || reading) three.render();
    }
  }

  /**
   * The zoom that frames these points (fractions of the render) between the top bar and the bottom edge.
   * @param {number[][]} pts
   */
  function frameFor(pts) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topSafe = 72;
    const bottomSafe = vw < 700 ? 18 : 28;
    const side = vw < 700 ? 12 : 40;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [u0, u1, v0, v1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.max(1.2, Math.min(9, (vw - side * 2) / ((u1 - u0) * base.width), (vh - topSafe - bottomSafe) / ((v1 - v0) * base.height)));
    const cx = vw / 2;
    const cy = topSafe + (vh - topSafe - bottomSafe) / 2;
    return { k, tx: cx - base.left - k * ((u0 + u1) / 2) * base.width, ty: cy - base.top - k * ((v0 + v1) / 2) * base.height };
  }

  /** Points to frame without 3D: the gift and room above it for the list. */
  function flatPoints() {
    const [bx, by, bw, bh] = giftFor(giftId, layout).anchor.box;
    return [[bx - bw * 0.3, by - bh * 2.2], [bx + bw * 1.3, by + bh]];
  }

  let zoomRaf = 0;
  /**
   * Glide the zoom to a target.
   * @param {{k:number, tx:number, ty:number, fade:number}} to
   * @param {number} ms
   * @param {(u:number)=>number} [fadeCurve] how the 3D takes over along the way
   */
  function animateZoom(to, ms, fadeCurve) {
    cancelAnimationFrame(zoomRaf);
    const from = { ...zoom };
    if (prefersReducedMotion() || ms <= 0) {
      applyZoom(to);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const u = Math.min(1, (now - start) / ms);
        const e = easeInOut(u);
        // Zoom in log space, so the speed feels even from far to near.
        const k = Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e);
        const f = (k - from.k) / (to.k - from.k || 1);
        const fade = fadeCurve ? fadeCurve(u) : from.fade + (to.fade - from.fade) * e;
        applyZoom({ k, tx: from.tx + (to.tx - from.tx) * f, ty: from.ty + (to.ty - from.ty) * f, fade });
        if (u < 1) zoomRaf = requestAnimationFrame(step);
        else resolve();
      };
      zoomRaf = requestAnimationFrame(step);
    });
  }

  /** Keep everything in place when the window changes size. */
  function reframe() {
    if (!open) return;
    base = baseRect();
    const pts = three ? three.keyPoints() : flatPoints();
    applyZoom({ ...frameFor(pts), fade: zoom.fade });
    if (reading) placeReading(false);
  }

  /* ------------------------------------------------------------------ */
  /* What the scene carries: the tag and the wish list                     */
  /* ------------------------------------------------------------------ */

  /** Called after every 3D frame: lay the HTML tag and list onto their planes. */
  function syncProps() {
    if (!three) return;
    if (resting) resting.el.style.transform = quadTransform(resting.w, resting.h, three.tagCorners());
    if (!sheet.wrap || reading || busy) return;
    const st = three.sheetState();
    sheet.wrap.hidden = !st.visible;
    if (!st.visible) return;
    sheet.wrap.style.transform = quadTransform(sheet.w, sheet.h, st.corners);
    sheet.wrap.style.clipPath = st.clip > 0.001 ? `inset(0 0 ${(st.clip * 100).toFixed(2)}% 0)` : '';
    sheet.card.style.setProperty('--glow', st.glow.toFixed(3));
  }

  /** Size of the list when it is read: as large as fits, never wider than a sheet of paper in your hands. */
  function readingSize(ratio) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(vw - (vw < 600 ? 24 : 64), 640, Math.max(300, (vh - 120) / ratio));
    return { w, h: w * ratio };
  }

  /** Build (or rebuild) the card for the current edition. */
  function buildSheet() {
    const list = mode === 'own' ? data.own : data.wishes;
    const { el, ratio } = createWishlist({ receiver: data.receiver, giver: data.giver, list, own: mode === 'own' });
    sheet.ratio = ratio;
    const { w, h } = readingSize(ratio);
    sheet.w = w;
    sheet.h = h;
    if (!sheet.wrap) {
      sheet.wrap = document.createElement('div');
      sheet.wrap.className = 'wlwrap';
      sheet.wrap.addEventListener('click', () => {
        if (!reading && ready) openList();
      });
      sheet.wrap.addEventListener('keydown', (e) => {
        if (!reading && ready && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          openList();
        }
      });
      sheet.wrap.addEventListener('pointerenter', () => sheet.wrap.classList.add('is-hover'));
      sheet.wrap.addEventListener('pointerleave', () => sheet.wrap.classList.remove('is-hover'));
      sheet.wrap.hidden = true;
      sheetLayer.append(sheet.wrap);
    }
    sheet.wrap.style.width = `${w}px`;
    sheet.wrap.style.height = `${h}px`;
    sheet.wrap.replaceChildren(el);
    sheet.card = el;
    setSheetInteractive(reading);
    three?.setSheetAspect(ratio);
  }

  /** While it floats, the whole card is one button; when read, its links work. @param {boolean} on */
  function setSheetInteractive(on) {
    if (!sheet.wrap) return;
    sheet.card.inert = !on;
    if (on) {
      sheet.wrap.removeAttribute('role');
      sheet.wrap.removeAttribute('tabindex');
      sheet.wrap.removeAttribute('aria-label');
    } else {
      sheet.wrap.setAttribute('role', 'button');
      sheet.wrap.tabIndex = ready ? 0 : -1;
      sheet.wrap.setAttribute('aria-label', `${genitive(data.receiver)} Wunschzettel ansehen`);
    }
  }

  /** Where the card lies while it is read: centred under the bar. */
  function readingRect() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const top = Math.max(68, (vh - sheet.h) / 2 + 18);
    return { x: (vw - sheet.w) / 2, y: sheet.h + top + 24 > vh ? 68 : top, w: sheet.w, h: sheet.h };
  }

  function placeReading() {
    const r = readingRect();
    sheet.wrap.style.transform = `translate(${r.x}px, ${r.y}px)`;
    sheet.wrap.style.clipPath = '';
    sheetLayer.style.setProperty('--sheet-bottom', `${r.y + r.h + 32}px`);
  }

  /**
   * Fly the card between two corner sets.
   * @param {()=>number[][]} from
   * @param {()=>number[][]} to
   * @param {number} ms
   * @param {(u:number)=>void} [each]
   */
  function flyCard(from, to, ms, each) {
    if (prefersReducedMotion()) {
      sheet.wrap.style.transform = quadTransform(sheet.w, sheet.h, to());
      each?.(1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const a = from();
      const step = (now) => {
        const u = Math.min(1, (now - start) / ms);
        const e = easeInOut(u);
        // A little lift on the way, as if picked up.
        const q = mixCorners(a, to(), e).map(([x, y]) => [x, y - Math.sin(Math.PI * e) * 26]);
        sheet.wrap.style.transform = quadTransform(sheet.w, sheet.h, q);
        each?.(e);
        if (u < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /** The list comes to you. */
  async function openList() {
    if (busy || reading) return;
    busy = true;
    play('blaettern');
    const st = three?.sheetState();
    const r = readingRect();
    section.classList.add('is-reading');
    sheetLayer.scrollTop = 0;
    const glow0 = st?.glow ?? 0;
    const clip0 = st?.clip ?? 0;
    sheet.wrap.hidden = false;
    await flyCard(() => st?.corners ?? rectCorners(r.x, r.y + 40, r.w, r.h), () => rectCorners(r.x, r.y, r.w, r.h), OPEN_MS, (e) => {
      sheet.card.style.setProperty('--glow', (glow0 * (1 - e)).toFixed(3));
      sheet.wrap.style.clipPath = clip0 > 0.001 ? `inset(0 0 ${(clip0 * (1 - e) * 100).toFixed(2)}% 0)` : '';
    });
    three?.pause();
    reading = true;
    busy = false;
    placeReading();
    setSheetInteractive(true);
    switchBtn.hidden = !data.supported || !data.own;
    paintSwitch();
    sheet.card.querySelector('a') ? sheet.card.querySelector('a.wl__cap')?.focus({ preventScroll: true }) : back.focus({ preventScroll: true });
  }

  /** Put it back above the gift. */
  async function closeList() {
    if (busy || !reading) return;
    busy = true;
    play('zuklappen');
    reading = false;
    setSheetInteractive(false);
    switchBtn.hidden = true;
    section.classList.remove('is-reading');
    if (mode === 'own') {
      mode = 'gift';
      buildSheet();
    }
    const r = readingRect();
    const from = rectCorners(r.x, r.y - sheetLayer.scrollTop, r.w, r.h);
    sheetLayer.scrollTop = 0;
    if (three) {
      three.resume();
      await flyCard(() => from, () => three.sheetState().corners, OPEN_MS);
      busy = false;
      syncProps();
      sheet.wrap.focus({ preventScroll: true });
    } else {
      busy = false;
    }
  }

  function paintSwitch() {
    switchBtn.textContent = mode === 'own' ? `${genitive(data.receiver)} Wunschzettel` : 'Mein Wunschzettel';
  }

  /** Your own list, to check it arrived; and back. */
  function toggleMode() {
    if (!reading) return;
    mode = mode === 'own' ? 'gift' : 'own';
    play('blaettern');
    buildSheet();
    placeReading();
    sheetLayer.scrollTop = 0;
    paintSwitch();
  }

  /* ------------------------------------------------------------------ */
  /* Scene life cycle                                                      */
  /* ------------------------------------------------------------------ */

  /** @param {string} m */
  function onMoment(m) {
    if (m === 'land' || m === 'bow-land' || m === 'lid-land') play('landung');
    else if (m === 'untie') play('schleife');
    else if (m === 'pop') play('deckel');
    else if (m === 'magazine') play('glanz');
    else if (m === 'ready') {
      ready = true;
      section.classList.add('is-ready');
      setSheetInteractive(false);
    }
  }

  /** Throw away a scene that was built ahead but not used. */
  function discardPrepared() {
    const old = prepared;
    prepared = null;
    old?.promise.then((s) => s?.dispose()).catch(() => {});
  }

  /**
   * Build the 3D scene for this gift now, while the password is typed.
   * @param {number} index
   */
  function prepare(index) {
    if (open || !hasWebGL()) return;
    if (prepared?.index === index) return;
    discardPrepared();
    const loader = prefetchScene();
    if (!loader) return;
    const holder = document.createElement('div');
    holder.className = 'reveal__scene';
    stage.replaceChildren(holder);
    const lay = currentLayout();
    const id = giftFor(index).id;
    const others = Array.from({ length: 10 }, (_, j) => j).filter((j) => j !== id).map((j) => placement(j, lay));
    const entry = {
      index,
      layout: lay,
      promise: loader
        .then((mod) =>
          mod.createGiftScene(holder, {
            gift: giftFor(index),
            place: placement(id, lay),
            others,
            view: VIEWS[lay],
            onMoment,
            onFrame: syncProps,
            lowPower: isLowPower(),
            still: prefersReducedMotion(),
          })
        )
        .then((s) => {
          if (prepared !== entry) {
            s.dispose();
            return null;
          }
          return s;
        })
        .catch((err) => {
          console.warn('3D-Szene nicht verfügbar.', err);
          return null;
        }),
    };
    prepared = entry;
  }

  /** The clean plate: the picture around your gift, without it. */
  function addPlate() {
    const [x, y, w, h] = PLATES[layout][giftId];
    plate = document.createElement('img');
    plate.className = 'scene__plate';
    plate.alt = '';
    plate.decoding = 'sync';
    plate.src = `img/leer/${layout}-${giftId}.webp`;
    plate.style.cssText = `--px:${x};--py:${y};--pw:${w};--ph:${h};opacity:0`;
    sceneBox.querySelector('.scene__img').after(plate);
    return plate.decode().catch(() => {});
  }

  /** Leave: fly back out, free the GPU, wipe names and wishes from the page. */
  async function hide() {
    if (!open || leaving) return;
    leaving = true;
    cancelAnimationFrame(zoomRaf);
    section.classList.remove('is-reading', 'is-ready');
    section.classList.add('is-leaving');
    switchBtn.hidden = true;
    reading = false;
    ready = false;
    three?.resume();
    await animateZoom({ k: 1, tx: 0, ty: 0, fade: 0 }, prefersReducedMotion() ? 0 : 1100, (u) => 1 - clamp01(u / 0.55));
    open = false;
    leaving = false;
    three?.dispose();
    three = null;
    stage.replaceChildren();
    props.replaceChildren();
    sheetLayer.replaceChildren();
    sheet.wrap = sheet.card = null;
    resting = null;
    plate?.remove();
    plate = null;
    sceneBox.style.removeProperty('transform');
    sceneBox.style.removeProperty('filter');
    sceneBox.querySelectorAll('.gift__tag').forEach((t) => t.style.removeProperty('opacity'));
    section.classList.remove('is-active', 'is-leaving', 'is-flat');
    section.style.removeProperty('--fade');
    section.hidden = true;
    fromEl.textContent = '';
    toEl.textContent = '';
    data = null;
    mode = 'gift';
    landing.inert = false;
    landing.removeAttribute('aria-hidden');
    document.documentElement.classList.remove('is-revealing');
    onClosed(giver);
  }
  let leaving = false;

  back.addEventListener('click', () => {
    // Without 3D there is nothing to put the list back onto: back means back to the tree.
    if (reading && three) closeList();
    else if (history.state?.wichteln === 'reveal') history.back();
    else hide();
  });
  switchBtn.addEventListener('click', toggleMode);
  window.addEventListener('popstate', () => {
    if (open) hide();
  });
  document.addEventListener('keydown', (e) => {
    if (!open || e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    back.click();
  });
  window.addEventListener('resize', () => {
    if (!open || leaving) return;
    cancelAnimationFrame(zoomRaf);
    if (sheet.card) {
      const { w, h } = readingSize(sheet.ratio);
      sheet.w = w;
      sheet.h = h;
      sheet.wrap.style.width = `${w}px`;
      sheet.wrap.style.height = `${h}px`;
      if (resting) syncProps();
    }
    reframe();
  });

  return {
    prepare,
    /** The dialog was closed without the right password. */
    cancel() {
      if (!open) {
        discardPrepared();
        stage.replaceChildren();
      }
    },

    /**
     * Start the reveal behind the dialog. Resolves once the flight has begun, with
     * where the dialog's tag should fly to and callbacks for when it got there.
     * @param {{giver:string, index:number, receiver:string, wishes:object|null, own:object|null, supported:boolean, tagAspect?:number}} result
     */
    async show(result) {
      giver = result.giver;
      data = result;
      open = true;
      ready = false;
      reading = false;
      mode = 'gift';
      layout = currentLayout();
      giftId = giftFor(result.index).id;
      fromEl.textContent = giver;
      toEl.textContent = result.receiver;
      startMusic();

      if (prepared?.index !== result.index || prepared?.layout !== layout) {
        prepared = null;
        prepare(result.index);
      }
      const entry = prepared;
      prepared = null;
      const [s] = await Promise.all([entry ? entry.promise : Promise.resolve(null), addPlate()]);
      three = s;
      if (!open) {
        three?.dispose();
        three = null;
        return { corners: null, adopt: null, land: () => {} };
      }

      landing.inert = true;
      landing.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.add('is-revealing');
      section.hidden = false;
      section.classList.toggle('is-flat', !three);
      history.pushState({ wichteln: 'reveal' }, '');
      requestAnimationFrame(() => section.classList.add('is-active'));
      onOpened();
      buildSheet();
      if (three && result.tagAspect) three.setTagAspect(result.tagAspect);
      base = baseRect();
      zoom = { k: 1, tx: 0, ty: 0, fade: 0 };
      applyZoom(zoom);
      const target = { ...frameFor(three ? three.keyPoints() : flatPoints()), fade: three ? 1 : 0 };
      // The 3D gift takes over early in the flight, while everything is moving.
      const flight = animateZoom(target, ZOOM_MS, three ? (u) => clamp01((u - 0.12) / 0.38) : undefined);

      if (!three) {
        // Without 3D: fly in, then the list simply lies in front of you.
        flight.then(() => {
          ready = true;
          sheet.wrap.hidden = false;
          section.classList.add('is-ready');
          openList();
        });
        return { corners: null, adopt: null, land: () => back.focus({ preventScroll: true }) };
      }
      return {
        corners: () => three?.tagCorners() ?? [[0, 0], [0, 0], [0, 0], [0, 0]],
        duration: ZOOM_MS - 150,
        adopt: (el, w, h) => {
          resting = { el, w, h };
          props.append(el);
          syncProps();
        },
        land: async () => {
          three?.showTag();
          back.focus({ preventScroll: true });
          await flight;
          if (open && three) setTimeout(() => open && three?.play(), prefersReducedMotion() ? 0 : 180);
        },
      };
    },
    hide,
  };
}
