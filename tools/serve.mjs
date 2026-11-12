#!/usr/bin/env node
/**
 * Tiny local preview server for public/ (no dependencies).
 *   node tools/serve.mjs        -> http://localhost:8000/
 * ES modules and fetch() don't work from file://, hence this.
 *
 * Testing with another draw without touching public/data.json:
 *   WICHTEL_DATA=path/to/test.json node tools/serve.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 8000);
const DATA_OVERRIDE = process.env.WICHTEL_DATA ? resolve(process.env.WICHTEL_DATA) : null;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serve one request from public/, refusing paths that escape it.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function handle(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = DATA_OVERRIDE && path === '/data.json' ? DATA_OVERRIDE : join(ROOT, normalize(path));
  if (file !== DATA_OVERRIDE && !file.startsWith(ROOT + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
  }
}

createServer(handle).listen(PORT, () => {
  console.log(`\n  Vorschau: http://localhost:${PORT}/${DATA_OVERRIDE ? `\n  data.json kommt aus: ${DATA_OVERRIDE}` : ''}\n`);
});
