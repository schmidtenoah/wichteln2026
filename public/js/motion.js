/**
 * Motion preferences and capability checks.
 */

const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Whether the person asked their system for less motion.
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return reduceQuery.matches;
}

/**
 * Call back whenever the reduced-motion setting changes.
 * @param {(reduced:boolean)=>void} callback
 */
export function onReducedMotionChange(callback) {
  reduceQuery.addEventListener('change', () => callback(reduceQuery.matches));
}

/**
 * Whether WebGL is available at all (old devices, blocked GPUs).
 * @returns {boolean}
 */
export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Rough guess whether to spend less GPU time (small screens, few cores).
 * @returns {boolean}
 */
export function isLowPower() {
  return window.matchMedia('(max-width: 700px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
}
