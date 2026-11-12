/**
 * Shared helpers for generate.mjs and upgrade.mjs.
 */

import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { FIRST_WORDS, SECOND_WORDS } from './words.mjs';
import {
  KDF_DEFAULTS, sealEntry, openEntry, sealWishes, openWishes, sealVault, openVault, newWishKey, normalizePassword,
} from '../public/js/crypto.js';

/**
 * Print an error and stop.
 * @param {string} message
 */
export function fail(message) {
  console.error(`\n  Fehler: ${message}\n`);
  process.exit(1);
}

/**
 * Pick one item uniformly at random (crypto-grade).
 * @template T
 * @param {T[]} list
 * @returns {T}
 */
const pick = (list) => list[randomInt(list.length)];

/**
 * Make one easy-to-type password, unique within this draw.
 * @param {Set<string>} used passwords already handed out
 * @returns {string} e.g. "zimtstern-kerze-47"
 */
export function makePassword(used) {
  const first = [...new Set(FIRST_WORDS)];
  const second = [...new Set(SECOND_WORDS)];
  let pw;
  do pw = `${pick(first)}-${pick(second)}-${randomInt(10, 100)}`;
  while (used.has(pw));
  used.add(pw);
  return normalizePassword(pw);
}

/**
 * A longer password for the organiser: it guards every wish list.
 * About 2^40 combinations plus 600k PBKDF2 rounds.
 * @returns {string} e.g. "mandelkern-eule-winterabend-kugel-1987"
 */
export function makeAdminPassword() {
  const first = [...new Set(FIRST_WORDS)];
  const second = [...new Set(SECOND_WORDS)];
  return normalizePassword(`${pick(first)}-${pick(second)}-${pick(first)}-${pick(second)}-${randomInt(1000, 10000)}`);
}

/**
 * Read a plaintext wish backup exported from the admin page.
 * Accepts {people:{Name:{note,items}}} or {Name:{note,items}}.
 * @param {string|null} path
 * @returns {Record<string, object>}
 */
export function readWishSeed(path) {
  if (!path) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return raw.people && typeof raw.people === 'object' ? raw.people : raw;
  } catch (err) {
    fail(`Wunsch-Backup ${path} lässt sich nicht lesen: ${err.message}`);
  }
}

/**
 * Build and self-test a complete v2 data.json.
 * @param {{names:string[], draw:Map<string,string>, passwords:Map<string,string>, adminPassword:string, wishes?:Record<string,object>, kdf?:object}} input
 * @returns {Promise<object>}
 */
export async function buildData({ names, draw, passwords, adminPassword, wishes = {}, kdf = { ...KDF_DEFAULTS } }) {
  const keys = Object.fromEntries(names.map((n) => [n, newWishKey()]));

  const people = [];
  for (const giver of names) {
    const to = draw.get(giver);
    const entry = await sealEntry(giver, { to, k: keys[to], own: keys[giver] }, passwords.get(giver), kdf);
    // Round-trip check with the exact browser code; the result is compared, never shown.
    const back = await openEntry(entry, passwords.get(giver), kdf);
    if (!back || back.to !== to || back.k !== keys[to]) fail(`Selbsttest für ${giver} fehlgeschlagen.`);
    people.push(entry);
  }

  const sealedWishes = {};
  for (const name of names) {
    sealedWishes[name] = await sealWishes(name, keys[name], wishes[name] ?? { note: '', items: [] });
    if (!(await openWishes(name, keys[name], sealedWishes[name]))) fail(`Selbsttest Wunschliste ${name} fehlgeschlagen.`);
  }

  const admin = await sealVault(adminPassword, { keys }, kdf);
  const vault = await openVault(admin, adminPassword, kdf);
  if (!vault || names.some((n) => vault.keys[n] !== keys[n])) fail('Selbsttest Admin-Zugang fehlgeschlagen.');

  const now = new Date().toISOString();
  return { v: 2, created: now, updated: now, cipher: 'AES-256-GCM', kdf, people, wishes: sealedWishes, admin };
}

/**
 * Print the passwords to hand out.
 * @param {string[]} names
 * @param {Map<string,string>} passwords
 * @param {string} adminPassword
 */
export function printPasswords(names, passwords, adminPassword) {
  const width = Math.max(...names.map((n) => n.length));
  console.log('  Passwörter zum Verschicken (jede Person bekommt nur ihr eigenes):\n');
  for (const n of names) console.log(`    ${n.padEnd(width)}  ->  ${passwords.get(n)}`);
  console.log('\n  Dein Admin-Passwort für admin.html (nur für dich, verschick es nicht):\n');
  console.log(`    ${adminPassword}\n`);
  console.log('  Wer wen hat, steht nirgends. Nicht hier, nicht in der Datei.\n');
}

/**
 * Value of a "--flag value" option.
 * @param {string[]} argv
 * @param {string} flag
 * @returns {string|null}
 */
export function optionValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) fail(`${flag} braucht einen Wert.`);
  return v;
}
