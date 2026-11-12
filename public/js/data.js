/**
 * Loading the encrypted draw (data.json) written by tools/generate.mjs
 * and updated by the admin page.
 */

const NUMBER_WORDS = ['null', 'eine', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig'];

/**
 * Check the shape of a parsed data.json (v1 or v2).
 * @param {any} data
 * @returns {boolean}
 */
export function isValidDraw(data) {
  return Boolean(
    data && (data.v === 1 || data.v === 2) && Array.isArray(data.people) && data.people.length >= 3 &&
    Number.isInteger(data.kdf?.iterations) &&
    data.people.every((p) => p && typeof p.name === 'string' && p.salt && p.iv && p.data) &&
    (data.v === 1 || (data.wishes && typeof data.wishes === 'object'))
  );
}

/**
 * Fetch and sanity-check data.json (relative, so it works under /repo-name/).
 * @returns {Promise<{v:number, kdf:{iterations:number}, people:{name:string,salt:string,iv:string,data:string}[], wishes?:Record<string,{iv:string,data:string}>, admin?:object}>}
 */
export async function loadDraw() {
  const res = await fetch('data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`data.json: HTTP ${res.status}`);
  const data = await res.json();
  if (!isValidDraw(data)) throw new Error('data.json hat ein unerwartetes Format.');
  return data;
}

/**
 * German number word for a head count, capitalised for the start of a sentence.
 * @param {number} n
 * @returns {string} e.g. "Zehn"
 */
export function countWord(n) {
  const word = NUMBER_WORDS[n] ?? String(n);
  return word.charAt(0).toUpperCase() + word.slice(1);
}
