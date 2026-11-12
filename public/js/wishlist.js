/**
 * The wish list: one card, the wishes scattered across it like on a
 * hand-made list. Each wish is a cut-out picture with its name next to it,
 * a small drawn arrow pointing from the name to the picture. Picture and
 * name are the link to the shop.
 *
 * Plain HTML (real links, readable by screen readers), sized in container
 * units, so the same card can lie in the 3D scene, be read full screen, and
 * be previewed in admin.html. The layout is computed, never random: the same
 * list always looks the same.
 */

import { SITE } from '../config.js';

/* Card geometry in cqw: side margin of the wishes, where the field starts below the head, room for the foot. */
const FIELD_SIDE = 7;
const HEAD = 50.5;
const FOOT = 9;
const BASE_RATIO = 1.46;

/** German possessive. @param {string} name */
export const genitive = (name) => (/[sßxz]$/i.test(name) ? `${name}’` : `${name}s`);

/**
 * @param {string} tag
 * @param {string} [cls]
 * @param {string} [text]
 */
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Small deterministic random generator. @param {number} seed */
function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

/** Host name for a link, for the accessible label. @param {string} url */
function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Where everything goes. All values in cqw (hundredths of the card width).
 * @param {number} n number of wishes
 * @param {string[]} names for caption sizes
 * @param {number} top where the field starts
 * @param {number} minHeight height the field has at least
 * @param {number} [forceCols] columns, if not chosen by count
 */
export function layout(n, names, top, minHeight, forceCols = 0) {
  const cols = forceCols || (n <= 1 ? 1 : n <= 6 ? 2 : 3);
  const rows = Math.ceil(n / cols);
  const width = 100 - FIELD_SIDE * 2;
  const cellW = width / cols;
  const minCell = cols === 1 ? 56 : cols === 2 ? 36 : 32;
  // Cells never get much taller than wide: few wishes sit closer together, the rest of the card breathes.
  const cellH = Math.max(minCell, Math.min(minHeight / Math.max(1, rows), cellW * (cols === 1 ? 0.8 : cols === 2 ? 1.05 : 1.2)));
  const height = Math.max(minHeight, cellH * rows);
  const rowGap = (height - cellH * rows) / (rows + 1);
  const font = cols === 1 ? 4.4 : cols === 2 ? 3.3 : 2.9;
  const rnd = seeded(n * 7 + 3);
  // Caption beside or above/below the picture; the pattern wanders so the card never looks like a grid.
  // Where each caption goes. Never a caption below one picture and right above the next one's caption:
  // captions sit above their picture, only the last row has them below. Left and right alternate.
  const variantFor = (row, col) => {
    if (cols === 1) return 'br';
    if (rows === 1) return col % 2 ? 'br' : 'tl';
    // A whole row leans the same way, so two captions never meet head-on at a cell border.
    if (row === rows - 1) return row % 2 ? 'br' : 'bl';
    return row % 2 ? 'tr' : 'tl';
  };
  const slots = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const inRow = Math.min(cols, n - row * cols);
    const shift = ((cols - inRow) * cellW) / 2;
    const cx = FIELD_SIDE + shift + col * cellW;
    const cy = rowGap * (row + (rows === 1 && !forceCols ? 0.7 : 1)) + row * cellH;
    const v = variantFor(row, col);
    const capW = Math.min(cellW * (v === 'r' || v === 'l' ? 0.46 : cols === 3 ? 0.82 : 0.8), 36);
    const chars = Array.from(names[i] || '').length;
    // Italic Fraunces runs at about 0.55 em per character.
    const lines = Math.min(3, Math.max(1, Math.ceil((chars * font * 0.55) / capW)));
    const capH = lines * font * 1.08;
    const side = v === 'r' || v === 'l';
    const room = side ? Math.min(cellW - capW - 6, cellH - 6) : Math.min(cellW - 4, cellH - capH - 9);
    const s = Math.max(12, Math.min(cols === 1 ? 50 : cellW * (cols === 2 ? 0.74 : forceCols ? 0.8 : 0.72), room) * (0.88 + rnd() * 0.12));
    const jx = (rnd() - 0.5) * cellW * 0.08;
    const jy = (rnd() - 0.5) * cellH * 0.06;
    let img;
    let cap;
    if (v === 'tl') {
      img = { x: cx + cellW - s - 2 + jx, y: cy + cellH - s - 2 + jy };
      cap = { x: cx + 2, y: cy + 2, align: 'left' };
    } else if (v === 'br') {
      img = { x: cx + (cols === 1 ? (cellW - s) / 2 - 8 : 2) + jx, y: cy + 2 + jy };
      cap = { x: cx + cellW - capW - 2, y: cy + cellH - capH - 2, align: 'right' };
    } else if (v === 'tr') {
      img = { x: cx + 2 + jx, y: cy + cellH - s - 2 + jy };
      cap = { x: cx + cellW - capW - 2, y: cy + 2, align: 'right' };
    } else if (v === 'bl') {
      img = { x: cx + cellW - s - 2 + jx, y: cy + 2 + jy };
      cap = { x: cx + 2, y: cy + cellH - capH - 2, align: 'left' };
    } else if (v === 'r') {
      img = { x: cx + 1 + jx, y: cy + (cellH - s) / 2 + jy };
      cap = { x: cx + cellW - capW - 1, y: cy + (cellH - capH) / 2 + cellH * 0.12, align: 'left' };
    } else {
      img = { x: cx + cellW - s - 1 + jx, y: cy + (cellH - s) / 2 + jy };
      cap = { x: cx + 1, y: cy + (cellH - capH) / 2 - cellH * 0.12, align: 'right' };
    }
    slots.push({ v, s, img, cap: { ...cap, w: capW, h: capH }, font, bend: i % 2 ? 1 : -1 });
  }
  return { slots, height, top };
}

/**
 * A drawn arrow from the caption to the picture: a soft curve with a small open head.
 * @returns {string} SVG path data
 */
function arrowPath(slot) {
  const { img, s, cap, v } = slot;
  const icx = img.x + s / 2;
  const icy = img.y + s / 2;
  // Start next to the caption, on the side facing the picture.
  let x0 = cap.align === 'right' ? cap.x + cap.w - 2 : cap.x + 2;
  let y0 = v.startsWith('t') ? cap.y + cap.h + 1.2 : v.startsWith('b') ? cap.y - 1.2 : cap.y + cap.h / 2;
  if (v === 'r') x0 = cap.x - 1.5;
  if (v === 'l') x0 = cap.x + cap.w + 1.5;
  // End just short of the picture's centre, on its edge.
  const dx = icx - x0;
  const dy = icy - y0;
  const len = Math.hypot(dx, dy) || 1;
  const reach = Math.max(0, len - s * 0.42);
  const x1 = x0 + (dx / len) * reach;
  const y1 = y0 + (dy / len) * reach;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const bend = slot.bend * Math.min(9, reach * 0.32);
  const cx = mx - (dy / len) * bend;
  const cy = my + (dx / len) * bend;
  // A hand-drawn line is never a perfect curve: two slightly different controls.
  const c1x = x0 + (cx - x0) * 0.8 + 0.4;
  const c1y = y0 + (cy - y0) * 0.8 - 0.3;
  const c2x = x1 + (cx - x1) * 0.7 - 0.3;
  const c2y = y1 + (cy - y1) * 0.7 + 0.4;
  const tx = x1 - c2x;
  const ty = y1 - c2y;
  const tl = Math.hypot(tx, ty) || 1;
  const head = 2.3;
  const wing = (a) => {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const ux = -(tx / tl);
    const uy = -(ty / tl);
    return `${(x1 + (ux * c - uy * sn) * head).toFixed(2)} ${(y1 + (ux * sn + uy * c) * head).toFixed(2)}`;
  };
  const f = (n) => n.toFixed(2);
  return `M${f(x0)} ${f(y0)}C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(x1)} ${f(y1)}M${wing(0.5)}L${f(x1)} ${f(y1)}L${wing(-0.5)}`;
}

/* ------------------------------------------------------------------------ */
/* Ornaments: the bow at the top, the star rules, the frame                 */
/* ------------------------------------------------------------------------ */

const NS = 'http://www.w3.org/2000/svg';

/** A sprig of fir: needles along a gentle curve, a few berries. */
function sprig(x0, y0, x1, y1, bend) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2 + bend;
  const at = (t) => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1];
  const parts = [`<path class="o-stem" d="M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}"/>`];
  const steps = 15;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const [x, y] = at(t);
    const [nx, ny] = at(Math.min(1, t + 0.02));
    // Needles point towards the tip, shorter there.
    const a = Math.atan2(ny - y, nx - x);
    const len = 4.4 * (1 - t * 0.5);
    for (const side of [-1, 1]) {
      const b = a + side * 0.72;
      parts.push(`<path class="o-needle${i % 3 ? '' : ' o-needle--light'}" d="M${x.toFixed(2)} ${y.toFixed(2)}l${(Math.cos(b) * len).toFixed(2)} ${(Math.sin(b) * len).toFixed(2)}"/>`);
    }
  }
  return parts.join('');
}

let ornament = '';
/** Bow with two sprigs of fir and berries, drawn like an engraving. */
function bowOrnament() {
  if (ornament) return ornament;
  const berries = [[28, 27.5], [31, 30.5], [26, 31], [92, 27.5], [89, 30.5], [94, 31]]
    .map(([x, y]) => `<circle class="o-berry" cx="${x}" cy="${y}" r="1.9"/><circle class="o-shine" cx="${x - 0.6}" cy="${y - 0.6}" r="0.5"/>`)
    .join('');
  ornament = `<svg class="wl__bow" viewBox="0 0 120 46" aria-hidden="true">
<g>${sprig(54, 27, 6, 29, -6)}${sprig(66, 27, 114, 29, -6)}${sprig(52, 29, 18, 36, 3)}${sprig(68, 29, 102, 36, 3)}</g>
${berries}
<path class="o-ribbon" d="M58.6 24.2C52 13 37.6 6.4 34.6 13.6c-2.8 6.8 9.6 12.8 23.4 12.4z"/>
<path class="o-ribbon" d="M61.4 24.2C68 13 82.4 6.4 85.4 13.6c2.8 6.8-9.6 12.8-23.4 12.4z"/>
<path class="o-fold" d="M57 23.4C51.4 17 42.8 12.6 39.4 14.4M63 23.4c5.6-6.4 14.2-10.8 17.6-9"/>
<path class="o-ribbon" d="M58.4 26.6c-2.4 6.6-6.8 12.6-11.6 17.2l4.6-.4 1.2 3.8c4-5.4 7.4-12 9.2-19.2z"/>
<path class="o-ribbon" d="M61.6 26.6c2.4 6.6 6.8 12.6 11.6 17.2l-4.6-.4-1.2 3.8c-4-5.4-7.4-12-9.2-19.2z"/>
<ellipse class="o-knot" cx="60" cy="25.2" rx="4" ry="4.8"/>
<path class="o-fold" d="M58.2 22.6c1.2 1.8 1.2 3.6 0 5.4"/>
</svg>`;
  return ornament;
}

/** A thin gold rule with a small four-pointed star in the middle. */
function starRule(cls) {
  const r = el('div', `wl__rule ${cls}`);
  r.setAttribute('aria-hidden', 'true');
  r.innerHTML = '<svg viewBox="0 0 12 12"><path d="M6 0c.5 3.6 2.4 5.5 6 6-3.6.5-5.5 2.4-6 6-.5-3.6-2.4-5.5-6-6 3.6-.5 5.5-2.4 6-6z"/></svg>';
  return r;
}

/**
 * Outline of a box with its corners cut in (as on an old label).
 * @returns {string} path data
 */
function notched(x, y, w, h, r) {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 0 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 0 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 0 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 0 ${x + r} ${y}z`;
}

/** "1. Dezember" from config, for the editors' promise. */
const deadline = () => (SITE.wishDeadline || '1. Dezember').replace(/\s+/g, '\u00a0');

/**
 * Build the card.
 * @param {{receiver:string, giver:string, list:{note?:string, items:{title:string, link?:string, image?:string}[]}|null, own?:boolean}} data
 * @returns {{el:HTMLElement, ratio:number}}
 */
export function createWishlist({ receiver, giver, list, own = false }) {
  const items = list?.items ?? [];
  const note = (list?.note ?? '').trim();
  const card = el('article', 'wl');
  card.setAttribute('aria-label', own ? 'Dein Wunschzettel' : `${genitive(receiver)} Wunschzettel`);

  // Head: the bow, budget and day set into the frame's top line, the title, a star rule, an optional note.
  const head = el('header', 'wl__head');
  head.insertAdjacentHTML('beforeend', bowOrnament());
  const meta = el('p', 'wl__meta');
  meta.append(el('span', 'wl__meta-l', `Bis ${SITE.budget} €`), el('span', 'wl__meta-r', SITE.date ? `Bescherung ${SITE.date}` : `Winter ${SITE.year}`));
  const title = el('h2', 'wl__title');
  const whose = own ? 'Dein' : genitive(receiver);
  const nameLine = el('span', 'wl__whose', whose);
  nameLine.style.setProperty('--len', String(Math.max(5, Array.from(whose).length)));
  title.append(nameLine, el('span', 'wl__word', 'Wunschzettel'));
  head.append(meta, title, starRule('wl__rule--top'));
  let top = HEAD;
  if (note) {
    head.append(el('p', 'wl__note', note));
    top = HEAD + 8;
  }
  card.append(head);

  const minField = BASE_RATIO * 100 - top - FOOT;
  const field = el('div', 'wl__field');
  let height = minField;

  if (items.length) {
    const plan = layout(items.length, items.map((i) => i.title), top, minField);
    height = plan.height;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'wl__arrows');
    svg.setAttribute('viewBox', `0 0 100 ${height.toFixed(2)}`);
    svg.setAttribute('aria-hidden', 'true');
    const ul = el('ul', 'wl__items');
    items.forEach((item, i) => {
      const slot = plan.slots[i];
      const li = el('li', 'wl__item');
      const name = item.title || host(item.link) || `Wunsch ${i + 1}`;
      const link = item.link || '';
      const mk = (cls) => {
        const a = el(link ? 'a' : 'span', cls);
        if (link) {
          a.href = link;
          a.target = '_blank';
          a.rel = 'noopener noreferrer nofollow';
        }
        return a;
      };
      const pic = mk('wl__pic');
      Object.assign(pic.style, { left: `${slot.img.x}cqw`, top: `${slot.img.y}cqw`, width: `${slot.s}cqw`, height: `${slot.s}cqw` });
      if (item.image) {
        const img = el('img');
        img.src = item.image;
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        pic.append(img);
      } else {
        pic.classList.add('wl__pic--none');
        pic.append(el('span', '', Array.from(name.trim())[0]?.toUpperCase() ?? '·'));
      }
      // The picture repeats the link of the name: one tab stop per wish.
      if (link) {
        pic.tabIndex = -1;
        pic.setAttribute('aria-hidden', 'true');
      }
      const cap = mk('wl__cap');
      cap.textContent = name;
      if (link) cap.setAttribute('aria-label', `${name}, bei ${host(link) || 'dem Shop'} ansehen (neuer Tab)`);
      Object.assign(cap.style, { left: `${slot.cap.x}cqw`, top: `${slot.cap.y}cqw`, width: `${slot.cap.w}cqw`, textAlign: slot.cap.align, fontSize: `max(${slot.font}cqw, 11px)` });
      li.append(pic, cap);
      ul.append(li);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', arrowPath(slot));
      svg.append(path);
    });
    field.append(svg, ul);
  } else {
    // Empty: the editors are still waiting for the list. Three dashed boxes hold the places.
    card.classList.add('wl--empty');
    const msg = el('div', 'wl__wait');
    msg.append(
      el('p', 'wl__wait-title', own ? 'Hier ist noch alles leer.' : 'Noch ganz leer.'),
      el(
        'p',
        'wl__wait-text',
        own
          ? `Schick ${SITE.organizer || 'der Wichtel-Redaktion'} deine Wünsche, am besten mit Bild und Link. Bis zum ${deadline()} steht hier alles drauf.`
          : `${receiver} schreibt noch an der Liste. Spätestens am ${deadline()} steht hier alles drauf.`
      )
    );
    const ghostTop = 21;
    const gh = minField - ghostTop;
    const labels = ['kommt noch', 'und hier', 'vielleicht noch was'];
    const plan = layout(3, labels, top, gh, 3);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'wl__arrows wl__arrows--ghost');
    svg.setAttribute('viewBox', `0 0 100 ${gh.toFixed(2)}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.style.top = `${ghostTop}cqw`;
    svg.style.height = `${gh}cqw`;
    svg.innerHTML = '<defs><pattern id="wl-hatch" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V2.2" class="wl__hatch"/></pattern></defs>';
    const ghosts = el('div', 'wl__ghosts');
    ghosts.setAttribute('aria-hidden', 'true');
    ghosts.style.top = `${ghostTop}cqw`;
    labels.forEach((label, i) => {
      const slot = plan.slots[i];
      const inset = slot.s * 0.06;
      const box = document.createElementNS(NS, 'path');
      box.setAttribute('class', 'wl__ghost');
      box.setAttribute('d', notched(slot.img.x + inset, slot.img.y + inset, slot.s - inset * 2, slot.s - inset * 2, 2.2));
      const arrow = document.createElementNS(NS, 'path');
      arrow.setAttribute('d', arrowPath(slot));
      svg.append(box, arrow);
      const cap = el('span', 'wl__cap wl__cap--ghost', label);
      Object.assign(cap.style, { left: `${slot.cap.x}cqw`, top: `${slot.cap.y}cqw`, width: `${slot.cap.w}cqw`, textAlign: slot.cap.align, fontSize: `max(${slot.font}cqw, 11px)` });
      ghosts.append(cap);
    });
    field.append(msg, svg, ghosts);
  }
  field.style.top = `${top}cqw`;
  field.style.height = `${height}cqw`;
  card.append(field);

  const total = top + height + FOOT;
  const foot = el('footer', 'wl__foot');
  const sign = el('p', 'wl__sign');
  sign.append(el('span', '', 'Die Wichtel-Redaktion'), el('span', '', `Winter ${SITE.year}`));
  foot.append(sign);
  card.append(foot);

  // The frame: a thin gold line with cut-in corners, broken where the budget and the day sit in it.
  const frame = document.createElementNS(NS, 'svg');
  frame.setAttribute('class', 'wl__frame');
  frame.setAttribute('viewBox', `0 0 100 ${total.toFixed(2)}`);
  frame.setAttribute('aria-hidden', 'true');
  frame.innerHTML = `<path d="${notched(3, 3, 94, total - 6, 3.2)}"/>`;
  card.prepend(frame);

  const ratio = total / 100;
  card.style.setProperty('--ratio', ratio.toFixed(4));
  void giver;
  return { el: card, ratio };
}
