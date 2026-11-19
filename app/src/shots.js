// Fixed scenes for screenshots: ?shot=editor shows the page with sample photos;
// ?shot=cover shows the cover alone. Query knobs: `photo` (hero sample),
// `photo2` (second sample), `caption`, `tagline`, `pos`, `layout`, `grade` and
// `size` (e.g. 1920x1080 — sets the canvas to that export size).
// window.__shotReady is set once the cover is painted.
import { LAYOUTS, GRADES, PANEL_COUNT } from './cover.js';

function markActive(selector, attr, value) {
  document.querySelectorAll(selector).forEach((b) => b.classList.toggle('active', b.dataset[attr] === value));
}

export async function runShot(shot, query, state, helpers) {
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const canvas = document.getElementById('cover');

  const size = query.get('size');
  if (size && helpers.EXPORT_SIZES[size]) {
    const [w, h] = helpers.EXPORT_SIZES[size];
    state.size = size;
    canvas.width = w;
    canvas.height = h;
    markActive('#sizes button', 'size', size);
  }
  const layout = query.get('layout');
  if (layout && LAYOUTS.includes(layout)) {
    state.layout = layout;
    markActive('#layouts button', 'layout', layout);
  }
  const grade = query.get('grade');
  if (grade && GRADES[grade]) {
    state.grade = grade;
    markActive('#grades button', 'grade', grade);
  }
  state.caption = query.get('caption') ?? 'Sunset Heist';
  state.tagline = query.get('tagline') ?? 'ONE LAST SCORE';
  state.captionPos = query.get('pos') ?? 'bottom';
  document.getElementById('caption').value = state.caption;
  document.getElementById('tagline').value = state.tagline;

  await helpers.loadSamples();
  // Fill the panels from the library images (same objects the editor shows,
  // so the panel dropdown names them): hero photo on the big panel, the
  // second sample on the rest; grid alternates the two.
  const lib = helpers.getLibrary();
  const pick = (name) => lib.find((e) => e.name.toLowerCase().includes(name))?.img ?? lib[0]?.img ?? null;
  const hero = pick(query.get('photo') ?? 'boulevard');
  const second = pick(query.get('photo2') ?? 'pier');
  const count = PANEL_COUNT[state.layout];
  for (let i = 0; i < count; i++) {
    const photo = state.layout === 'grid' ? (i % 2 === 0 ? hero : second) : (i === 0 ? hero : second);
    state.panels[i] = { photo, zoom: 1, ox: 0, oy: 0 };
  }
  // A gentle zoom on the hero panel makes the cover feel composed, not pasted.
  if (state.panels[0]) state.panels[0].zoom = 1.12;
  helpers.redraw();
  try {
    await document.fonts.load('400 40px Anton');
    await document.fonts.ready;
  } catch (_) { /* Anton falls back to a heavy sans-serif */ }
  helpers.redraw();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
