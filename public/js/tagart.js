/**
 * Hand-made gift tags. Every person gets their own: paper, torn outline and
 * a little doodle are derived from the name, so the small tag on the gift
 * and the big one in the dialog are the same object.
 */

const PAPERS = [
  { id: 'kraft', paper: '#c9a273', ink: '#2b1d14', accent: '#8d1c2a' },
  { id: 'creme', paper: '#f1e5cc', ink: '#1f2b4d', accent: '#b3202c' },
  { id: 'rot', paper: '#a8232f', ink: '#fff3e2', accent: '#f2d79d' },
  { id: 'tanne', paper: '#244d3a', ink: '#fbf1dc', accent: '#e8c77e' },
  { id: 'eis', paper: '#d6e6f2', ink: '#1d2a52', accent: '#b3202c' },
];

const DOODLES = {
  stern: '<path d="M12 3.2l2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 16.2l-5.2 2.9 1.2-5.8-4.4-4 5.9-.7z"/>',
  mistel: '<path d="M11.6 12.4C8.4 12 5.6 9.6 5 5.6c3.6.2 6.2 2.6 6.6 6.8z"/><path d="M12.4 12.4c3.2-.4 6-2.8 6.6-6.8-3.6.2-6.2 2.6-6.6 6.8z"/><circle cx="10.2" cy="15.4" r="1.7"/><circle cx="13.8" cy="15.4" r="1.7"/><circle cx="12" cy="18.3" r="1.7"/>',
  flocke: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.8 4.8 12 6.6l2.2-1.8M9.8 19.2 12 17.4l2.2 1.8M4.6 10.6l2.7-.5-.9-2.6M19.4 13.4l-2.7.5.9 2.6M4.6 13.4l2.7.5-.9 2.6M19.4 10.6l-2.7-.5.9-2.6"/>',
  herz: '<path d="M12 19.5S4.8 15.2 4.8 9.9A3.9 3.9 0 0 1 12 7.8a3.9 3.9 0 0 1 7.2 2.1c0 5.3-7.2 9.6-7.2 9.6z"/>',
  baum: '<path d="M12 3.5 16.4 9.6h-2.6l3.5 4.9h-2.9l3.6 4.9H6l3.6-4.9H6.7l3.5-4.9H7.6z"/><path d="M12 19.4v1.6"/>',
};

/**
 * Small string hash -> seeded random generator.
 * @param {string} text
 */
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * A torn, hand-cut outline: clipped top corners, slightly wavy edges.
 * @param {() => number} rnd
 * @returns {string} CSS clip-path polygon
 */
function outline(rnd) {
  const pts = [];
  const cut = 16 + rnd() * 6;
  const j = (a) => (rnd() - 0.5) * a;
  pts.push([cut + j(2), j(1.5)]);
  for (let x = cut + 10; x < 100 - cut; x += 12) pts.push([x + j(3), j(1.4)]);
  pts.push([100 - cut + j(2), j(1.5)]);
  pts.push([100 + j(1), cut * 0.8 + j(2)]);
  for (let y = cut + 12; y < 100; y += 11) pts.push([100 - Math.abs(j(2.2)), y + j(2)]);
  pts.push([100 - Math.abs(j(2)), 100 - Math.abs(j(1.5))]);
  for (let x = 88; x > 4; x -= 9) pts.push([x + j(3), 100 - Math.abs(j(2.4))]);
  pts.push([Math.abs(j(2)), 100 - Math.abs(j(1.5))]);
  for (let y = 88; y > cut + 6; y -= 11) pts.push([Math.abs(j(2.2)), y + j(2)]);
  pts.push([j(1), cut * 0.8 + j(2)]);
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(',')})`;
}

/**
 * Paper of the tag rendered on each gift in the tree scene (blender/wichtel-baum.blend),
 * chosen to stand out against that gift's wrapping. Same order as GIFTS in gifts.js.
 */
export const GIFT_TAG_PAPER = ['tanne', 'kraft', 'tanne', 'creme', 'rot', 'eis', 'kraft', 'creme', 'creme', 'kraft'];

/**
 * Look of one person's tag. With the gift index, the paper matches the tag in the render.
 * @param {string} name
 * @param {number} [index] position in data.json people[]
 */
export function tagStyle(name, index) {
  const rnd = seeded(name.toLowerCase());
  const seededPaper = PAPERS[Math.floor(rnd() * PAPERS.length)];
  const fixed = Number.isInteger(index) ? GIFT_TAG_PAPER[index % GIFT_TAG_PAPER.length] : null;
  const paper = PAPERS.find((p) => p.id === fixed) ?? seededPaper;
  const doodleKeys = Object.keys(DOODLES);
  const doodle = doodleKeys[Math.floor(rnd() * doodleKeys.length)];
  return {
    paper,
    doodle,
    clip: outline(rnd),
    tilt: (rnd() - 0.5) * 12,
    doodleAt: rnd() > 0.5 ? 'right' : 'left',
  };
}

/**
 * Apply a person's tag look to an element (as CSS custom properties) and return the doodle SVG.
 * @param {HTMLElement} el
 * @param {string} name
 * @param {number} [index] gift index, so the paper matches the rendered tag
 * @returns {string} inline SVG markup
 */
export function dressTag(el, name, index) {
  const s = tagStyle(name, index);
  el.style.setProperty('--tag-paper', s.paper.paper);
  el.style.setProperty('--tag-ink', s.paper.ink);
  el.style.setProperty('--tag-accent', s.paper.accent);
  el.style.setProperty('--tag-clip', s.clip);
  el.style.setProperty('--tilt', `${s.tilt.toFixed(1)}deg`);
  el.dataset.paper = s.paper.id;
  el.dataset.doodleAt = s.doodleAt;
  return `<svg class="doodle" viewBox="0 0 24 24" aria-hidden="true">${DOODLES[s.doodle]}</svg>`;
}
