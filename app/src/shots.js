// Vice Cover Studio — shot scenes.
//
// Reads the page's query string and turns it into a cover state for
// screenshots and tests. Supported knobs:
//
//   ?shot=editor|cover   which scene to show (default: editor)
//   ?size=1080x1350      cover-scene canvas size (default: 1080x1350)
//   ?layout=hero|triple|grid|single
//   ?grade=sunset|neon|golden|ocean|noir
//   ?photo=pier          sample photo for panel 0 (pier or boulevard)
//   ?photo2=, ?photo3=, ?photo4=   sample photos for panels 1..3
//   ?caption=...         title caption
//   ?tagline=...         tagline text
//   ?tagpos=above|below  where the tagline sits relative to the title
//   ?zoom=1.2            zoom applied to every panel
//   ?ox=0.1&oy=-0.05     pan applied to every panel
//
// After the fonts load and the first paint, the editor calls markReady(),
// which raises window.__shotReady so the screenshot tool knows the scene
// is settled.

/** The bundled sample photos, by their short id. */
export const SAMPLE_PHOTOS = {
  pier: 'samples/pier.jpg',
  boulevard: 'samples/boulevard.jpg',
};

/** Parse one `WxH` size string; null when it is not shaped like one. */
function parseSize(raw) {
  if (!raw) return null;
  const m = /^(\d+)x(\d+)$/.exec(raw.trim());
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16 || w > 4096 || h > 4096) return null;
  return { w, h };
}

/** Parse one float query value; `fallback` when it is missing or not a number. */
function parseNumber(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Read the scene description out of a query string (location.search). */
export function readScene(search) {
  const q = new URLSearchParams(search || '');
  const photos = [q.get('photo'), q.get('photo2'), q.get('photo3'), q.get('photo4')]
    .map((id) => (id && SAMPLE_PHOTOS[id] ? id : null));
  return {
    mode: q.get('shot') === 'cover' ? 'cover' : 'editor',
    size: parseSize(q.get('size')) || { w: 1080, h: 1350 },
    layout: q.get('layout') || null,
    grade: q.get('grade') || null,
    photos,
    caption: q.get('caption'),
    tagline: q.get('tagline'),
    taglinePos: q.get('tagpos') === 'below' ? 'below' : q.get('tagpos') === 'above' ? 'above' : null,
    zoom: parseNumber(q.get('zoom'), null),
    ox: parseNumber(q.get('ox'), null),
    oy: parseNumber(q.get('oy'), null),
  };
}

/** Load one sample photo by id; resolves to the Image once it decodes. */
export function loadSamplePhoto(id) {
  return new Promise((resolve, reject) => {
    const src = SAMPLE_PHOTOS[id];
    if (!src) {
      reject(new Error(`unknown sample photo: ${id}`));
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

/**
 * Wait for the display font to be usable, giving up after a few seconds so
 * a scene never hangs on a font that will not come.
 */
export function waitForFonts(timeoutMs = 4000) {
  const ready = (document.fonts ? document.fonts.ready : Promise.resolve()).catch(() => undefined);
  const timer = new Promise((resolve) => setTimeout(resolve, timeoutMs));
  const loads = [];
  if (document.fonts && document.fonts.load) {
    loads.push(document.fonts.load('32px Anton').catch(() => undefined));
    loads.push(document.fonts.load('16px Anton').catch(() => undefined));
  }
  return Promise.race([Promise.all([ready, ...loads]).then(() => undefined), timer]);
}

/** Tell the screenshot tool the scene is painted and settled. */
export function markReady() {
  window.__shotReady = true;
}
