/**
 * Who plays, and who must not draw whom.
 *
 * FIXED applies to new draws. To correct an existing encrypted draw
 * without changing passwords, run tools/korrigiere-zuordnung.mjs instead.
 * Running generate.mjs --force redraws everyone and changes all passwords.
 *
 * The order here is the order of the name tokens on the website.
 */

export const PARTICIPANTS = [
  { name: 'Irene' },
  { name: 'Ronald' },
  { name: 'Julian' },
  { name: 'Simeon' },
  { name: 'Evelyn' },
  { name: 'Sinan' },
  { name: 'Noah' },
  { name: 'Annalotta' },
  { name: 'Neele' },
  // Set to false if Sally isn't in this year, then re-run the generator.
  { name: 'Sally', active: true },
];

/**
 * Forbidden draws as [giver, receiver]. One direction per line.
 * Pairs that mention an inactive person are ignored automatically.
 */
export const FIXED = [
  ['Simeon', 'Julian'],
  ['Sinan', 'Evelyn'],
];

export const FORBIDDEN = [
  ['Evelyn', 'Simeon'],
  ['Noah', 'Sinan'],
  ['Sinan', 'Noah'],
  ['Simeon', 'Evelyn'],
  ['Sinan', 'Julian'],
];
