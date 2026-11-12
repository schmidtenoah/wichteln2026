/**
 * Admin page: edit everyone's wish list without a database.
 *
 * The admin password opens the vault in data.json, which holds one wish key
 * per person (not the draw). Every list is decrypted, edited here, and sealed
 * again with the same key. Saving produces a new data.json: either downloaded,
 * or committed straight to GitHub via the contents API.
 */

import { openVault, openWishes, sealWishes, normalizeWishes, bytesToBase64, base64ToBytes } from './crypto.js';
import { isValidDraw } from './data.js';
import { createWishlist } from './wishlist.js';

const GH_KEY = 'wichteln:admin:gh';
const TOKEN_KEY = 'wichteln:admin:token';

const $ = (id) => document.getElementById(id);

/** @type {{draw:any, keys:Record<string,string>, lists:Map<string, any>, dirty:Set<string>, current:string, sha:string|null, source:'github'|'site'}} */
const state = {
  draw: null,
  keys: {},
  lists: new Map(),
  dirty: new Set(),
  current: '',
  sha: null,
  source: 'site',
};

/* --------------------------------------------------------------------------
   Settings (GitHub connection)
   -------------------------------------------------------------------------- */

/**
 * Stored GitHub settings plus token.
 * @returns {{owner:string, repo:string, branch:string, path:string, token:string, remember:boolean}}
 */
function readSettings() {
  let gh = {};
  let token = '';
  let remember = false;
  try {
    gh = JSON.parse(localStorage.getItem(GH_KEY) || '{}');
    token = localStorage.getItem(TOKEN_KEY) || '';
    remember = Boolean(token);
    token ||= sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    /* storage blocked */
  }
  return { owner: gh.owner || '', repo: gh.repo || '', branch: gh.branch || 'main', path: gh.path || 'public/data.json', token, remember };
}

/**
 * Persist settings; the token goes to localStorage only when asked to.
 * @param {ReturnType<typeof readSettings>} s
 */
function writeSettings(s) {
  try {
    localStorage.setItem(GH_KEY, JSON.stringify({ owner: s.owner, repo: s.repo, branch: s.branch, path: s.path }));
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (s.token) (s.remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, s.token);
  } catch {
    /* storage blocked: settings last for this page only */
  }
}

/**
 * Whether direct publishing is set up.
 * @param {ReturnType<typeof readSettings>} s
 */
const hasGitHub = (s) => Boolean(s.owner && s.repo && s.path && s.token);

/**
 * GitHub contents API URL for the configured file.
 * @param {ReturnType<typeof readSettings>} s
 */
function contentsUrl(s) {
  const path = s.path.split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${path}`;
}

/**
 * Turn a GitHub API failure into a sentence.
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function githubError(res) {
  if (res.status === 401) return 'GitHub kennt den Token nicht (abgelaufen oder falsch kopiert).';
  if (res.status === 403) return 'Der Token darf dieses Repository nicht ändern. Er braucht „Contents: Read and write“.';
  if (res.status === 404) return 'Repository, Branch oder Pfad stimmen nicht. Schau in die Einstellungen.';
  if (res.status === 409 || res.status === 422) return 'Auf GitHub liegt inzwischen eine neuere Fassung. Lade diese Seite neu und mach die Änderung nochmal.';
  let detail = '';
  try {
    detail = (await res.json()).message || '';
  } catch {
    /* no body */
  }
  return `GitHub hat mit Fehler ${res.status} geantwortet. ${detail}`.trim();
}

/* --------------------------------------------------------------------------
   Loading and saving data.json
   -------------------------------------------------------------------------- */

/**
 * Load data.json: from GitHub when connected (always the newest),
 * otherwise from this site.
 * @returns {Promise<{draw:any, sha:string|null, source:'github'|'site'}>}
 */
async function fetchDraw() {
  const s = readSettings();
  if (hasGitHub(s)) {
    const res = await fetch(`${contentsUrl(s)}?ref=${encodeURIComponent(s.branch)}`, {
      headers: { Authorization: `Bearer ${s.token}`, Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(await githubError(res));
    const file = await res.json();
    const text = new TextDecoder().decode(base64ToBytes(file.content.replace(/\s/g, '')));
    return { draw: JSON.parse(text), sha: file.sha, source: 'github' };
  }
  const res = await fetch('data.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`data.json konnte nicht geladen werden (HTTP ${res.status}).`);
  return { draw: await res.json(), sha: null, source: 'site' };
}

/**
 * Seal the edited lists into a fresh copy of data.json.
 * @returns {Promise<string>} pretty JSON
 */
async function buildJson() {
  const next = structuredClone(state.draw);
  for (const name of state.dirty) {
    next.wishes[name] = await sealWishes(name, state.keys[name], state.lists.get(name));
  }
  next.updated = new Date().toISOString();
  return JSON.stringify(next, null, 2) + '\n';
}

/**
 * After a successful save, the new file becomes the baseline.
 * @param {string} json
 */
function commit(json) {
  state.draw = JSON.parse(json);
  state.dirty.clear();
  renderPeople();
  renderStatus();
}

/**
 * Download the new data.json.
 */
async function download() {
  try {
    const json = await buildJson();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'data.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    const changed = state.dirty.size;
    commit(json);
    renderStatus(changed ? 'Heruntergeladen. Jetzt public/data.json damit ersetzen und hochladen.' : 'Heruntergeladen.');
  } catch (err) {
    toast(`Speichern ging nicht: ${err.message}`);
  }
}

/**
 * Commit the new data.json to GitHub.
 */
async function publish() {
  const s = readSettings();
  if (!hasGitHub(s)) {
    openSettings();
    return;
  }
  const btn = $('publish');
  btn.disabled = true;
  btn.textContent = 'Veröffentliche …';
  try {
    let sha = state.sha;
    if (!sha) {
      const head = await fetch(`${contentsUrl(s)}?ref=${encodeURIComponent(s.branch)}`, {
        headers: { Authorization: `Bearer ${s.token}`, Accept: 'application/vnd.github+json' },
        cache: 'no-store',
      });
      if (head.ok) sha = (await head.json()).sha;
      else if (head.status !== 404) throw new Error(await githubError(head));
    }
    const json = await buildJson();
    const names = [...state.dirty];
    const res = await fetch(contentsUrl(s), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${s.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: names.length ? `Wunschlisten aktualisiert: ${names.join(', ')}` : 'Wunschlisten aktualisiert',
        content: bytesToBase64(new TextEncoder().encode(json)),
        branch: s.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!res.ok) throw new Error(await githubError(res));
    state.sha = (await res.json()).content?.sha ?? null;
    state.source = 'github';
    commit(json);
    renderStatus('Veröffentlicht. In etwa einer Minute ist die Seite aktuell.');
  } catch (err) {
    toast(err.message);
    renderStatus();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Veröffentlichen';
  }
}

/* --------------------------------------------------------------------------
   Parsing helpers
   -------------------------------------------------------------------------- */

/**
 * "24,90" / "24.90 €" / "" -> number or null.
 * @param {string} text
 * @returns {number|null}
 */
function parsePrice(text) {
  const cleaned = String(text).replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Turn one line of a WhatsApp message into a wish.
 * @param {string} line
 * @returns {{title:string, price:number|null, link:string, note:string}|null}
 */
export function parseLine(line) {
  let s = line.replace(/^\s*(?:[-–•*·>]|\d+[.)])\s*/, '').trim();
  if (!s) return null;
  let link = '';
  s = s.replace(/https?:\/\/\S+/i, (m) => {
    link = m.replace(/[),.;!]+$/, '');
    return ' ';
  });
  let price = null;
  s = s.replace(/(?:ca\.?|circa|etwa|~|für|um die)?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|euro|eur)(?=[\s,.;)!]|$)|€\s*(\d{1,4}(?:[.,]\d{1,2})?)/i, (m, a, b) => {
    price = parsePrice(a ?? b);
    return ' ';
  });
  s = s.replace(/\(\s*\)/g, ' ').replace(/\s{2,}/g, ' ').trim();
  let note = '';
  const paren = s.match(/\(([^)]+)\)\s*[,;:–-]?\s*$/);
  if (paren) {
    note = paren[1].trim();
    s = s.slice(0, paren.index).trim();
  }
  s = s.replace(/[\s,;:–-]+$/, '').trim();
  if (!s && link) {
    try {
      s = new URL(link).hostname.replace(/^www\./, '');
    } catch {
      s = 'Link';
    }
  }
  return s ? { title: s.slice(0, 160), price, link, note } : null;
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */

/**
 * Status line in the top bar.
 * @param {string} [message] one-off message to show instead
 */
function renderStatus(message) {
  const status = $('status');
  const n = state.dirty.size;
  status.dataset.state = n ? 'dirty' : 'clean';
  status.textContent = message ?? (n ? `${n === 1 ? 'Eine Liste' : `${n} Listen`} geändert, noch nicht gespeichert` : 'Alles gespeichert');
  const s = readSettings();
  $('publish').hidden = !hasGitHub(s);
  $('download').classList.toggle('btn--primary', !hasGitHub(s));
  $('download').classList.toggle('btn--quiet', hasGitHub(s));
}

/** Names on the left with counts. */
function renderPeople() {
  const ul = $('people');
  ul.replaceChildren(
    ...[...state.lists.keys()].map((name) => {
      const list = state.lists.get(name);
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'person';
      btn.setAttribute('aria-current', name === state.current ? 'true' : 'false');
      const count = list.items.length;
      btn.innerHTML = '<span class="person__name"></span><span class="person__count"></span>';
      btn.querySelector('.person__name').textContent = name;
      btn.querySelector('.person__count').textContent = count ? `${count} ${count === 1 ? 'Wunsch' : 'Wünsche'}` : 'noch leer';
      btn.classList.toggle('is-empty', !count && !list.note);
      btn.classList.toggle('is-dirty', state.dirty.has(name));
      btn.addEventListener('click', () => select(name));
      li.append(btn);
      return li;
    })
  );
}

/** Count for the current person, and the preview. */
function renderSum() {
  const list = state.lists.get(state.current);
  const n = list.items.length;
  $('items-sum').textContent = n ? `${n} ${n === 1 ? 'Wunsch' : 'Wünsche'}` : '';
  $('items-empty').hidden = n > 0;
  schedulePreview();
}

let previewTimer = 0;
/** The wish list exactly as the giver will see it (a moment after typing stops). */
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 160);
}
function renderPreview() {
  const list = state.lists.get(state.current);
  if (!list) return;
  const { el } = createWishlist({ receiver: state.current, giver: '', list: { note: list.note, items: list.items.filter((i) => i.title || i.image || i.link) } });
  $('preview').replaceChildren(el);
}

/**
 * Mark the current person as changed.
 */
function touch() {
  const list = state.lists.get(state.current);
  list.updated = new Date().toISOString();
  state.dirty.add(state.current);
  renderStatus();
  schedulePreview();
  const btn = [...$('people').querySelectorAll('.person')].find((b) => b.querySelector('.person__name').textContent === state.current);
  if (btn) {
    btn.classList.add('is-dirty');
    const count = list.items.length;
    btn.querySelector('.person__count').textContent = count ? `${count} ${count === 1 ? 'Wunsch' : 'Wünsche'}` : 'noch leer';
    btn.classList.toggle('is-empty', !count && !list.note);
  }
}

/**
 * Shrink an image to a small wish-list picture (max 560 px, WebP or JPEG),
 * so it can travel inside the encrypted wish list.
 * @param {Blob} file
 * @returns {Promise<string>} data URL
 */
async function compressImage(file) {
  const bmp = await trimmed(await createImageBitmap(file));
  let max = 560;
  let quality = 0.76;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * r);
    c.height = Math.round(bmp.height * r);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    let url = c.toDataURL('image/webp', quality);
    if (!url.startsWith('data:image/webp')) {
      // Safari can't encode WebP: flatten onto white and use JPEG.
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      url = c.toDataURL('image/jpeg', quality);
    }
    if (url.length <= 180000) return url;
    max = Math.round(max * 0.8);
    quality -= 0.08;
  }
  throw new Error('Das Bild ist zu groß.');
}

/**
 * Cut away empty borders (transparent or plain white), so every picture fills
 * its place on the wish list the same way. Keeps a small margin.
 * @param {ImageBitmap} bmp
 * @returns {Promise<ImageBitmap>}
 */
async function trimmed(bmp) {
  const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const empty = (i) => d[i + 3] < 18 || (d[i] > 244 && d[i + 1] > 244 && d[i + 2] > 244);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (empty((y * w + x) * 4)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0 || (x1 - x0 > w * 0.96 && y1 - y0 > h * 0.96)) return bmp;
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  const sx = Math.max(0, (x0 - pad) / k);
  const sy = Math.max(0, (y0 - pad) / k);
  const sw = Math.min(bmp.width - sx, (x1 - x0 + 1 + pad * 2) / k);
  const sh = Math.min(bmp.height - sy, (y1 - y0 + 1 + pad * 2) / k);
  return createImageBitmap(bmp, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh));
}

/**
 * Image picker for one wish: file, drag and drop, or paste.
 * @param {HTMLLIElement} li
 * @param {{image?:string}} item
 */
function bindImage(li, item) {
  const zone = li.querySelector('[data-drop]');
  const thumb = li.querySelector('.item__thumb');
  const placeholder = li.querySelector('.item__placeholder');
  const input = li.querySelector('[data-image-input]');
  const removeBtn = li.querySelector('[data-act="image-remove"]');
  const paint = () => {
    thumb.hidden = !item.image;
    placeholder.hidden = Boolean(item.image);
    removeBtn.hidden = !item.image;
    if (item.image) thumb.src = item.image;
    else thumb.removeAttribute('src');
  };
  const take = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    zone.classList.add('is-busy');
    try {
      item.image = await compressImage(file);
      paint();
      touch();
    } catch (err) {
      toast(err.message || 'Dieses Bild ließ sich nicht lesen.');
    } finally {
      zone.classList.remove('is-busy');
    }
  };
  input.addEventListener('change', () => {
    take(input.files?.[0]);
    input.value = '';
  });
  removeBtn.addEventListener('click', () => {
    item.image = '';
    paint();
    touch();
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-over');
    take(e.dataTransfer?.files?.[0]);
  });
  li.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile();
    if (file) {
      e.preventDefault();
      take(file);
    }
  });
  paint();
}

/** Build the item rows for the current person. */
function renderItems() {
  const list = state.lists.get(state.current);
  const tpl = $('item-template');
  const ol = $('items');
  ol.replaceChildren(
    ...list.items.map((item, index) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.querySelectorAll('[data-field]').forEach((input) => {
        const key = input.dataset.field;
        input.value = item[key] ?? '';
        input.addEventListener('input', () => {
          item[key] = input.value;
          li.classList.toggle('is-invalid', key === 'link' && input.value && !/^https?:\/\//i.test(input.value));
          touch();
          renderSum();
        });
        if (key === 'link')
          input.addEventListener('blur', () => {
            const v = input.value.trim();
            if (v && !/^https?:\/\//i.test(v) && /\.[a-z]{2,}/i.test(v)) {
              input.value = `https://${v}`;
              item.link = input.value;
              li.classList.remove('is-invalid');
              touch();
            }
            if (item.link && !item.title) {
              item.title = titleFromLink(item.link);
              li.querySelector('[data-field="title"]').value = item.title;
              touch();
            }
          });
      });
      bindImage(li, item);
      li.querySelector('[data-act="up"]').disabled = index === 0;
      li.querySelector('[data-act="down"]').disabled = index === list.items.length - 1;
      li.querySelector('[data-act="up"]').addEventListener('click', () => move(index, -1));
      li.querySelector('[data-act="down"]').addEventListener('click', () => move(index, 1));
      li.querySelector('[data-act="remove"]').addEventListener('click', () => remove(index));
      return li;
    })
  );
  renderSum();
}

/**
 * Show one person in the editor.
 * @param {string} name
 */
function select(name) {
  state.current = name;
  const list = state.lists.get(name);
  $('editor-name').textContent = name;
  const updated = list.updated ? new Date(list.updated).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  $('editor-meta').textContent = updated ? `Zuletzt geändert: ${updated}` : list.items.length || list.note ? '' : 'Noch nichts eingetragen';
  $('note').value = list.note;
  $('paste-text').value = '';
  renderItems();
  $('people').querySelectorAll('.person').forEach((b) => b.setAttribute('aria-current', b.querySelector('.person__name').textContent === name ? 'true' : 'false'));
}

/**
 * Reorder a wish.
 * @param {number} index
 * @param {number} dir -1 up, 1 down
 */
function move(index, dir) {
  const items = state.lists.get(state.current).items;
  const to = index + dir;
  if (to < 0 || to >= items.length) return;
  [items[index], items[to]] = [items[to], items[index]];
  touch();
  renderItems();
  $('items').children[to]?.querySelector(`[data-act="${dir < 0 ? 'up' : 'down'}"]`)?.focus();
}

/**
 * Delete a wish, with undo.
 * @param {number} index
 */
function remove(index) {
  const name = state.current;
  const items = state.lists.get(name).items;
  const [gone] = items.splice(index, 1);
  touch();
  renderItems();
  toast(`„${gone.title || 'Wunsch'}“ gelöscht.`, 'Rückgängig', () => {
    state.lists.get(name).items.splice(index, 0, gone);
    if (state.current === name) renderItems();
    schedulePreview();
    touch();
  });
}

/** Add an empty wish and focus it. */
function addItem() {
  const items = state.lists.get(state.current).items;
  items.push({ title: '', price: null, link: '', note: '' });
  touch();
  renderItems();
  $('items').lastElementChild?.querySelector('[data-field="title"]')?.focus();
}

/**
 * A readable name from a shop link: the last part of the path, without ids.
 * @param {string} url
 */
export function titleFromLink(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').map((p) => decodeURIComponent(p)).filter(Boolean);
    const slug = parts.reverse().find((p) => /[a-zäöüß]{3,}/i.test(p.replace(/\.[a-z]+$/i, '')) && !/^(p|dp|product|produkt|artikel|item|products)$/i.test(p)) ?? '';
    const words = slug
      .replace(/\.[a-z]{2,5}$/i, '')
      .split(/[-_+]+/)
      .filter((w) => w && !/^\d{5,}$/.test(w) && !/^[a-f0-9]{8,}$/i.test(w) && !/^[A-Z0-9]{10}$/.test(w));
    const text = words.join(' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Something was pasted or dropped into the quick field.
 * @param {{file?:File|null, text?:string}} what
 */
async function quickAdd({ file, text }) {
  const items = state.lists.get(state.current).items;
  const last = items[items.length - 1];
  if (file) {
    let image;
    try {
      image = await compressImage(file);
    } catch (err) {
      toast(err.message || 'Dieses Bild ließ sich nicht lesen.');
      return;
    }
    // A link came first: the picture belongs to it.
    if (last && last.link && !last.image) last.image = image;
    else items.push({ title: '', price: null, link: '', note: '', image });
  } else if (text) {
    const url = (text.match(/https?:\/\/\S+/i) ?? [])[0]?.replace(/[),.;!]+$/, '');
    if (url) {
      if (last && last.image && !last.link) {
        last.link = url;
        if (!last.title) last.title = titleFromLink(url);
      } else items.push({ title: titleFromLink(url), price: null, link: url, note: '', image: '' });
    } else {
      const parsed = text.split(/\r?\n/).map(parseLine).filter(Boolean);
      if (!parsed.length) return;
      items.push(...parsed);
    }
  } else return;
  touch();
  renderItems();
  const rows = $('items').children;
  const row = rows[rows.length - 1];
  row?.classList.add('is-new');
  row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Paste and drop on the quick field. */
function bindQuick() {
  const zone = $('quick');
  zone.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!file && !text) return;
    e.preventDefault();
    quickAdd({ file, text });
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-over');
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
    quickAdd({ file, text: file ? '' : e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '' });
  });
  zone.addEventListener('click', () => zone.focus());
}

let toastTimer = 0;
/**
 * Small message at the bottom, optionally with one action.
 * @param {string} text
 * @param {string} [actionLabel]
 * @param {()=>void} [action]
 */
function toast(text, actionLabel, action) {
  const box = $('toast');
  const btn = $('toast-action');
  $('toast-text').textContent = text;
  btn.hidden = !actionLabel;
  btn.textContent = actionLabel ?? '';
  btn.onclick = () => {
    action?.();
    box.hidden = true;
  };
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.hidden = true), actionLabel ? 7000 : 5000);
}

/* --------------------------------------------------------------------------
   Settings dialog, backup
   -------------------------------------------------------------------------- */

/** Open the settings dialog filled with the stored values. */
function openSettings() {
  const s = readSettings();
  $('gh-owner').value = s.owner;
  $('gh-repo').value = s.repo;
  $('gh-branch').value = s.branch;
  $('gh-path').value = s.path;
  $('gh-token').value = s.token;
  $('gh-remember').checked = s.remember;
  $('settings').showModal();
}

/** Store whatever is in the dialog. */
function saveSettings() {
  writeSettings({
    owner: $('gh-owner').value.trim(),
    repo: $('gh-repo').value.trim(),
    branch: $('gh-branch').value.trim() || 'main',
    path: $('gh-path').value.trim().replace(/^\/+/, '') || 'public/data.json',
    token: $('gh-token').value.trim(),
    remember: $('gh-remember').checked,
  });
  state.sha = null;
  renderStatus();
}

/** Plaintext backup of all wish lists (no draw inside). */
function exportBackup() {
  const people = Object.fromEntries([...state.lists].map(([name, list]) => [name, normalizeWishes(list)]));
  const json = JSON.stringify({ kind: 'wichteln-wunschlisten', exported: new Date().toISOString(), people }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'wunschlisten-sicherung.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Read a backup back in (only names that exist in this draw).
 * @param {File} file
 */
async function importBackup(file) {
  try {
    const raw = JSON.parse(await file.text());
    const people = raw.people ?? raw;
    let count = 0;
    for (const [name, list] of Object.entries(people)) {
      if (!state.lists.has(name)) continue;
      state.lists.set(name, normalizeWishes({ ...list, updated: new Date().toISOString() }));
      state.dirty.add(name);
      count++;
    }
    renderPeople();
    select(state.current);
    renderStatus();
    toast(count ? `${count} Listen aus der Sicherung übernommen. Noch speichern!` : 'In der Sicherung stand niemand aus dieser Runde.');
  } catch {
    toast('Diese Datei ist keine Wunschlisten-Sicherung.');
  }
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

/**
 * Unlock with the admin password.
 * @param {SubmitEvent} e
 */
async function onLogin(e) {
  e.preventDefault();
  const pw = $('gate-password').value;
  const error = $('gate-error');
  const submit = $('gate-submit');
  if (!pw.trim()) {
    error.textContent = 'Da fehlt noch das Passwort.';
    return;
  }
  error.textContent = '';
  submit.disabled = true;
  submit.textContent = 'Öffne …';
  try {
    const { draw, sha, source } = await fetchDraw();
    if (!isValidDraw(draw)) throw new Error('data.json hat ein unerwartetes Format.');
    if (draw.v < 2 || !draw.admin) throw new Error('Diese data.json hat noch keine Wunschlisten. Erst „node tools/upgrade.mjs“ ausführen (siehe README).');
    const vault = await openVault(draw.admin, pw, draw.kdf);
    if (!vault) throw new Error('Das Admin-Passwort passt nicht.');
    state.draw = draw;
    state.sha = sha;
    state.source = source;
    state.keys = vault.keys;
    for (const person of draw.people) {
      const list = await openWishes(person.name, vault.keys[person.name], draw.wishes[person.name]);
      state.lists.set(person.name, list ?? { note: '', items: [], updated: null });
    }
    $('gate').hidden = true;
    $('app').hidden = false;
    renderPeople();
    select(draw.people[0].name);
    renderStatus(source === 'github' ? 'Direkt von GitHub geladen' : undefined);
  } catch (err) {
    error.textContent = err.message;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Öffnen';
  }
}

/** Only ever shown as the page itself, never framed into another site. */
function refuseFraming() {
  if (window.top === window.self) return false;
  document.documentElement.hidden = true;
  try {
    window.top.location.replace(window.location.href);
  } catch {
    /* the other site blocks it: the page simply stays empty there */
  }
  return true;
}

/** Entry point. */
function main() {
  if (refuseFraming()) return;
  const s = readSettings();
  $('gate-source').textContent = hasGitHub(s) ? `Lädt direkt aus GitHub: ${s.owner}/${s.repo}` : '';
  $('gate-form').addEventListener('submit', onLogin);
  $('note').addEventListener('input', () => {
    state.lists.get(state.current).note = $('note').value;
    touch();
    schedulePreview();
  });
  $('add-item').addEventListener('click', addItem);
  bindQuick();
  $('paste-apply').addEventListener('click', () => {
    const parsed = $('paste-text').value.split(/\r?\n/).map(parseLine).filter(Boolean);
    if (!parsed.length) {
      toast('Keine Wünsche erkannt. Eine Zeile pro Wunsch.');
      return;
    }
    state.lists.get(state.current).items.push(...parsed);
    $('paste-text').value = '';
    $('paste').open = false;
    touch();
    renderItems();
    toast(`${parsed.length === 1 ? 'Ein Wunsch' : `${parsed.length} Wünsche`} übernommen. Kurz drüberschauen, dann speichern.`);
  });
  $('download').addEventListener('click', download);
  $('publish').addEventListener('click', publish);
  $('open-settings').addEventListener('click', openSettings);
  $('settings').addEventListener('close', saveSettings);
  $('backup-export').addEventListener('click', exportBackup);
  $('backup-import').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importBackup(file);
    e.target.value = '';
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !$('app').hidden) {
      e.preventDefault();
      if (hasGitHub(readSettings())) publish();
      else download();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty.size) e.preventDefault();
  });
}

main();
