/**
 * The wax seal on the tag: a lumpy puddle of wax lit from the top left, a
 * pressed well with a bevelled edge, "FREIGEBEN" set on an arc inside the
 * ring, a raised W. When it breaks, it cracks into two halves that shift
 * apart a little, and stays on the tag.
 *
 * The lit wax surface needs SVG lighting filters, which are expensive to
 * redraw. So it is painted once per wax colour into a small bitmap and used
 * as an image; everything else is plain SVG shapes and text (the raised
 * letters get their light and shadow edges from two offset copies).
 */

const NS = 'http://www.w3.org/2000/svg';

/* Irregular outline of the wax puddle. */
const PUDDLE = 'M50 5.5c6.6 0 9.2 3.6 14.6 4.6 5.6 1 10.6-1.2 14 3.6 3.2 4.6.6 9 3.4 13.8 2.8 4.6 7.6 6.6 7.6 13.4 0 6.6-4.4 9-5.2 14.6-.8 5.8 1.6 10.6-3 14-4.6 3.4-9 .8-13.8 3.8-4.6 3-7 7.8-13.8 7.8-6.6 0-9-4.2-14.6-5-5.8-.8-10.6 1.4-14-3.2-3.4-4.6-.6-9-3.8-13.8-3-4.6-7.8-7-7.8-13.8 0-6.6 4.2-9.2 5-14.8.8-5.6-1.6-10.6 3-14 4.6-3.4 9-.6 13.8-3.6C42.2 9.4 43.4 5.5 50 5.5z';
/* The crack: down through the seal, slightly off centre. */
const CRACK = [[44, -2], [47, 14], [42.5, 27], [51, 39], [46.5, 52], [55, 64], [50.5, 77], [57, 90], [55, 102]];
/* Bitmap size of the wax surface: sharp up to about 3× the seal's size on screen. */
const BAKE = 360;

/**
 * @param {string} tag
 * @param {Record<string, string|number>} [attrs]
 * @param {Node[]} [kids]
 */
function node(tag, attrs = {}, kids = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  kids.forEach((k) => n.append(k));
  return n;
}

/** Mix two #rrggbb colours. @param {number} t share of b */
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

const baked = new Map();

/**
 * The lit wax puddle for one wax colour, as a PNG data URL (painted once, then cached).
 * @param {string} wax #rrggbb
 * @returns {Promise<string>}
 */
function waxSurface(wax) {
  if (baked.has(wax)) return baked.get(wax);
  const hi = mix(wax, '#ff9c86', 0.38);
  const lo = mix(wax, '#1a0003', 0.42);
  const svg = `<svg xmlns="${NS}" viewBox="0 0 100 100" width="${BAKE}" height="${BAKE}">
<defs>
<radialGradient id="g" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="${hi}"/><stop offset="0.5" stop-color="${wax}"/><stop offset="1" stop-color="${lo}"/></radialGradient>
<filter id="f" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="noise"/>
<feGaussianBlur in="SourceAlpha" stdDeviation="3.2" result="dome"/>
<feComposite in="noise" in2="dome" operator="arithmetic" k2="0.18" k3="1" result="height"/>
<feDiffuseLighting in="height" surfaceScale="6" diffuseConstant="1.08" lighting-color="#ffffff" result="diffuse"><feDistantLight azimuth="225" elevation="52"/></feDiffuseLighting>
<feComposite in="SourceGraphic" in2="diffuse" operator="arithmetic" k1="1" result="shaded"/>
<feSpecularLighting in="height" surfaceScale="6" specularConstant="0.85" specularExponent="24" lighting-color="#ffe9e0" result="spec"><feDistantLight azimuth="225" elevation="42"/></feSpecularLighting>
<feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
<feComposite in="shaded" in2="SourceAlpha" operator="in" result="shadedIn"/>
<feComposite in="specIn" in2="shadedIn" operator="arithmetic" k2="0.55" k3="1"/>
</filter>
</defs>
<path d="${PUDDLE}" fill="url(#g)" filter="url(#f)"/>
</svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const job = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = BAKE;
        c.getContext('2d').drawImage(img, 0, 0, BAKE, BAKE);
        resolve(c.toDataURL('image/png'));
      } catch {
        resolve(url);
      }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
  baked.set(wax, job);
  return job;
}

/**
 * Put the wax colour of this tag into the seal (both halves).
 * @param {SVGSVGElement} svg
 * @param {string} wax #rrggbb
 */
export async function paintSeal(svg, wax) {
  const colour = /^#[0-9a-f]{6}$/i.test(wax) ? wax : '#a5121c';
  svg.dataset.wax = colour;
  const href = await waxSurface(colour);
  if (svg.dataset.wax !== colour) return;
  svg.querySelectorAll('.seal__puddle').forEach((im) => im.setAttribute('href', href));
}

let uid = 0;

/**
 * Fill an empty <svg class="seal__svg"> with the seal.
 * @param {SVGSVGElement} svg
 * @param {string} [wax]
 */
export function buildSeal(svg, wax = '#a5121c') {
  const id = `seal${++uid}`;
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.replaceChildren();
  const crackPts = CRACK.map(([x, y]) => `${x} ${y}`).join(' L');
  svg.append(
    node('defs', {}, [
      node('radialGradient', { id: `${id}-well`, cx: '62%', cy: '68%', r: '72%' }, [
        node('stop', { offset: '0', class: 'seal__w1' }),
        node('stop', { offset: '1', class: 'seal__w2' }),
      ]),
      node('path', { id: `${id}-top`, d: 'M26.2 51a23.8 23.8 0 0 1 47.6 0' }),
      node('path', { id: `${id}-bottom`, d: 'M27.5 55a22.5 22.5 0 0 0 45 0' }),
      node('clipPath', { id: `${id}-l` }, [node('path', { d: `M-5 -5 L${crackPts} L-5 105z` })]),
      node('clipPath', { id: `${id}-r` }, [node('path', { d: `M105 -5 L${crackPts} L105 105z` })]),
    ])
  );

  /** The letters, once (as shadow, light edge or face). */
  const letters = (cls, dx = 0, dy = 0) => {
    const g = node('g', { class: cls, transform: `translate(${dx} ${dy})` });
    const word = node('text', { class: 'seal__word' });
    const wordPath = node('textPath', { href: `#${id}-top`, startOffset: '50%', 'text-anchor': 'middle' });
    wordPath.textContent = 'FREIGEBEN';
    word.append(wordPath);
    const year = node('text', { class: 'seal__year' });
    const yearPath = node('textPath', { href: `#${id}-bottom`, startOffset: '50%', 'text-anchor': 'middle' });
    yearPath.textContent = '✶ WICHTELN ✶';
    year.append(yearPath);
    const mono = node('text', { class: 'seal__mono', x: 50, y: 58.6, 'text-anchor': 'middle' });
    mono.textContent = 'W';
    g.append(word, year, mono);
    return g;
  };

  const body = () =>
    node('g', {}, [
      node('image', { class: 'seal__puddle', x: 0, y: 0, width: 100, height: 100, preserveAspectRatio: 'none' }),
      // The pressed well with its bevel: dark where the light can't reach, bright on the far edge.
      node('circle', { class: 'seal__well', cx: 50, cy: 51, r: 31, fill: `url(#${id}-well)` }),
      node('path', { class: 'seal__bevel-dark', d: 'M23.2 63.5A31 31 0 0 1 62.5 22.6' }),
      node('path', { class: 'seal__bevel-light', d: 'M76.8 38.5A31 31 0 0 1 37.5 79.4' }),
      node('circle', { class: 'seal__ring', cx: 50, cy: 51, r: 17.2 }),
      // Raised letters: a shadow below right, a highlight above left, the face on top.
      letters('seal__raised seal__raised--shadow', 0.55, 0.7),
      letters('seal__raised seal__raised--light', -0.45, -0.55),
      letters('seal__raised'),
    ]);

  svg.append(
    node('g', { class: 'seal__half seal__half--l', 'clip-path': `url(#${id}-l)` }, [body()]),
    node('g', { class: 'seal__half seal__half--r', 'clip-path': `url(#${id}-r)` }, [body()])
  );
  paintSeal(svg, wax);
}
