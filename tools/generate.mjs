#!/usr/bin/env node
/**
 * Wichteln draw generator. Run once, locally:
 *
 *   node tools/generate.mjs                         first draw
 *   node tools/generate.mjs --force                 redraw (new passwords for everyone)
 *   node tools/generate.mjs --wishes backup.json    keep wish lists from an admin-page backup
 *   node tools/generate.mjs --admin-password "..."  choose the organiser password yourself
 *   node tools/generate.mjs --out x.json            write somewhere else (for testing)
 *
 * It draws one single cycle through everyone that respects the forbidden
 * pairs, encrypts each person's result with their own password and writes
 * public/data.json. It prints ONLY "name -> password" plus the admin
 * password. The pairings are never printed, logged or saved in plaintext.
 */

import { randomInt } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PARTICIPANTS, FORBIDDEN, FIXED } from './participants.config.mjs';
import { normalizePassword } from '../public/js/crypto.js';
import { fail, makePassword, makeAdminPassword, readWishSeed, buildData, printPasswords, optionValue } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_ATTEMPTS = 100000;

/**
 * Read command-line flags.
 * @param {string[]} argv process arguments after the script name
 * @returns {{force:boolean, out:string, wishes:string|null, admin:string|null}}
 */
function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node tools/generate.mjs [--force] [--wishes backup.json] [--admin-password "..."] [--out path/to/data.json]');
    process.exit(0);
  }
  const known = new Set(['--force', '--out', '--wishes', '--admin-password']);
  argv.forEach((a, i) => {
    if (a.startsWith('--') && !known.has(a)) fail(`Unbekannte Option: ${a}`);
    if (!a.startsWith('--') && !['--out', '--wishes', '--admin-password'].includes(argv[i - 1])) fail(`Unerwartetes Argument: ${a}`);
  });
  const out = optionValue(argv, '--out');
  const wishes = optionValue(argv, '--wishes');
  return {
    force: argv.includes('--force'),
    out: out ? resolve(process.cwd(), out) : resolve(ROOT, 'public', 'data.json'),
    wishes: wishes ? resolve(process.cwd(), wishes) : null,
    admin: optionValue(argv, '--admin-password'),
  };
}

/**
 * Validate the config and return the active names plus a lookup of forbidden draws.
 * @returns {{names:string[], forbidden:Set<string>, fixed:Map<string,string>}}
 */
function loadConfig() {
  const all = PARTICIPANTS.map((p) => String(p.name).trim());
  const names = PARTICIPANTS.filter((p) => p.active !== false).map((p) => String(p.name).trim());

  if (new Set(all.map((n) => n.toLowerCase())).size !== all.length) fail('Ein Name steht doppelt in der Config.');
  if (names.some((n) => !n)) fail('Ein Teilnehmer hat keinen Namen.');
  if (names.length < 3) fail('Für einen echten Kreis braucht es mindestens drei Leute.');

  const forbidden = new Set();
  for (const [giver, receiver] of FORBIDDEN) {
    for (const n of [giver, receiver]) if (!all.includes(n)) fail(`Verbotenes Paar nennt "${n}", der Name steht aber nicht in PARTICIPANTS.`);
    if (names.includes(giver) && names.includes(receiver)) forbidden.add(`${giver}\u0000${receiver}`);
  }
  const fixed = new Map();
  const receivers = new Set();
  for (const [giver, receiver] of FIXED) {
    if (!names.includes(giver) || !names.includes(receiver)) {
      fail(`Fixierte Zuordnung ${giver} -> ${receiver} nennt eine inaktive oder unbekannte Person.`);
    }
    if (giver === receiver || fixed.has(giver) || receivers.has(receiver)) {
      fail(`Fixierte Zuordnung ${giver} -> ${receiver} ist widerspruechlich oder doppelt.`);
    }
    if (forbidden.has(`${giver}\u0000${receiver}`)) {
      fail(`Fixierte Zuordnung ${giver} -> ${receiver} ist zugleich verboten.`);
    }
    fixed.set(giver, receiver);
    receivers.add(receiver);
  }
  return { names, forbidden, fixed };
}

/**
 * Shuffle an array in place with a cryptographically secure Fisher-Yates.
 * @template T
 * @param {T[]} list
 * @returns {T[]}
 */
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * Draw one Hamiltonian cycle: each person gives to the next one in a random
 * ring. A single ring rules out self-draws, mutual swaps and small loops.
 * Retries until all fixed and forbidden pairs are respected.
 * @param {string[]} names
 * @param {Set<string>} forbidden keys "giver\0receiver"
 * @param {Map<string,string>} fixed required giver -> receiver
 * @returns {Map<string,string>} giver -> receiver (kept in memory only)
 */
function drawCycle(names, forbidden, fixed) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ring = shuffle([...names]);
    const ok = ring.every((giver, i) => {
      const receiver = ring[(i + 1) % ring.length];
      return !forbidden.has(`${giver}\u0000${receiver}`) && (!fixed.has(giver) || fixed.get(giver) === receiver);
    });
    if (ok) return new Map(ring.map((giver, i) => [giver, ring[(i + 1) % ring.length]]));
  }
  fail('Keine gültige Auslosung gefunden. Sind die verbotenen Paare zu streng?');
}

/**
 * Entry point: draw, encrypt, self-check, write, print passwords.
 */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (existsSync(opts.out) && !opts.force) {
    fail(`${relative(process.cwd(), opts.out)} gibt es schon. Neu auslosen macht ALLE alten Passwörter ungültig.\n  Wenn du das willst: node tools/generate.mjs --force\n  Wenn die Passwörter schon verschickt sind: node tools/upgrade.mjs (behält Passwörter und Auslosung).`);
  }

  const { names, forbidden, fixed } = loadConfig();
  const draw = drawCycle(names, forbidden, fixed);
  const used = new Set();
  const passwords = new Map(names.map((n) => [n, makePassword(used)]));
  const adminPassword = opts.admin ? normalizePassword(opts.admin) : makeAdminPassword();
  const wishes = readWishSeed(opts.wishes);

  const data = await buildData({ names, draw, passwords, adminPassword, wishes });
  draw.clear();
  writeFileSync(opts.out, JSON.stringify(data, null, 2) + '\n', 'utf8');

  console.log(`\n  Ausgelost: ${names.length} Leute, ein einziger Kreis.`);
  console.log(`  Geschrieben: ${relative(process.cwd(), opts.out)}\n`);
  printPasswords(names, passwords, adminPassword);
}

main().catch((err) => fail(err?.message ?? String(err)));
