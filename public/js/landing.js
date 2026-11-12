/**
 * Landing page: the Christmas tree with everyone's gift underneath.
 * Two Cycles renders from Blender: a wide one for laptops and a tall one for
 * phones. The paper tags with their cords are part of the render; the page
 * only writes each name onto its tag (position, size and angle from Blender)
 * and puts an invisible button over each gift.
 */

import { giftFor } from './gifts.js';
import { tagStyle } from './tagart.js';

const wideQuery = window.matchMedia('(min-aspect-ratio: 1/1)');

/** @returns {'breit'|'hoch'} */
export const currentLayout = () => (wideQuery.matches ? 'breit' : 'hoch');

/** Image height / width of each render. */
const RATIO = { breit: 1000 / 1600, hoch: 1500 / 1000 };

/**
 * Render the gifts over the tree scene, and again when the format changes.
 * @param {HTMLElement} list the <ul> inside .scene
 * @param {{name:string}[]} people in config order
 * @param {(person:object, index:number, trigger:HTMLButtonElement)=>void} onPick
 * @returns {{settle:()=>void}}
 */
export function renderGifts(list, people, onPick) {
  const scene = list.closest('.scene');
  const img = scene.querySelector('.scene__img');

  let pending = false;
  const draw = () => {
    // While a gift is open, the picture stays as it is (the 3D scene is in its camera).
    if (document.documentElement.classList.contains('is-revealing')) {
      pending = true;
      return;
    }
    pending = false;
    const layout = currentLayout();
    const ratio = RATIO[layout];
    scene.dataset.layout = layout;
    scene.style.setProperty('--ratio', String(ratio));
    img.src = `img/baum-${layout}.webp`;
    const fragment = document.createDocumentFragment();
    people.forEach((person, i) => {
      const { anchor } = giftFor(i, layout);
      const [cx, cy, tw, th, angle] = anchor.tag;
      const [bx, by, bw, bh] = anchor.box;
      const li = document.createElement('li');
      li.className = 'gift';
      li.style.setProperty('--i', String(i));

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gift__hit';
      button.dataset.name = person.name;
      button.setAttribute('aria-label', `Geschenk von ${person.name}`);
      Object.assign(button.style, { left: `${bx * 100}%`, top: `${by * 100}%`, width: `${bw * 100}%`, height: `${bh * 100}%` });

      // The writing area of the tag in the render. Blender gives sizes in image
      // heights; the scene is an inline-size container, so 1 image height = ratio * 100cqw.
      const tag = document.createElement('span');
      tag.className = 'gift__tag';
      tag.setAttribute('aria-hidden', 'true');
      tag.style.setProperty('--x', `${cx * 100}%`);
      tag.style.setProperty('--y', `${cy * 100}%`);
      tag.style.setProperty('--tw', String(tw * ratio * 100));
      tag.style.setProperty('--th', String(th * ratio * 100));
      tag.style.setProperty('--angle', `${angle}deg`);
      tag.style.setProperty('--len', String(Math.max(4, Array.from(person.name).length)));
      const { paper } = tagStyle(person.name, i);
      tag.style.setProperty('--tag-ink', paper.ink);
      tag.dataset.paper = paper.id;
      const name = document.createElement('span');
      name.className = 'gift__name';
      name.textContent = person.name;
      tag.append(name);

      button.addEventListener('click', () => onPick(person, i, button));
      button.addEventListener('pointerenter', () => li.classList.add('is-hover'));
      button.addEventListener('pointerleave', () => li.classList.remove('is-hover'));
      li.append(button, tag);
      fragment.appendChild(li);
    });
    list.replaceChildren(fragment);
    fitNames();
  };

  /**
   * Long names on small screens: keep the handwriting legible (at least
   * MIN_FONT px) and squeeze it a little sideways instead, like writing tighter.
   */
  const MIN_FONT = 8.5;
  const fitNames = () => {
    list.querySelectorAll('.gift__name').forEach((name) => {
      name.style.removeProperty('font-size');
      name.style.removeProperty('--sx');
      if (parseFloat(getComputedStyle(name).fontSize) < MIN_FONT) name.style.fontSize = `${MIN_FONT}px`;
      const room = name.parentElement.clientWidth;
      const ink = name.scrollWidth;
      if (ink > room * 1.04) name.style.setProperty('--sx', (room / ink).toFixed(3));
    });
  };

  draw();
  wideQuery.addEventListener('change', draw);
  document.fonts?.ready.then(fitNames);
  new ResizeObserver(fitNames).observe(scene);
  return {
    /** After a reveal: catch up with a format change that happened meanwhile. */
    settle() {
      if (pending) draw();
    },
  };
}

/**
 * Calm message when data.json is missing or broken.
 * @param {HTMLElement} el
 * @param {string} text
 */
export function renderMessage(el, text) {
  el.textContent = text;
  el.hidden = false;
}
