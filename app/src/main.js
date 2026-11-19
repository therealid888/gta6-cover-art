// Wires the editor: photo library, layout/grade/size choices, per-panel crop
// (drag to pan, wheel to zoom), caption editing, live preview and PNG export.
// A `?shot=` query sets up a fixed scene for a screenshot instead (./shots.js).
import { drawCover, panelRects, clampPan, PANEL_COUNT, GRADES } from './cover.js';
import { runShot } from './shots.js';

export const EXPORT_SIZES = {
  '1080x1080': [1080, 1080],
  '1080x1350': [1080, 1350],
  '1920x1080': [1920, 1080],
};

const canvas = document.getElementById('cover');
const status = document.getElementById('status');
const libraryEl = document.getElementById('library');
const panelPhotoEl = document.getElementById('panelPhoto');
const panelZoomEl = document.getElementById('panelZoom');

const state = {
  layout: 'hero',
  panels: [],
  caption: 'Sunset Heist',
  tagline: 'ONE LAST SCORE',
  captionSize: 1,
  captionPos: 'bottom',
  grade: 'sunset',
  size: '1080x1350',
};
let selected = 0;          // active panel index
let library = [];          // { name, img } in library order
let pickedPhoto = 0;       // library index a panel click assigns next
let pendingAssign = false; // true only right after a library thumbnail is clicked

function newPanel(photo = null) {
  return { photo, zoom: 1, ox: 0, oy: 0 };
}

function ensurePanels() {
  const count = PANEL_COUNT[state.layout];
  while (state.panels.length < count) state.panels.push(newPanel());
  state.panels.length = count;
  if (selected >= count) selected = 0;
}

/** Loads an image from a URL, resolving to the image once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function redraw() {
  ensurePanels();
  // The cover scene (?shot=cover) shows the finished cover: no editor outline.
  const coverScene = document.body.classList.contains('shot-cover');
  drawCover(canvas, state, { showSelection: !coverScene, selected });
  syncPanelControls();
}

function syncPanelControls() {
  const panel = state.panels[selected] ?? newPanel();
  panelZoomEl.value = String(panel.zoom);
  panelPhotoEl.innerHTML = '';
  library.forEach((entry, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = entry.name;
    panelPhotoEl.appendChild(option);
  });
  const none = document.createElement('option');
  none.value = '-1';
  none.textContent = '(empty panel)';
  panelPhotoEl.appendChild(none);
  panelPhotoEl.value = panel.photo ? String(library.findIndex((e) => e.img === panel.photo)) : '-1';
}

function renderLibrary() {
  libraryEl.innerHTML = '';
  library.forEach((entry, i) => {
    const thumb = document.createElement('img');
    thumb.src = entry.img.src;
    thumb.alt = entry.name;
    thumb.title = entry.name;
    if (i === pickedPhoto) thumb.classList.add('active');
    thumb.addEventListener('click', () => {
      pickedPhoto = i;
      pendingAssign = true;
      renderLibrary();
    });
    libraryEl.appendChild(thumb);
  });
}

function assignPhoto(index, photo) {
  state.panels[index] = { photo, zoom: 1, ox: 0, oy: 0 };
  selected = index;
  redraw();
}

/** The photo library, for shot scenes that must reuse the loaded images. */
export function getLibrary() {
  return library;
}

/** Loads the two bundled sample photos into the library, hero first. */
export async function loadSamples() {
  const boulevard = await loadImage('samples/boulevard.jpg');
  const pier = await loadImage('samples/pier.jpg');
  library = [
    { name: 'Boulevard (sample)', img: boulevard },
    { name: 'Pier (sample)', img: pier },
  ];
  assignPhoto(0, boulevard);
  assignPhoto(1, pier);
  assignPhoto(2, boulevard);
  renderLibrary();
  redraw();
}

// --- Photo uploads ---------------------------------------------------------
document.getElementById('photos').addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    if (!file.type.startsWith('image/')) continue;
    const img = await loadImage(URL.createObjectURL(file));
    library.push({ name: file.name.replace(/\.[^.]+$/, ''), img });
  }
  pickedPhoto = library.length - 1;
  renderLibrary();
  if (library.length) assignPhoto(selected, library[pickedPhoto].img);
  status.textContent = `${e.target.files.length} photo(s) added — kept on your machine.`;
  e.target.value = '';
});

// --- Layout, grade, size ----------------------------------------------------
function wireChoices(id, attr, apply) {
  const group = document.getElementById(id);
  group.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-' + attr + ']');
    if (!button) return;
    group.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    button.classList.add('active');
    apply(button.dataset[attr]);
  });
}
wireChoices('layouts', 'layout', (layout) => { state.layout = layout; redraw(); });
wireChoices('grades', 'grade', (grade) => { state.grade = grade; redraw(); });
wireChoices('sizes', 'size', (size) => {
  state.size = size;
  const [w, h] = EXPORT_SIZES[size];
  canvas.width = w;
  canvas.height = h;
  redraw();
});

// --- Selected panel ---------------------------------------------------------
panelPhotoEl.addEventListener('change', () => {
  const i = Number(panelPhotoEl.value);
  assignPhoto(selected, i >= 0 ? library[i].img : null);
});
panelZoomEl.addEventListener('input', () => {
  const panel = state.panels[selected];
  if (!panel) return;
  panel.zoom = Number(panelZoomEl.value);
  redraw();
});
document.getElementById('resetCrop').addEventListener('click', () => {
  const panel = state.panels[selected];
  if (!panel) return;
  panel.zoom = 1;
  panel.ox = 0;
  panel.oy = 0;
  redraw();
});
document.getElementById('swapPhotos').addEventListener('click', () => {
  if (state.panels.length < 2) return;
  const a = state.panels[0];
  const b = state.panels[1];
  state.panels[0] = { ...b };
  state.panels[1] = { ...a };
  redraw();
});

// --- Caption ----------------------------------------------------------------
document.getElementById('caption').addEventListener('input', (e) => {
  state.caption = e.target.value;
  redraw();
});
document.getElementById('tagline').addEventListener('input', (e) => {
  state.tagline = e.target.value;
  redraw();
});
document.getElementById('captionSize').addEventListener('input', (e) => {
  state.captionSize = Number(e.target.value);
  redraw();
});
document.getElementById('captionPos').addEventListener('change', (e) => {
  state.captionPos = e.target.value;
  redraw();
});

// --- Canvas interaction: click a panel to select it, drag to pan, wheel to zoom
function panelAt(clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  const x = (clientX - box.left) * (canvas.width / box.width);
  const y = (clientY - box.top) * (canvas.height / box.height);
  const rects = panelRects(state.layout, canvas.width, canvas.height);
  return { rects, index: rects.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h), x, y };
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const hit = panelAt(e.clientX, e.clientY);
  if (hit.index < 0) return;
  selected = hit.index;
  // A panel click assigns the picked photo only right after a library
  // thumbnail was clicked; otherwise it just selects the panel to crop.
  if (pendingAssign && library[pickedPhoto]) {
    pendingAssign = false;
    assignPhoto(hit.index, library[pickedPhoto].img);
  }
  drag = { index: hit.index, lastX: hit.x, lastY: hit.y };
  canvas.setPointerCapture(e.pointerId);
  redraw();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const hit = panelAt(e.clientX, e.clientY);
  const panel = state.panels[drag.index];
  const rect = hit.rects[drag.index];
  if (!panel || !panel.photo || !rect) return;
  panel.ox += (hit.x - drag.lastX) / rect.w;
  panel.oy += (hit.y - drag.lastY) / rect.h;
  clampPan(panel, rect);
  drag.lastX = hit.x;
  drag.lastY = hit.y;
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const hit = panelAt(e.clientX, e.clientY);
  const index = hit.index >= 0 ? hit.index : selected;
  const panel = state.panels[index];
  if (!panel) return;
  selected = index;
  panel.zoom = Math.max(1, Math.min(3, panel.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
  redraw();
}, { passive: false });

// --- Export -----------------------------------------------------------------
document.getElementById('export').addEventListener('click', async () => {
  const [w, h] = EXPORT_SIZES[state.size];
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  await document.fonts.load(`400 ${Math.round(Math.min(w, h) * 0.1)}px Anton`);
  drawCover(off, state, { showSelection: false });
  off.toBlob((blob) => {
    if (!blob) {
      status.textContent = 'Export failed — please try again.';
      return;
    }
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `cover-${state.size}.png`;
    a.click();
    // Free the blob URL once the download has had a moment to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `Saved cover-${state.size}.png (${w} × ${h}).`;
  }, 'image/png');
});

// --- Start ------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
async function boot() {
  try {
    await document.fonts.load('400 40px Anton');
  } catch (_) { /* Anton falls back to a heavy sans-serif */ }
  if (shot) {
    await runShot(shot, params, state, { loadSamples, getLibrary, redraw, assignPhoto, EXPORT_SIZES });
  } else {
    await loadSamples();
    redraw();
  }
}
boot();
