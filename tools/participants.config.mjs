/**
 * Who plays, and who must not draw whom.
 *
 * After any change here run:  node tools/generate.mjs --force
 * That makes a completely new draw with new passwords for everyone,
 * so the old passwords stop working. Send everyone their new one.
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
export const FORBIDDEN = [
  ['Evelyn', 'Simeon'],
  ['Noah', 'Sinan'],
  ['Sinan', 'Noah'],
];
