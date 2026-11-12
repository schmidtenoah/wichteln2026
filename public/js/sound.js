/**
 * Sound: background music plus short effects, from files in public/audio/.
 * Missing files are simply skipped, so the site works before they exist.
 *
 * Rules that keep it from turning into mush:
 * - every effect has at most one voice: playing it again restarts it softly;
 * - an effect cannot retrigger within its cooldown;
 * - at most three effects at once; a new one pushes out the quietest-priority one;
 * - big moments duck the music, which comes back by itself;
 * - the music never runs twice, fades in and out, and pauses with the tab.
 */

const STORAGE_KEY = 'wichteln:sound';
const BASE = new URL('../audio/', import.meta.url).href;

/**
 * Effect catalogue: file, volume, cooldown (ms), priority (higher wins), duck (music level while playing, 1 = none).
 * Keep in sync with README "Ton".
 */
const EFFECTS = {
  tippen: { file: 'tippen.mp3', gain: 0.6, cooldown: 120, priority: 1, duck: 1 },
  anhaenger: { file: 'anhaenger.mp3', gain: 0.7, cooldown: 400, priority: 2, duck: 1 },
  stift: { file: 'stift.mp3', gain: 0.8, cooldown: 800, priority: 3, duck: 0.6 },
  falsch: { file: 'falsch.mp3', gain: 0.6, cooldown: 500, priority: 2, duck: 1 },
  landung: { file: 'landung.mp3', gain: 0.75, cooldown: 150, priority: 2, duck: 1 },
  schleife: { file: 'schleife.mp3', gain: 0.7, cooldown: 600, priority: 3, duck: 0.7 },
  deckel: { file: 'deckel.mp3', gain: 0.85, cooldown: 600, priority: 4, duck: 0.45 },
  glanz: { file: 'glanz.mp3', gain: 0.7, cooldown: 1500, priority: 4, duck: 0.45 },
  blaettern: { file: 'blaettern.mp3', gain: 0.7, cooldown: 300, priority: 3, duck: 0.7 },
  zuklappen: { file: 'zuklappen.mp3', gain: 0.65, cooldown: 300, priority: 3, duck: 1 },
};
const MUSIC = { file: 'musik.mp3', gain: 0.32 };
const MAX_VOICES = 3;

let enabled = true;
let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let musicSource = null;
let wantMusic = false;
let duckTimer = 0;
const buffers = new Map();
const loading = new Map();
const voices = new Map(); // id -> {src, gain, priority, started}
const lastPlayed = new Map();
const listeners = new Set();

/**
 * Read the stored preference, falling back to the site default.
 * @param {boolean} fallback
 */
export function initSound(fallback) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    enabled = stored === null ? fallback : stored === 'on';
  } catch {
    enabled = fallback;
  }
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (enabled) ctx.resume();
  });
}

/** @returns {boolean} */
export function isSoundOn() {
  return enabled;
}

/**
 * Switch sound on or off and tell every toggle.
 * @param {boolean} on
 */
export function setSound(on) {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode */
  }
  if (on) {
    unlockAudio();
    if (wantMusic) startMusic();
  } else if (ctx) {
    fade(musicBus.gain, 0, 0.4);
    setTimeout(() => !enabled && ctx?.suspend(), 450);
  }
  listeners.forEach((fn) => fn(on));
}

/** @param {(on:boolean)=>void} fn */
export function onSoundChange(fn) {
  listeners.add(fn);
}

/**
 * Smooth gain change.
 * @param {AudioParam} param
 * @param {number} value
 * @param {number} seconds
 */
function fade(param, value, seconds) {
  const t = ctx.currentTime;
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(value, t + seconds);
}

/**
 * Fetch and decode one file once; resolves to null if it's missing.
 * @param {string} file
 * @returns {Promise<AudioBuffer|null>}
 */
function load(file) {
  if (buffers.has(file)) return Promise.resolve(buffers.get(file));
  if (!loading.has(file)) {
    loading.set(
      file,
      fetch(BASE + file)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((data) => (data ? ctx.decodeAudioData(data) : null))
        .catch(() => null)
        .then((buf) => {
          buffers.set(file, buf);
          return buf;
        })
    );
  }
  return loading.get(file);
}

/**
 * Create or resume the audio context. Must run inside a user gesture on iOS.
 */
export function unlockAudio() {
  if (!enabled) return;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      // Warm the cache in the background; first sounds may simply be skipped.
      [MUSIC.file, ...Object.values(EFFECTS).map((e) => e.file)].forEach(load);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

/**
 * Start the looping background music (once).
 */
export async function startMusic() {
  wantMusic = true;
  if (!enabled || !ctx) return;
  if (musicSource) {
    fade(musicBus.gain, MUSIC.gain, 1.2);
    return;
  }
  const buf = await load(MUSIC.file);
  if (!buf || musicSource || !enabled) return;
  musicSource = ctx.createBufferSource();
  musicSource.buffer = buf;
  musicSource.loop = true;
  musicSource.connect(musicBus);
  musicSource.start();
  fade(musicBus.gain, MUSIC.gain, 2.5);
}

/**
 * Lower the music for a moment, then bring it back.
 * @param {number} level 0..1 of the normal music volume
 * @param {number} seconds how long to stay down
 */
function duck(level, seconds) {
  if (!musicSource || level >= 1) return;
  fade(musicBus.gain, MUSIC.gain * level, 0.15);
  clearTimeout(duckTimer);
  duckTimer = setTimeout(() => enabled && fade(musicBus.gain, MUSIC.gain, 1.2), seconds * 1000);
}

/**
 * Stop one voice with a tiny fade so it never clicks.
 * @param {string} id
 */
function stopVoice(id) {
  const v = voices.get(id);
  if (!v) return;
  voices.delete(id);
  try {
    fade(v.gain.gain, 0, 0.04);
    v.src.stop(ctx.currentTime + 0.05);
  } catch {
    /* already stopped */
  }
}

/**
 * Play one effect by name (see EFFECTS).
 * @param {keyof typeof EFFECTS} id
 */
export async function play(id) {
  const fx = EFFECTS[id];
  if (!fx || !enabled || !ctx) return;
  const now = performance.now();
  if (now - (lastPlayed.get(id) ?? -1e9) < fx.cooldown) return;
  lastPlayed.set(id, now);
  const buf = await load(fx.file);
  if (!buf || !enabled) return;

  stopVoice(id);
  if (voices.size >= MAX_VOICES) {
    const weakest = [...voices.entries()].sort((a, b) => a[1].priority - b[1].priority || a[1].started - b[1].started)[0];
    if (weakest && weakest[1].priority <= fx.priority) stopVoice(weakest[0]);
    else return;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = fx.gain;
  src.connect(gain).connect(sfxBus);
  src.start();
  const voice = { src, gain, priority: fx.priority, started: now };
  voices.set(id, voice);
  src.onended = () => voices.get(id) === voice && voices.delete(id);
  duck(fx.duck, buf.duration + 0.2);
}
