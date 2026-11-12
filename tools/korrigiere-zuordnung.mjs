#!/usr/bin/env node
/**
 * Korrigiert die bereits verschluesselte Wichtel-Auslosung ohne Passwortwechsel.
 *
 *   node tools/korrigiere-zuordnung.mjs passwoerter.txt
 *       Nur Simeon und Sinan aendern. Zwei getrennte Kreise entstehen.
 *
 *   node tools/korrigiere-zuordnung.mjs passwoerter.txt --keep-circle
 *       Einen einzigen Kreis behalten; dafuer werden zwei weitere
 *       Zuordnungen geaendert (insgesamt vier). Alle Passwoerter erforderlich.
 *
 *   node tools/korrigiere-zuordnung.mjs passwoerter.txt --out pruefung.json
 *       Testdatei schreiben statt die Originaldatei zu ueberschreiben.
 *
 * passwoerter.txt nutzt das Format aus generate.mjs, z. B.:
 *   Simeon -> zimtstern-kerze-47
 *   Sinan  -> marzipan-stern-83
 * Nie Passwoerter im Kommando selbst angeben.
 *
 * Im Standardmodus bleiben alle anderen Zuordnungen unveraendert.
 * Mit --keep-circle aendern sich noch zwei weitere Zuordnungen.
 * Alle Wunschlisten und Passwoerter bleiben gueltig.
 * Eine Sicherung der alten data.json wird erstellt.
 */

import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openEntry, sealEntry, normalizePassword } from '../public/js/crypto.js';
import { PARTICIPANTS, FORBIDDEN, FIXED } from './participants.config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED = new Map([['Simeon', 'Evelyn'], ['Sinan', 'Julian']]);
const REQUIRED = new Map([['Simeon', 'Julian'], ['Sinan', 'Evelyn']]);

function fail(message) {
  console.error(`\nFehler: ${message}\n`);
  process.exitCode = 1;
  throw new Error('ABBRUCH');
}

function options(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Aufruf: node tools/korrigiere-zuordnung.mjs passwoerter.txt [--keep-circle] [--data public/data.json] [--out pruefung.json]');
    process.exit(0);
  }
  const flags = new Set(['--keep-circle', '--data', '--out']);
  for (const a of argv) if (a.startsWith('--') && !flags.has(a)) fail(`Unbekannte Option: ${a}`);
  const value = (flag) => {
    const at = argv.indexOf(flag);
    if (at === -1) return null;
    const v = argv[at + 1];
    if (!v || v.startsWith('--')) fail(`${flag} benoetigt einen Wert.`);
    return v;
  };
  const data = value('--data');
  const out = value('--out');
  const excluded = new Set(['--keep-circle', '--data', '--out', data, out]);
  const files = argv.filter((a) => !excluded.has(a));
  if (files.length !== 1) fail('Bitte eine Passwortdatei angeben.');
  return {
    passwords: resolve(process.cwd(), files[0]),
    data: data ? resolve(process.cwd(), data) : join(ROOT, 'public', 'data.json'),
    out: out ? resolve(process.cwd(), out) : null,
    keepCircle: argv.includes('--keep-circle'),
  };
}

function parsePasswords(path) {
  if (!existsSync(path)) fail(`Passwortdatei nicht gefunden: ${path}`);
  const result = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(.+?)\s*(?:->|:|=)\s*(\S+)\s*$/);
    if (m) result.set(m[1].trim(), normalizePassword(m[2]));
  }
  return result;
}

function findCycles(draw) {
  const unvisited = new Set(draw.keys());
  const cycles = [];
  while (unvisited.size) {
    const first = unvisited.values().next().value;
    const cycle = [];
    let current = first;
    while (unvisited.has(current)) {
      unvisited.delete(current);
      cycle.push(current);
      current = draw.get(current);
      if (!draw.has(current)) fail(`Ungueltiges Ziel in Auslosung: ${current}`);
    }
    if (current !== first) fail('Die Auslosung enthaelt keine geschlossenen Kreise.');
    cycles.push(cycle);
  }
  return cycles;
}

function checkPermutation(draw) {
  if (new Set(draw.values()).size !== draw.size) fail('Mindestens eine Person wird doppelt beschenkt.');
  if ([...draw.values()].some((to) => !draw.has(to))) fail('Mindestens ein Empfaenger fehlt als Teilnehmer.');
  if ([...draw].some(([from, to]) => from === to)) fail('Eine Person wuerde sich selbst beschenken.');
}

function chooseExtraSwap(draw) {
  const cycles = findCycles(draw);
  if (cycles.length !== 2) fail(`Nach dem ersten Tausch wurden ${cycles.length} statt 2 Kreise gefunden.`);
  const blocked = new Set(FORBIDDEN.map(([from, to]) => `${from}\u0000${to}`));
  const fixedGivers = new Set(FIXED.map(([from]) => from));
  const giverA = cycles[0].filter((name) => !fixedGivers.has(name));
  const giverB = cycles[1].filter((name) => !fixedGivers.has(name));
  for (const a of giverA) {
    for (const b of giverB) {
      const toA = draw.get(a), toB = draw.get(b);
      if (blocked.has(`${a}\u0000${toB}`) || blocked.has(`${b}\u0000${toA}`)) continue;
      draw.set(a, toB);
      draw.set(b, toA);
      checkPermutation(draw);
      if (findCycles(draw).length === 1) return [a, b];
      draw.set(a, toA);
      draw.set(b, toB);
    }
  }
  fail('Mit nur zwei weiteren Aenderungen laesst sich unter den Sperren kein einzelner Kreis bilden.');
}

function writeSafely(path, content, isOriginal) {
  if (isOriginal) {
    let backup = `${path}.bak`;
    let i = 1;
    while (existsSync(backup)) backup = `${path}.bak-${i++}`;
    copyFileSync(path, backup);
    console.log(`Sicherung: ${relative(process.cwd(), backup)}`);
  } else if (existsSync(path)) {
    fail(`Ausgabedatei existiert bereits: ${path}`);
  }
  const tmp = `${path}.tmp-${randomBytes(6).toString('hex')}`;
  try {
    writeFileSync(tmp, content, { flag: 'wx', mode: 0o600 });
    renameSync(tmp, path);
  } catch (err) {
    fail(`Konnte die Datei nicht schreiben: ${err.message}`);
  }
}

async function main() {
  const opts = options(process.argv.slice(2));
  if (!existsSync(opts.data)) fail(`Die aktuelle Auslosung fehlt: ${opts.data}`);
  const data = JSON.parse(readFileSync(opts.data, 'utf8'));
  if (data.v !== 2 || !Array.isArray(data.people)) fail('Nur die aktuelle Auslosung (Version 2) wird unterstuetzt.');
  const byName = new Map(data.people.map((entry) => [entry.name, entry]));
  if (byName.size !== data.people.length) fail('Teilnehmende in data.json sind doppelt.');
  for (const name of REQUIRED.keys()) if (!byName.has(name)) fail(`${name} fehlt in data.json.`);
  const passwords = parsePasswords(opts.passwords);
  const needed = opts.keepCircle ? data.people.map(({ name }) => name) : [...REQUIRED.keys()];
  const missing = needed.filter((name) => !passwords.has(name));
  if (missing.length) fail(`Passwort fehlt fuer: ${missing.join(', ')}`);
  const payloads = new Map();
  for (const name of needed) {
    const payload = await openEntry(byName.get(name), passwords.get(name), data.kdf);
    if (!payload || typeof payload.to !== 'string' || typeof payload.k !== 'string' || typeof payload.own !== 'string') {
      fail(`Passwort falsch oder verschluesselter Eintrag ungueltig: ${name}`);
    }
    payloads.set(name, payload);
  }
  const already = [...REQUIRED].every(([from, to]) => payloads.get(from)?.to === to);
  if (already) {
    console.log('Beide Zuordnungen sind bereits korrekt. Die Daten wurden nicht veraendert.');
    return;
  }
  for (const [from, expected] of EXPECTED) {
    if (payloads.get(from)?.to !== expected) fail(`Abbruch: Die bisherige Zuordnung von ${from} ist anders als erwartet.`);
  }
  // Die beiden Geschenkempfaenger bleiben dieselben. Ihre individuellen
  // Schluessel werden zusammen mit dem Ziel an den anderen Geber uebergeben.
  const draw = new Map([...payloads].map(([from, payload]) => [from, payload.to]));
  const keyByReceiver = new Map([...payloads].map(([, payload]) => [payload.to, payload.k]));
  for (const [from, to] of REQUIRED) draw.set(from, to);
  const extra = [];
  if (opts.keepCircle) {
    const configNames = PARTICIPANTS.filter((p) => p.active !== false).map((p) => p.name);
    if (configNames.length !== draw.size || configNames.some((name) => !draw.has(name))) {
      fail('Die Teilnehmerliste in der Config und in data.json stimmen nicht ueberein.');
    }
    checkPermutation(new Map([...payloads].map(([from, payload]) => [from, payload.to])));
    const oldCycles = findCycles(new Map([...payloads].map(([from, payload]) => [from, payload.to])));
    if (oldCycles.length !== 1) fail('Die bisherige Auslosung war nicht ein einziger Kreis.');
    checkPermutation(draw);
    extra.push(...chooseExtraSwap(draw));
    if (findCycles(draw).length !== 1) fail('Nach Korrektur liegt kein geschlossener Wichtelkreis vor.');
    const forbidden = new Set(FORBIDDEN.map(([from, to]) => `${from}\u0000${to}`));
    for (const [from, to] of draw) if (forbidden.has(`${from}\u0000${to}`)) fail('Eine verbotene Zuordnung wuerde entstehen.');
  }
  for (const [from, to] of REQUIRED) if (draw.get(from) !== to) fail(`Fixierte Zuordnung verletzt: ${from}.`);
  const changed = [...draw].filter(([from, to]) => to !== payloads.get(from).to);
  if (changed.length !== (opts.keepCircle ? 4 : 2)) fail(`Unerwartete Anzahl geaenderter Zuordnungen: ${changed.length}`);
  const updatedPeople = [...data.people];
  for (const [from, to] of changed) {
    const current = payloads.get(from);
    const newKey = keyByReceiver.get(to);
    if (!newKey) fail(`Schluessel fuer ${to} konnte nicht ermittelt werden.`);
    const entry = await sealEntry(from, { ...current, to, k: newKey }, passwords.get(from), data.kdf);
    const verified = await openEntry(entry, passwords.get(from), data.kdf);
    if (!verified || verified.to !== to || verified.k !== newKey || verified.own !== current.own) {
      fail(`Selbsttest fehlgeschlagen: ${from}`);
    }
    updatedPeople[data.people.findIndex((item) => item.name === from)] = entry;
  }
  data.people = updatedPeople;
  data.updated = new Date().toISOString();
  const out = opts.out ?? opts.data;
  writeSafely(out, JSON.stringify(data, null, 2) + '\n', out === opts.data);
  console.log('Zuordnung erfolgreich korrigiert: Simeon -> Julian; Sinan -> Evelyn.');
  if (extra.length) console.log(`Ein Kreis erhalten. Weitere geaenderte Personen: ${extra.join(' und ')}.`);
  else console.log('Alle anderen Zuordnungen bleiben bestehen. Achtung: Der bisherige einzelne Wichtelkreis ist nun in zwei Kreise geteilt.');
  console.log('Alle Passwoerter und Wunschlisten bleiben gueltig.');
}

main().catch((err) => {
  if (err?.message === 'ABBRUCH') return;
  console.error(`Fehler: ${err?.message ?? String(err)}`);
  process.exitCode = 1;
});
