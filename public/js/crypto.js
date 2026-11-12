/**
 * Wichteln crypto. Shared verbatim by the browser, the admin page and the
 * tools in tools/, so encryption and decryption can never drift apart.
 *
 * data.json (v2) holds three kinds of sealed blocks:
 *
 * 1. people[]  one per giver, PBKDF2(password) -> AES-256-GCM.
 *              Payload: { to, k, own }
 *                to   the person they give to
 *                k    the key for that person's wish list
 *                own  the key for their own wish list (to check it)
 * 2. wishes{}  one per person, AES-256-GCM with that person's random wish key.
 *              Only their Wichtel (and they themselves) hold the key.
 * 3. admin     PBKDF2(admin password) -> AES-256-GCM.
 *              Payload: { keys: { name: wishKey } }. Lets the organiser edit
 *              every wish list without ever learning who drew whom.
 *
 * Each block is bound to its owner via additional authenticated data, and
 * plaintexts are padded so ciphertext sizes leak as little as possible.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Fixed plaintext length of a giver entry (v2). v1 entries were 96 bytes. */
const ENTRY_LENGTH = 256;
/** Wish lists are padded up to a multiple of this many bytes. */
const WISH_BLOCK = 512;

/** Default key-derivation parameters written into data.json. */
export const KDF_DEFAULTS = Object.freeze({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000 });

/**
 * Normalise a typed password: trim, lowercase, and treat spaces,
 * underscores or long dashes as the hyphen the generator uses.
 * @param {string} input raw text from the input field
 * @returns {string}
 */
export function normalizePassword(input) {
  return String(input)
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_‒-―]+/g, '-');
}

/**
 * Encode bytes as base64.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Decode base64 into bytes.
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Random bytes.
 * @param {number} n
 * @returns {Uint8Array}
 */
function random(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/**
 * A fresh random 256-bit wish key, base64.
 * @returns {string}
 */
export function newWishKey() {
  return bytesToBase64(random(32));
}

/**
 * Derive an AES-256-GCM key from a password with PBKDF2-SHA256.
 * @param {string} password already normalised password
 * @param {Uint8Array} salt per-block random salt
 * @param {number} iterations PBKDF2 iteration count
 * @param {KeyUsage[]} usages
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(password, salt, iterations, usages) {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

/**
 * Import a raw base64 wish key.
 * @param {string} b64
 * @param {KeyUsage[]} usages
 * @returns {Promise<CryptoKey>}
 */
function importWishKey(b64, usages) {
  return globalThis.crypto.subtle.importKey('raw', base64ToBytes(b64), 'AES-GCM', false, usages);
}

/**
 * JSON-encode and pad with spaces (JSON ignores trailing whitespace).
 * @param {object} value
 * @param {number} length exact length, or block size when roundUp is true
 * @param {boolean} [roundUp]
 * @returns {Uint8Array}
 */
function pad(value, length, roundUp = false) {
  const bytes = encoder.encode(JSON.stringify(value));
  const size = roundUp ? Math.max(length, Math.ceil(bytes.length / length) * length) : length;
  if (bytes.length > size) throw new Error('Inhalt ist zu lang für das Padding.');
  const out = new Uint8Array(size).fill(0x20);
  out.set(bytes);
  return out;
}

/**
 * AES-GCM encrypt.
 * @param {CryptoKey} key
 * @param {Uint8Array} plain
 * @param {string} aad
 * @returns {Promise<{iv:string, data:string}>}
 */
async function seal(key, plain, aad) {
  const iv = random(12);
  const cipher = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key, plain);
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
}

/**
 * AES-GCM decrypt and parse JSON; null on any failure (wrong key, tampering).
 * @param {CryptoKey} key
 * @param {{iv:string, data:string}} block
 * @param {string} aad
 * @returns {Promise<object|null>}
 */
async function unseal(key, block, aad) {
  try {
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(block.iv), additionalData: encoder.encode(aad) },
      key,
      base64ToBytes(block.data)
    );
    return JSON.parse(decoder.decode(plain));
  } catch {
    return null;
  }
}

/** AAD for a giver entry (unchanged since v1, so upgraded files stay compatible). */
const entryAad = (giver) => `wichteln:v1:${giver}`;
/** AAD for a wish list. */
const wishAad = (name) => `wichteln:v2:wishes:${name}`;
/** AAD for the organiser vault. */
const ADMIN_AAD = 'wichteln:v2:admin';

/**
 * Encrypt one giver's result.
 * @param {string} giver person who will unlock this entry
 * @param {{to:string, k?:string, own?:string}} payload
 * @param {string} password the giver's password (normalised inside)
 * @param {{iterations:number}} kdf
 * @returns {Promise<{name:string,salt:string,iv:string,data:string}>}
 */
export async function sealEntry(giver, payload, password, kdf = KDF_DEFAULTS) {
  const salt = random(16);
  const key = await deriveKey(normalizePassword(password), salt, kdf.iterations, ['encrypt']);
  const block = await seal(key, pad(payload, ENTRY_LENGTH), entryAad(giver));
  return { name: giver, salt: bytesToBase64(salt), ...block };
}

/**
 * Try to decrypt one giver entry. A wrong password fails the GCM tag check.
 * Works for v1 entries ({to}) and v2 entries ({to, k, own}).
 * @param {{name:string,salt:string,iv:string,data:string}} entry
 * @param {string} password raw or normalised password
 * @param {{iterations:number}} kdf
 * @returns {Promise<{to:string, k?:string, own?:string}|null>}
 */
export async function openEntry(entry, password, kdf = KDF_DEFAULTS) {
  try {
    const key = await deriveKey(normalizePassword(password), base64ToBytes(entry.salt), kdf.iterations, ['decrypt']);
    const parsed = await unseal(key, entry, entryAad(entry.name));
    return parsed && typeof parsed.to === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Clean up a wish list into the one shape the site understands.
 * @param {any} raw
 * @returns {{note:string, items:{title:string, price:number|null, link:string, note:string, image:string}[], updated:string|null}}
 */
export function normalizeWishes(raw) {
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return {
    note: str(raw?.note, 600),
    items: items
      .map((it) => {
        const raw = it?.price;
        const price = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
        const link = str(it?.link, 600);
        const image = typeof it?.image === 'string' && it.image.length <= 200000 && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(it.image) ? it.image : '';
        return {
          title: str(it?.title, 160),
          price: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null,
          link: /^https?:\/\//i.test(link) ? link : '',
          note: str(it?.note, 300),
          image,
        };
      })
      .filter((it) => it.title || it.image || it.link)
      .slice(0, 40),
    updated: typeof raw?.updated === 'string' ? raw.updated : null,
  };
}

/**
 * Encrypt one person's wish list with their wish key.
 * @param {string} name whose list it is
 * @param {string} keyB64 their wish key
 * @param {object} wishes
 * @returns {Promise<{iv:string, data:string}>}
 */
export async function sealWishes(name, keyB64, wishes) {
  const key = await importWishKey(keyB64, ['encrypt']);
  return seal(key, pad(normalizeWishes(wishes), WISH_BLOCK, true), wishAad(name));
}

/**
 * Decrypt one person's wish list.
 * @param {string} name
 * @param {string} keyB64
 * @param {{iv:string, data:string}} block
 * @returns {Promise<ReturnType<typeof normalizeWishes>|null>}
 */
export async function openWishes(name, keyB64, block) {
  if (!keyB64 || !block) return null;
  try {
    const key = await importWishKey(keyB64, ['decrypt']);
    const parsed = await unseal(key, block, wishAad(name));
    return parsed ? normalizeWishes(parsed) : null;
  } catch {
    return null;
  }
}

/**
 * Encrypt the organiser vault.
 * @param {string} password admin password
 * @param {{keys:Record<string,string>}} vault
 * @param {{iterations:number}} kdf
 * @returns {Promise<{salt:string, iv:string, data:string}>}
 */
export async function sealVault(password, vault, kdf = KDF_DEFAULTS) {
  const salt = random(16);
  const key = await deriveKey(normalizePassword(password), salt, kdf.iterations, ['encrypt']);
  const block = await seal(key, pad(vault, WISH_BLOCK, true), ADMIN_AAD);
  return { salt: bytesToBase64(salt), ...block };
}

/**
 * Decrypt the organiser vault.
 * @param {{salt:string, iv:string, data:string}} block
 * @param {string} password
 * @param {{iterations:number}} kdf
 * @returns {Promise<{keys:Record<string,string>}|null>}
 */
export async function openVault(block, password, kdf = KDF_DEFAULTS) {
  if (!block) return null;
  try {
    const key = await deriveKey(normalizePassword(password), base64ToBytes(block.salt), kdf.iterations, ['decrypt']);
    const parsed = await unseal(key, block, ADMIN_AAD);
    return parsed && parsed.keys && typeof parsed.keys === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
