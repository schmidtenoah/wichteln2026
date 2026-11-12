/**
 * Boot: snow, the gifts, the tag, the reveal and the wish list.
 */

import { SITE } from '../config.js';
import { loadDraw } from './data.js';
import { openWishes } from './crypto.js';
import { renderGifts, renderMessage } from './landing.js';
import { initTag } from './tag.js';
import { initReveal } from './reveal.js';
import { createSnow } from './snow.js';
import { prefersReducedMotion, onReducedMotionChange } from './motion.js';
import { initSound, isSoundOn, setSound, onSoundChange, unlockAudio, play, startMusic } from './sound.js';

/** Fill [data-site] elements from config. */
function applySiteConfig() {
  document.querySelectorAll('[data-site]').forEach((el) => {
    const value = SITE[el.dataset.site];
    if (value !== undefined && value !== null && value !== '') el.textContent = String(value);
  });
}

/** Keep every sound toggle in sync. */
function initSoundToggles() {
  initSound(SITE.soundDefault !== false);
  const toggles = document.querySelectorAll('.sound-toggle');
  const paint = (on) =>
    toggles.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? 'Ton ausschalten' : 'Ton einschalten');
    });
  toggles.forEach((btn) =>
    btn.addEventListener('click', () => {
      setSound(!isSoundOn());
      if (isSoundOn()) startMusic();
    })
  );
  onSoundChange(paint);
  paint(isSoundOn());
}

/**
 * Decrypt the receiver's and the giver's own wish list.
 * @param {object} draw
 * @param {string} giver
 * @param {{to:string, k?:string, own?:string}} payload
 */
async function readWishes(draw, giver, payload) {
  const supported = draw.v >= 2 && Boolean(payload.k);
  if (!supported) return { wishes: null, own: null, supported };
  const [wishes, own] = await Promise.all([
    openWishes(payload.to, payload.k, draw.wishes?.[payload.to]),
    openWishes(giver, payload.own, draw.wishes?.[giver]),
  ]);
  return { wishes, own, supported };
}

/** Entry point. */
async function main() {
  applySiteConfig();
  initSoundToggles();

  const root = document.documentElement;
  root.classList.toggle('reduced-motion', prefersReducedMotion());
  const snow = createSnow(document.querySelector('.snow'), { reduced: prefersReducedMotion() });
  onReducedMotionChange((reduced) => {
    root.classList.toggle('reduced-motion', reduced);
    snow.setReduced(reduced);
  });

  // The first tap anywhere unlocks audio (browsers require a gesture) and starts the music.
  const firstGesture = () => {
    unlockAudio();
    startMusic();
  };
  window.addEventListener('pointerdown', firstGesture, { once: true, passive: true });
  window.addEventListener('keydown', firstGesture, { once: true });

  const landing = document.querySelector('#landing');
  const list = document.querySelector('.pile');
  let draw = null;

  let gifts = null;
  const reveal = initReveal({
    section: document.querySelector('#reveal'),
    landing,
    onClosed: (giver) => {
      gifts?.settle();
      list.querySelector(`[data-name="${CSS.escape(giver)}"]`)?.focus({ preventScroll: true });
    },
  });
  const tag = initTag({
    dialog: document.querySelector('#tag'),
    // Build the 3D scene for this gift while the password is typed.
    onOpen: (index) => reveal.prepare(index),
    onCancel: () => reveal.cancel(),
    onUnlock: async ({ giver, index, payload, tagAspect }) => {
      const extra = await readWishes(draw, giver, payload);
      return reveal.show({ giver, index, receiver: payload.to, total: draw.people.length, tagAspect, ...extra });
    },
  });

  try {
    draw = await loadDraw();
    gifts = renderGifts(list, draw.people, (person, index, trigger) => {
      unlockAudio();
      play('tippen');
      tag.open(person, index, draw.kdf, trigger);
    });
    root.classList.add('is-ready');
  } catch (err) {
    console.warn(err);
    renderMessage(document.querySelector('.pile__message'), 'Hier ist noch nichts ausgelost. Erst tools/generate.mjs laufen lassen, dann data.json hochladen.');
    root.classList.add('is-ready');
  }
}

main();
