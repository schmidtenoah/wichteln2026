/**
 * The tag: grows out of the paper tag on the tapped gift. "Von" is filled
 * in, "Für" stays blank until the right password; then the seal cracks (and
 * stays on the tag), the name is written onto the line by hand, and the tag
 * itself flies down and comes to rest against the gift in the 3D scene.
 */

import { openEntry } from './crypto.js';
import { prefersReducedMotion } from './motion.js';
import { play } from './sound.js';
import { dressTag } from './tagart.js';
import { quadTransform } from './quad.js';
import { buildSeal, paintSeal } from './seal.js';

const WRONG = 'Hm, das passt nicht. Schau nochmal in die Nachricht der Wichtel-Redaktion.';
const EMPTY = 'Da fehlt noch dein Passwort.';
const SLOW = (s) => `Zu viele Versuche. Bitte ${s} Sekunden warten.`;

/*
 * A brake for guessing through the form: from the third wrong password in a row, each new
 * try has to wait a little longer (2, 4, 8 … up to 60 seconds). Kept for this browser tab.
 * (Someone who copies data.json can still guess offline; see README, "Wie sicher ist das?")
 */
const FAILS_KEY = 'wichteln:versuche';
function readFails() {
  try {
    const v = JSON.parse(sessionStorage.getItem(FAILS_KEY) || '{}');
    return { n: Number(v.n) || 0, until: Number(v.until) || 0 };
  } catch {
    return { n: 0, until: 0 };
  }
}
function writeFails(v) {
  try {
    sessionStorage.setItem(FAILS_KEY, JSON.stringify(v));
  } catch {
    /* private mode: the brake lasts for this page only */
  }
}
let fails = readFails();

/**
 * Wait helper.
 * @param {number} ms
 */
const wait = (ms) => new Promise((r) => setTimeout(r, prefersReducedMotion() ? 0 : ms));

/**
 * Transform that maps the dialog label onto a small source rectangle.
 * @param {DOMRect} from small tag on the gift
 * @param {DOMRect} to big label
 * @param {number} rot degrees
 */
function flip(from, to, rot) {
  const s = from.width / to.width;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${s}) rotate(${rot}deg)`;
}

/** Smoothstep. @param {number} u */
const smooth = (u) => u * u * (3 - 2 * u);

/**
 * Wire up the tag dialog.
 * @param {{dialog:HTMLDialogElement, onUnlock:(result:{giver:string, index:number, payload:{to:string,k?:string,own?:string}})=>Promise<{corners:(()=>number[][])|null, duration?:number, adopt:((el:HTMLElement, w:number, h:number)=>void)|null, land:()=>void}>, onOpen?:(index:number)=>void, onCancel?:()=>void}} options
 * @returns {{open:(person:object, index:number, kdf:object, trigger:HTMLElement)=>void}}
 */
export function initTag({ dialog, onUnlock, onOpen = () => {}, onCancel = () => {} }) {
  const label = dialog.querySelector('.handtag--big');
  const form = dialog.querySelector('form');
  const input = dialog.querySelector('#tag-password');
  const fromEl = dialog.querySelector('.handtag__name');
  const toEl = dialog.querySelector('.handtag__fuer-name');
  const stamp = dialog.querySelector('.seal');
  const errorEl = dialog.querySelector('.handtag__error');
  const submit = stamp;
  const closeBtn = dialog.querySelector('.handtag__close');
  buildSeal(stamp.querySelector('.seal__svg'));

  let current = null;
  let index = 0;
  let kdf = null;
  let trigger = null;
  let busy = false;
  let closing = false;

  /** @param {string} text */
  function setError(text) {
    errorEl.textContent = text;
    input.setAttribute('aria-invalid', text ? 'true' : 'false');
  }

  /** Shake the label (restartable). */
  function shake() {
    if (prefersReducedMotion()) return;
    label.animate(
      [{ transform: 'rotate(0)' }, { transform: 'translateX(-10px) rotate(-2deg)' }, { transform: 'translateX(9px) rotate(1.6deg)' }, { transform: 'translateX(-6px) rotate(-1deg)' }, { transform: 'translateX(3px)' }, { transform: 'none' }],
      { duration: 520, easing: 'cubic-bezier(.36,.07,.19,.97)' }
    );
  }

  /** @param {boolean} on */
  function setBusy(on) {
    busy = on;
    submit.disabled = on;
    submit.setAttribute('aria-busy', String(on));
  }

  /** The tag on the gift in the tree scene (its writing area), if visible. */
  const sourceTag = () => trigger?.parentElement?.querySelector('.gift__tag') ?? null;
  const sourceRect = () => sourceTag()?.getBoundingClientRect() ?? null;
  /** Angle of that tag in the render, in degrees. */
  const sourceTilt = () => parseFloat(sourceTag()?.style.getPropertyValue('--angle') ?? '') || 0;

  /**
   * Shrink back onto the gift and close.
   * @param {boolean} restoreFocus
   */
  async function close(restoreFocus = true) {
    if (closing || !dialog.open) return;
    closing = true;
    const src = sourceRect();
    if (src && !prefersReducedMotion()) {
      const anim = label.animate(
        [{ transform: 'none', opacity: 1 }, { transform: flip(src, label.getBoundingClientRect(), sourceTilt()), opacity: 0.4 }],
        { duration: 380, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
      );
      dialog.classList.add('is-closing');
      await anim.finished.catch(() => {});
      anim.cancel();
    }
    dialog.close();
    dialog.classList.remove('is-closing');
    closing = false;
    onCancel();
    setError('');
    input.value = '';
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }

  /**
   * Write the receiver's name onto the line, pen-style.
   * @param {string} name
   */
  async function writeName(name) {
    toEl.textContent = name;
    toEl.classList.remove('is-writing');
    void toEl.offsetWidth;
    toEl.style.setProperty('--write', `${Math.max(0.7, Math.min(1.4, name.length * 0.13))}s`);
    toEl.classList.add('is-writing');
    play('stift');
    await wait(Math.max(700, Math.min(1400, name.length * 130)) + 650);
  }

  /** @param {SubmitEvent} e */
  async function onSubmit(e) {
    e.preventDefault();
    if (busy || !current) return;
    if (!input.value.trim()) {
      setError(EMPTY);
      shake();
      input.focus();
      return;
    }
    const waitFor = Math.ceil((fails.until - Date.now()) / 1000);
    if (waitFor > 0) {
      setError(SLOW(waitFor));
      shake();
      return;
    }
    setError('');
    setBusy(true);
    const payload = await openEntry(current, input.value, kdf);
    if (!payload) {
      fails.n += 1;
      fails.until = fails.n >= 3 ? Date.now() + Math.min(60, 2 ** (fails.n - 2)) * 1000 : 0;
      writeFails(fails);
      setBusy(false);
      setError(WRONG);
      play('falsch');
      shake();
      input.select();
      return;
    }
    fails = { n: 0, until: 0 };
    writeFails(fails);
    input.blur();
    dialog.classList.add('is-unlocked');
    stamp.classList.add('is-broken');
    stamp.setAttribute('aria-label', 'Siegel gebrochen');
    play('deckel');
    await wait(420);
    await writeName(payload.to);
    // The reveal starts: the page flies down to your gift. The cord is gone at once; the tag
    // itself drops and its four corners glide onto the spot where it will lean against the box.
    const twine = label.querySelector('.handtag__twine');
    if (twine) twine.hidden = true;
    const tagAspect = label.offsetHeight / label.offsetWidth;
    const handoff = (await onUnlock({ giver: current.name, index, payload, tagAspect })) ?? { corners: null, adopt: null, land: () => {} };
    dialog.classList.add('is-lifting');
    // The untransformed box, and where its corners are now (the tag hangs slightly turned).
    const tilt = (Number.parseFloat(getComputedStyle(label).rotate) || 0) * (Math.PI / 180);
    label.style.rotate = '0deg';
    const box = label.getBoundingClientRect();
    const w = box.width;
    const h = box.height;
    if (handoff.corners) {
      const turn = ([x, y]) => [w / 2 + (x - w / 2) * Math.cos(tilt) - y * Math.sin(tilt), (x - w / 2) * Math.sin(tilt) + y * Math.cos(tilt)];
      const from = [[0, 0], [w, 0], [w, h], [0, h]].map(turn);
      label.style.transformOrigin = '0 0';
      label.style.willChange = 'transform';
      label.style.transform = quadTransform(w, h, from);
      if (!prefersReducedMotion()) {
        await new Promise((resolve) => {
          const start = performance.now();
          const step = (now) => {
            const u = Math.min(1, (now - start) / (handoff.duration || 1300));
            const e = smooth(u);
            const lift = -60 * Math.sin(Math.PI * Math.min(1, u * 1.3)) * (1 - u);
            const to = handoff.corners().map(([x, y]) => [x - box.left, y - box.top]);
            const q = from.map(([fx, fy], i) => [fx + (to[i][0] - fx) * e, fy + (to[i][1] - fy) * e + lift]);
            label.style.transform = quadTransform(w, h, q);
            if (u < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
        play('landung');
      }
      // The same tag stays: a copy takes its exact place outside the dialog, which then closes.
      handoff.adopt?.(restingCopy(w, h), w, h);
      handoff.land();
    } else {
      if (!prefersReducedMotion()) await label.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.catch(() => {});
      handoff.land();
    }
    dialog.close();
    label.getAnimations({ subtree: true }).forEach((an) => an.cancel());
    label.style.removeProperty('transform');
    label.style.removeProperty('transform-origin');
    label.style.removeProperty('rotate');
    label.style.removeProperty('will-change');
    if (twine) twine.hidden = false;
    dialog.classList.remove('is-unlocked', 'is-lifting');
    setBusy(false);
    input.value = '';
    toEl.textContent = '';
    toEl.classList.remove('is-writing');
    resetSeal();
  }

  /**
   * The tag as it is now, as a free-standing element for the scene: same paper,
   * same names, same broken seal. Only the parts for typing are left out.
   * @param {number} w
   * @param {number} h
   */
  function restingCopy(w, h) {
    const copy = /** @type {HTMLElement} */ (label.cloneNode(true));
    copy.classList.add('handtag--resting');
    copy.querySelectorAll('[id]').forEach((n) => {
      if (!(n instanceof SVGElement)) n.removeAttribute('id');
    });
    copy.querySelector('.handtag__fuer-name')?.classList.remove('is-writing');
    copy.querySelector('.handtag__twine')?.remove();
    copy.querySelectorAll('input, button, label, .handtag__error').forEach((n) => n.setAttribute('tabindex', '-1'));
    copy.removeAttribute('aria-labelledby');
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    copy.style.removeProperty('transform');
    copy.style.removeProperty('will-change');
    copy.style.width = `${w}px`;
    copy.style.height = `${h}px`;
    return copy;
  }

  function resetSeal() {
    stamp.classList.remove('is-broken');
    stamp.setAttribute('aria-label', 'Siegel brechen und freigeben, für wen das Geschenk ist');
  }

  form.addEventListener('submit', onSubmit);
  closeBtn.addEventListener('click', () => close());
  input.addEventListener('input', () => errorEl.textContent && setError(''));
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (!busy) close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog && !busy) close();
  });

  return {
    open(person, i, kdfParams, triggerEl) {
      current = person;
      index = i;
      kdf = kdfParams;
      trigger = triggerEl;
      fromEl.textContent = person.name;
      // Paper and ink as on the gift; the seal sits where the doodle used to be.
      label.querySelector('.doodle')?.remove();
      dressTag(label, person.name, i);
      paintSeal(stamp.querySelector('.seal__svg'), getComputedStyle(label).getPropertyValue('--wax').trim());
      resetSeal();
      toEl.textContent = '';
      toEl.classList.remove('is-writing');
      setError('');
      input.value = '';
      setBusy(false);
      onOpen(i);
      play('anhaenger');
      dialog.showModal();
      const src = sourceRect();
      if (src && !prefersReducedMotion()) {
        label.animate([{ transform: flip(src, label.getBoundingClientRect(), sourceTilt()), opacity: 0.5 }, { transform: 'rotate(2deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], {
          duration: 640,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        });
      }
      setTimeout(() => input.focus({ preventScroll: true }), prefersReducedMotion() ? 0 : 420);
    },
  };
}
