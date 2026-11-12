/**
 * The wax seal on the tag, drawn as SVG with real light: a lumpy puddle of
 * wax lit from the top left (SVG lighting filters), a pressed well with a
 * bevelled edge, "FREIGEBEN" set on an arc inside the ring, a raised W.
 * When it breaks, it cracks into two halves that shift apart a little, and
 * stays on the tag.
 */

const NS = 'http://www.w3.org/2000/svg';

/* Irregular outline of the wax puddle. */
const PUDDLE = 'M50 5.5c6.6 0 9.2 3.6 14.6 4.6 5.6 1 10.6-1.2 14 3.6 3.2 4.6.6 9 3.4 13.8 2.8 4.6 7.6 6.6 7.6 13.4 0 6.6-4.4 9-5.2 14.6-.8 5.8 1.6 10.6-3 14-4.6 3.4-9 .8-13.8 3.8-4.6 3-7 7.8-13.8 7.8-6.6 0-9-4.2-14.6-5-5.8-.8-10.6 1.4-14-3.2-3.4-4.6-.6-9-3.8-13.8-3-4.6-7.8-7-7.8-13.8 0-6.6 4.2-9.2 5-14.8.8-5.6-1.6-10.6 3-14 4.6-3.4 9-.6 13.8-3.6C42.2 9.4 43.4 5.5 50 5.5z';
/* The crack: down through the seal, slightly off centre. */
const CRACK = [[44, -2], [47, 14], [42.5, 27], [51, 39], [46.5, 52], [55, 64], [50.5, 77], [57, 90], [55, 102]];

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

let uid = 0;

/**
 * Fill an empty <svg class="seal__svg"> with the seal.
 * @param {SVGSVGElement} svg
 */
export function buildSeal(svg) {
  const id = `seal${++uid}`;
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.replaceChildren();
  const crackPts = CRACK.map(([x, y]) => `${x} ${y}`).join(' L');
  const light = (azimuth, elevation) => node('feDistantLight', { azimuth, elevation });
  const defs = node('defs', {}, [
    node('radialGradient', { id: `${id}-wax`, cx: '36%', cy: '30%', r: '78%' }, [
      node('stop', { offset: '0', class: 'seal__s1' }),
      node('stop', { offset: '0.5', class: 'seal__s2' }),
      node('stop', { offset: '1', class: 'seal__s3' }),
    ]),
    node('radialGradient', { id: `${id}-well`, cx: '62%', cy: '68%', r: '72%' }, [
      node('stop', { offset: '0', class: 'seal__w1' }),
      node('stop', { offset: '1', class: 'seal__w2' }),
    ]),
    // The wax surface: a soft dome from the outline plus a little lumpiness, lit from the top left.
    node('filter', { id: `${id}-lit`, x: '-10%', y: '-10%', width: '120%', height: '120%', 'color-interpolation-filters': 'sRGB' }, [
      node('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.045', numOctaves: '2', seed: '7', result: 'noise' }),
      node('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: '3.2', result: 'dome' }),
      node('feComposite', { in: 'noise', in2: 'dome', operator: 'arithmetic', k2: '0.18', k3: '1', result: 'height' }),
      node('feDiffuseLighting', { in: 'height', surfaceScale: '6', diffuseConstant: '1.08', 'lighting-color': '#ffffff', result: 'diffuse' }, [light(225, 52)]),
      node('feComposite', { in: 'SourceGraphic', in2: 'diffuse', operator: 'arithmetic', k1: '1', result: 'shaded' }),
      node('feSpecularLighting', { in: 'height', surfaceScale: '6', specularConstant: '0.85', specularExponent: '24', 'lighting-color': '#ffe9e0', result: 'spec' }, [light(225, 42)]),
      node('feComposite', { in: 'spec', in2: 'SourceAlpha', operator: 'in', result: 'specIn' }),
      node('feComposite', { in: 'shaded', in2: 'SourceAlpha', operator: 'in', result: 'shadedIn' }),
      node('feComposite', { in: 'specIn', in2: 'shadedIn', operator: 'arithmetic', k2: '0.55', k3: '1' }),
    ]),
    // Raised letters: a highlight on the top left edge, a shadow on the bottom right.
    node('filter', { id: `${id}-raise`, x: '-20%', y: '-20%', width: '140%', height: '140%', 'color-interpolation-filters': 'sRGB' }, [
      node('feOffset', { in: 'SourceAlpha', dx: '0.55', dy: '0.7', result: 'o1' }),
      node('feGaussianBlur', { in: 'o1', stdDeviation: '0.35', result: 'b1' }),
      node('feFlood', { 'flood-color': '#1c0204', 'flood-opacity': '0.7' }),
      node('feComposite', { in2: 'b1', operator: 'in', result: 'shadow' }),
      node('feOffset', { in: 'SourceAlpha', dx: '-0.45', dy: '-0.55', result: 'o2' }),
      node('feFlood', { 'flood-color': '#ffd2c4', 'flood-opacity': '0.55' }),
      node('feComposite', { in2: 'o2', operator: 'in', result: 'light' }),
      node('feMerge', {}, [node('feMergeNode', { in: 'shadow' }), node('feMergeNode', { in: 'light' }), node('feMergeNode', { in: 'SourceGraphic' })]),
    ]),
    node('path', { id: `${id}-top`, d: 'M26.2 51a23.8 23.8 0 0 1 47.6 0' }),
    node('path', { id: `${id}-bottom`, d: 'M27.5 55a22.5 22.5 0 0 0 45 0' }),
    node('clipPath', { id: `${id}-l` }, [node('path', { d: `M-5 -5 L${crackPts} L-5 105z` })]),
    node('clipPath', { id: `${id}-r` }, [node('path', { d: `M105 -5 L${crackPts} L105 105z` })]),
  ]);
  svg.append(defs);

  const body = () => {
    const g = node('g');
    g.append(
      node('path', { class: 'seal__puddle', d: PUDDLE, fill: `url(#${id}-wax)`, filter: `url(#${id}-lit)` }),
      // The pressed well with its bevel: dark where the light can't reach, bright on the far edge.
      node('circle', { class: 'seal__well', cx: 50, cy: 51, r: 31, fill: `url(#${id}-well)` }),
      node('path', { class: 'seal__bevel-dark', d: 'M23.2 63.5A31 31 0 0 1 62.5 22.6' }),
      node('path', { class: 'seal__bevel-light', d: 'M76.8 38.5A31 31 0 0 1 37.5 79.4' }),
      node('circle', { class: 'seal__ring', cx: 50, cy: 51, r: 17.2 })
    );
    const raised = node('g', { class: 'seal__raised', filter: `url(#${id}-raise)` });
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
    raised.append(word, year, mono);
    g.append(raised);
    return g;
  };
  svg.append(
    node('g', { class: 'seal__half seal__half--l', 'clip-path': `url(#${id}-l)` }, [body()]),
    node('g', { class: 'seal__half seal__half--r', 'clip-path': `url(#${id}-r)` }, [body()])
  );
}
