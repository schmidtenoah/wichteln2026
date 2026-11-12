/**
 * CSS transform that maps an element's box (w × h, transform-origin 0 0) onto
 * any four screen points: a projective transform, so a flat HTML element can
 * lie exactly on a plane seen in perspective (the tag and the wish list in the
 * 3D scene are the very same HTML elements you saw before).
 * @param {number} w
 * @param {number} h
 * @param {number[][]} q corners: top left, top right, bottom right, bottom left
 * @returns {string}
 */
export function quadTransform(w, h, q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const k = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-12 ? 0 : v).toFixed(9)).join(',')})`;
}

/** The corners of a plain rectangle. */
export const rectCorners = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Blend two corner sets. @param {number} u 0..1 */
export const mixCorners = (a, b, u) => a.map(([x, y], i) => [x + (b[i][0] - x) * u, y + (b[i][1] - y) * u]);
