#!/usr/bin/env node
/**
 * Upgrade an old data.json (v1, without wish lists) to v2 WITHOUT changing
 * anybody's password or the draw. For when the passwords are already out.
 *
 *   node tools/upgrade.mjs passwoerter.txt
 *   node tools/upgrade.mjs passwoerter.txt --admin-password "..."
 *
 * passwoerter.txt: one line per person, exactly as the generator printed it,
 * e.g. "Irene  ->  zimtstern-kerze-47" (":" or "=" work too).
 * The pairings are only held in memory to re-encrypt; they are never shown.
 * Delete passwoerter.txt afterwards.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openEntry, normalizePassword } from '../public/js/crypto.js';
import { fail, makeAdminPassword, buildData, printPasswords, optionValue } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Parse "Name -> password" lines.
 * @param {string} text
 * @returns {Map<string,string>}
 */
function parsePasswords(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^\s:=>-][^:=>]*?)\s*(?:->|:|=)\s*(\S+)\s*$/);
    if (m) map.set(m[1].trim(), normalizePassword(m[2]));
  }
  return map;
}

/**
 * Entry point.
 */
async function main() {
  const argv = process.argv.slice(2);
  const file = argv.find((a, i) => !a.startsWith('--') && !['--admin-password', '--out', '--in'].includes(argv[i - 1]));
  if (!file) fail('Usage: node tools/upgrade.mjs passwoerter.txt [--admin-password "..."] [--out data.json]');
  const outArg = optionValue(argv, '--out');
  const inArg = optionValue(argv, '--in');
  const dataPath = inArg ? resolve(process.cwd(), inArg) : resolve(ROOT, 'public', 'data.json');
  const out = outArg ? resolve(process.cwd(), outArg) : dataPath;
  if (!existsSync(dataPath)) fail('data.json fehlt. Dann einfach neu auslosen: node tools/generate.mjs');

  const old = JSON.parse(readFileSync(dataPath, 'utf8'));
  if (old.v !== 1) fail(`public/data.json ist schon Version ${old.v}. Nichts zu tun.`);
  const passwords = parsePasswords(readFileSync(resolve(process.cwd(), file), 'utf8'));
  const names = old.people.map((p) => p.name);
  const missing = names.filter((n) => !passwords.has(n));
  if (missing.length) fail(`Es fehlen Passwörter für: ${missing.join(', ')}`);

  const draw = new Map();
  for (const entry of old.people) {
    const payload = await openEntry(entry, passwords.get(entry.name), old.kdf);
    if (!payload) fail(`Das Passwort für ${entry.name} passt nicht.`);
    draw.set(entry.name, payload.to);
  }
  const opt = optionValue(argv, '--admin-password');
  const adminPassword = opt ? normalizePassword(opt) : makeAdminPassword();
  const data = await buildData({ names, draw, passwords, adminPassword, kdf: old.kdf });
  draw.clear();
  data.created = old.created ?? data.created;
  writeFileSync(out, JSON.stringify(data, null, 2) + '\n', 'utf8');

  console.log(`\n  Umgestellt auf Version 2: ${names.length} Leute, gleiche Auslosung, gleiche Passwörter.`);
  console.log(`  Geschrieben: ${relative(process.cwd(), out)}\n`);
  printPasswords(names, passwords, adminPassword);
  console.log(`  Jetzt ${file} löschen.\n`);
}

main().catch((err) => fail(err?.message ?? String(err)));
