// Vice Cover Studio — editor.
//
// Wires the preview canvas, the library, the layout and grade controls and
// the export buttons to the cover painter in cover.js. Photos stay on the
// user's machine: uploads are read as data URLs and never sent anywhere.
// The live preview is the same paint the export buttons write, at preview
// resolution, so what you see is what the PNG holds.

import { paintCover, panelRects, panelCount, GRADES, LAYOUTS } from './cover.js';
import { readScene, loadSamplePhoto, waitForFonts, markReady, SAMPLE_PHOTOS } from './shots.js';

const $ = (sel) => document.querySelector(sel);
const preview = $('#preview');
const statusLine = $('#status');

/** One panel slot: its photo (or null), zoom and pan. */
function emptySlot() {
  return { img: null, src: '', zoom: 1, ox: 0, oy: 0 };
}

const state = {
  layout: 'hero',
  grade: 'sunset',
  title: 'SUNSET HEIST',
  tagline: 'ONE LAST SCORE',
  taglinePos: 'above',
  panels: [emptySlot(), emptySlot(), emptySlot(), emptySlot()],
};

/** Preview canvas pixel sizes for each cover shape the editor offers. */
const PREVIEW_SIZES = {
  square: { w: 540, h: 540 },
  portrait: { w: 540, h: 675 },
  wide: { w: 960, h: 540 },
};

/** Full-resolution PNG size written for each cover shape. */
const EXPORT_SIZES = {
  square: '1080x1080',
  portrait: '1080x1350',
  wide: '1920x1080',
};

let selectedPanel = 0;
let coverMode = false;
let armedPhoto = null; // library id waiting to be placed on a panel
let drag = null; // { panel, startX, startY, ox, oy } while pointer is down

/** The library: bundled samples first, then the user's uploads. */
const library = [];
let uploadCount = 0;

function repaint() {
  paintCover(preview, state, { selected: selectedPanel, showSelection: !coverMode });
}

function setStatus(text) {
  if (statusLine) statusLine.textContent = text;
}

function refreshControls() {
  document.querySelectorAll('.layout-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('.grade-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  const zoomRange = $('#zoomRange');
  const panel = state.panels[selectedPanel];
  if (zoomRange && panel) {
    zoomRange.value = String(panel.zoom);
    const zoomValue = $('#zoomValue');
    if (zoomValue) zoomValue.textContent = `${panel.zoom.toFixed(2)}×`;
  }
  const panelLabel = $('#panelLabel');
  if (panelLabel) panelLabel.textContent = `Panel ${selectedPanel + 1} of ${panelCount(state.layout)}`;
}

/** Put a library photo onto a panel slot. */
function placePhoto(slotIndex, item) {
  const panel = state.panels[slotIndex];
  panel.img = item.img;
  panel.src = item.src;
  panel.zoom = 1;
  panel.ox = 0;
  panel.oy = 0;
}

/** Which panel, if any, sits under a point in preview-canvas pixels. */
function panelAt(x, y) {
  const rects = panelRects(state.layout, preview.width, preview.height);
  for (let i = 0; i < panelCount(state.layout); i++) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

function canvasPoint(event) {
  const box = preview.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * preview.width,
    y: ((event.clientY - box.top) / box.height) * preview.height,
  };
}

function bindPointer() {
  preview.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    preview.setPointerCapture(event.pointerId);
    const p = canvasPoint(event);
    const hit = panelAt(p.x, p.y);
    if (hit < 0) return;
    if (armedPhoto) {
      const item = library.find((entry) => entry.id === armedPhoto);
      if (item) {
        placePhoto(hit, item);
        setStatus(`Placed ${item.label} on panel ${hit + 1}`);
      }
      armedPhoto = null;
      document.querySelectorAll('.thumb').forEach((t) => t.classList.remove('armed'));
    }
    selectedPanel = hit;
    const panel = state.panels[hit];
    drag = { panel: hit, startX: p.x, startY: p.y, ox: panel.ox, oy: panel.oy };
    refreshControls();
    repaint();
  });
  preview.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const p = canvasPoint(event);
    const rects = panelRects(state.layout, preview.width, preview.height);
    const rect = rects[drag.panel];
    const panel = state.panels[drag.panel];
    panel.ox = drag.ox + (p.x - drag.startX) / rect.w;
    panel.oy = drag.oy + (p.y - drag.startY) / rect.h;
    repaint();
  });
  const endDrag = () => { drag = null; };
  preview.addEventListener('pointerup', endDrag);
  preview.addEventListener('pointercancel', endDrag);
  preview.addEventListener('wheel', (event) => {
    event.preventDefault();
    const panel = state.panels[selectedPanel];
    panel.zoom = Math.min(4, Math.max(1, panel.zoom * Math.exp(-event.deltaY * 0.0012)));
    refreshControls();
    repaint();
  }, { passive: false });
}

/** Paint the cover at full size and trigger a PNG download. */
async function exportCover(sizeLabel) {
  const [w, h] = sizeLabel.split('x').map(Number);
  if (!w || !h) return;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  paintCover(off, state, { showSelection: false });
  const blob = await new Promise((resolve) => off.toBlob(resolve, 'image/png'));
  if (!blob) {
    setStatus('Export failed: the canvas produced no image');
    return;
  }
  const url = URL.createObjectURL(blob);
  setStatus(`Saving cover-${w}x${h}.png…`);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cover-${w}x${h}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  setStatus(`Exported cover-${w}x${h}.png`);
}

function bindControls() {
  document.querySelectorAll('.layout-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (!LAYOUTS.includes(b.dataset.layout)) return;
      state.layout = b.dataset.layout;
      selectedPanel = 0;
      refreshControls();
      repaint();
    });
  });
  document.querySelectorAll('.grade-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (!GRADES[b.dataset.grade]) return;
      state.grade = b.dataset.grade;
      refreshControls();
      repaint();
    });
  });
  const titleInput = $('#titleInput');
  if (titleInput) {
    titleInput.addEventListener('input', () => {
      state.title = titleInput.value;
      repaint();
    });
  }
  const taglineInput = $('#taglineInput');
  if (taglineInput) {
    taglineInput.addEventListener('input', () => {
      state.tagline = taglineInput.value;
      repaint();
    });
  }
  const tagPos = $('#tagPos');
  if (tagPos) {
    tagPos.addEventListener('change', () => {
      state.taglinePos = tagPos.value === 'below' ? 'below' : 'above';
      repaint();
    });
  }
  const coverSize = $('#coverSize');
  if (coverSize) {
    coverSize.addEventListener('change', () => {
      const size = PREVIEW_SIZES[coverSize.value] || PREVIEW_SIZES.portrait;
      preview.width = size.w;
      preview.height = size.h;
      repaint();
    });
  }
  const zoomRange = $('#zoomRange');
  if (zoomRange) {
    zoomRange.addEventListener('input', () => {
      const panel = state.panels[selectedPanel];
      panel.zoom = Number(zoomRange.value);
      refreshControls();
      repaint();
    });
  }
  const resetCrop = $('#resetCrop');
  if (resetCrop) {
    resetCrop.addEventListener('click', () => {
      const panel = state.panels[selectedPanel];
      panel.zoom = 1;
      panel.ox = 0;
      panel.oy = 0;
      refreshControls();
      repaint();
      setStatus(`Crop reset on panel ${selectedPanel + 1}`);
    });
  }
  document.querySelectorAll('.export-btn[data-size]').forEach((b) => {
    b.addEventListener('click', () => exportCover(b.dataset.size));
  });
  // The main Export button writes the size the shape picker currently
  // shows, so one click always matches the preview on screen.
  const exportMain = $('#export');
  if (exportMain) {
    exportMain.addEventListener('click', () => {
      const picker = $('#coverSize');
      const size = (picker && EXPORT_SIZES[picker.value]) || '1080x1350';
      exportCover(size);
    });
  }
}

/** Build one library thumbnail button for a photo item. */
function addThumb(item) {
  const strip = $('#library');
  if (!strip) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'thumb';
  btn.dataset.id = item.id;
  btn.title = item.label;
  const img = document.createElement('img');
  img.src = item.src;
  img.alt = item.label;
  const cap = document.createElement('span');
  cap.textContent = item.label;
  btn.append(img, cap);
  btn.addEventListener('click', () => {
    armedPhoto = item.id;
    document.querySelectorAll('.thumb').forEach((t) => t.classList.remove('armed'));
    btn.classList.add('armed');
    setStatus(`${item.label} armed — click a panel to place it`);
  });
  strip.appendChild(btn);
}

/** Read the user's uploads into the library as data URLs. */
function bindUpload() {
  const input = $('#uploadInput');
  if (!input) return;
  input.addEventListener('change', () => {
    for (const file of input.files || []) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          uploadCount += 1;
          const item = {
            id: `upload-${uploadCount}`,
            label: file.name.replace(/\.[^.]+$/, '').slice(0, 18) || `Upload ${uploadCount}`,
            src: String(reader.result),
            img,
          };
          library.push(item);
          addThumb(item);
          armedPhoto = item.id;
          document.querySelectorAll('.thumb').forEach((t) => t.classList.toggle('armed', t.dataset.id === item.id));
          setStatus(`${item.label} armed — click a panel to place it`);
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    }
    input.value = '';
  });
}

/** Apply a shot scene's knobs onto the editor state. */
async function applyScene(scene) {
  // A ?size= that names one of the export sizes picks that cover shape, so
  // the shape picker, the preview and the Export button all agree on it.
  const shapeBySize = { '1080x1080': 'square', '1080x1350': 'portrait', '1920x1080': 'wide' };
  const shape = shapeBySize[`${scene.size.w}x${scene.size.h}`];
  if (shape) {
    const picker = $('#coverSize');
    if (picker) picker.value = shape;
    if (!coverMode) {
      const size = PREVIEW_SIZES[shape];
      preview.width = size.w;
      preview.height = size.h;
    }
  }
  if (scene.layout && LAYOUTS.includes(scene.layout)) state.layout = scene.layout;
  if (scene.grade && GRADES[scene.grade]) state.grade = scene.grade;
  if (scene.caption !== null && scene.caption !== undefined) state.title = scene.caption;
  if (scene.tagline !== null && scene.tagline !== undefined) state.tagline = scene.tagline;
  if (scene.taglinePos) state.taglinePos = scene.taglinePos;
  for (let i = 0; i < 4; i++) {
    const id = scene.photos[i];
    if (!id) continue;
    try {
      const img = await loadSamplePhoto(id);
      const item = library.find((entry) => entry.id === id) || { id, label: id, src: SAMPLE_PHOTOS[id], img };
      state.panels[i].img = img;
      state.panels[i].src = item.src;
      if (scene.zoom !== null) state.panels[i].zoom = scene.zoom;
      if (scene.ox !== null) state.panels[i].ox = scene.ox;
      if (scene.oy !== null) state.panels[i].oy = scene.oy;
    } catch {
      setStatus(`Could not load sample photo: ${id}`);
    }
  }
}

/** Load the bundled samples into the library and fill the default panels. */
async function loadDefaults() {
  for (const id of Object.keys(SAMPLE_PHOTOS)) {
    try {
      const img = await loadSamplePhoto(id);
      library.push({ id, label: id === 'pier' ? 'Pier' : 'Boulevard', src: SAMPLE_PHOTOS[id], img });
    } catch {
      setStatus(`Could not load sample photo: ${id}`);
    }
  }
  const pier = library.find((e) => e.id === 'pier');
  const boulevard = library.find((e) => e.id === 'boulevard');
  const defaults = [pier, boulevard, pier, boulevard];
  defaults.forEach((item, i) => {
    if (item) placePhoto(i, item);
  });
  library.forEach(addThumb);
}

async function init() {
  const scene = readScene(window.location.search);
  coverMode = scene.mode === 'cover';
  if (coverMode) {
    document.body.classList.add('shot-cover');
    preview.width = scene.size.w;
    preview.height = scene.size.h;
  }
  bindControls();
  bindPointer();
  bindUpload();
  await loadDefaults();
  await applyScene(scene);
  refreshControls();
  await waitForFonts();
  repaint();
  markReady();
}

init().catch((err) => {
  setStatus(`Editor failed to start: ${err.message}`);
  markReady();
});
