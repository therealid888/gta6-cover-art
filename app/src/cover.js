// Paints the multi-panel GTA-style cover onto a canvas: photo panels split by
// white gutters, a sunset or neon colour grade, and a bold Anton caption with an
// offset colour shadow.
//
// State shape:
//   { layout, panels: [{ photo, zoom, ox, oy }], caption, tagline,
//     captionSize, captionPos, grade }
// `panels` is indexed by panel number; a panel with no photo draws a deep
// purple placeholder with a diagonal sheen. `options.showSelection` draws the
// editor's dashed outline around one panel (preview only, never exported).

export const LAYOUTS = ['hero', 'triple', 'grid', 'single'];

export const GRADES = {
  sunset: {
    label: 'Vice Sunset',
    panelTop: 'rgba(255, 170, 60, 0.10)',
    panelBottom: 'rgba(255, 46, 136, 0.38)',
    washTop: 'rgba(255, 120, 40, 0.05)',
    washBottom: 'rgba(120, 20, 90, 0.22)',
    titleShadow: '#ff2e88',
    tagline: '#ffb347',
    vignette: 0.28,
  },
  neon: {
    label: 'Neon Nights',
    panelTop: 'rgba(0, 229, 255, 0.12)',
    panelBottom: 'rgba(255, 46, 136, 0.42)',
    washTop: 'rgba(0, 40, 80, 0.18)',
    washBottom: 'rgba(120, 0, 120, 0.30)',
    titleShadow: '#00e5ff',
    tagline: '#00e5ff',
    vignette: 0.34,
  },
  golden: {
    label: 'Golden Hour',
    panelTop: 'rgba(255, 210, 90, 0.16)',
    panelBottom: 'rgba(200, 90, 20, 0.34)',
    washTop: 'rgba(255, 190, 80, 0.10)',
    washBottom: 'rgba(140, 60, 10, 0.20)',
    titleShadow: '#ff7a18',
    tagline: '#ffe08a',
    vignette: 0.24,
  },
  ocean: {
    label: 'Ocean Drive',
    panelTop: 'rgba(0, 220, 200, 0.14)',
    panelBottom: 'rgba(0, 60, 140, 0.40)',
    washTop: 'rgba(0, 180, 180, 0.08)',
    washBottom: 'rgba(0, 30, 90, 0.26)',
    titleShadow: '#00e5ff',
    tagline: '#7dffd4',
    vignette: 0.26,
  },
  noir: {
    label: 'Noir',
    panelTop: 'rgba(255, 255, 255, 0.05)',
    panelBottom: 'rgba(0, 0, 0, 0.42)',
    washTop: 'rgba(255, 255, 255, 0.04)',
    washBottom: 'rgba(0, 0, 0, 0.30)',
    titleShadow: '#111111',
    tagline: '#e8e8e8',
    vignette: 0.40,
    desaturate: true,
  },
};

export const PANEL_COUNT = { hero: 3, triple: 3, grid: 4, single: 1 };

/** Panel rectangles for a layout, as fractions of the cover, with white gutters. */
export function panelRects(layout, w, h) {
  const g = Math.max(4, Math.round(Math.min(w, h) * 0.012)); // gutter
  const m = Math.max(6, Math.round(Math.min(w, h) * 0.016)); // outer frame
  const landscape = w >= h;
  const full = { x: m, y: m, w: w - 2 * m, h: h - 2 * m };
  if (layout === 'single') return [full];
  if (layout === 'grid') {
    const cw = (full.w - g) / 2;
    const ch = (full.h - g) / 2;
    return [
      { x: full.x, y: full.y, w: cw, h: ch },
      { x: full.x + cw + g, y: full.y, w: cw, h: ch },
      { x: full.x, y: full.y + ch + g, w: cw, h: ch },
      { x: full.x + cw + g, y: full.y + ch + g, w: cw, h: ch },
    ];
  }
  if (layout === 'triple') {
    if (landscape) {
      const cw = (full.w - 2 * g) / 3;
      return [0, 1, 2].map((i) => ({ x: full.x + i * (cw + g), y: full.y, w: cw, h: full.h }));
    }
    const ch = (full.h - 2 * g) / 3;
    return [0, 1, 2].map((i) => ({ x: full.x, y: full.y + i * (ch + g), w: full.w, h: ch }));
  }
  // Hero: one big panel, two small ones beside it (landscape) or below it (portrait).
  const big = landscape ? 0.62 : 0.60;
  if (landscape) {
    const bw = full.w * big;
    const sw = full.w - bw - g;
    const sh = (full.h - g) / 2;
    return [
      { x: full.x, y: full.y, w: bw, h: full.h },
      { x: full.x + bw + g, y: full.y, w: sw, h: sh },
      { x: full.x + bw + g, y: full.y + sh + g, w: sw, h: sh },
    ];
  }
  const bh = full.h * big;
  const sw = (full.w - g) / 2;
  const sh = full.h - bh - g;
  return [
    { x: full.x, y: full.y, w: full.w, h: bh },
    { x: full.x, y: full.y + bh + g, w: sw, h: sh },
    { x: full.x + sw + g, y: full.y + bh + g, w: sw, h: sh },
  ];
}

/** Keeps a panel's pan offsets inside the photo so the panel stays covered. */
export function clampPan(panel, rect) {
  if (!panel.photo) return;
  const iw = panel.photo.naturalWidth;
  const ih = panel.photo.naturalHeight;
  const scale = Math.max(rect.w / iw, rect.h / ih) * panel.zoom;
  const overX = Math.max(0, (iw * scale - rect.w) / 2 / rect.w);
  const overY = Math.max(0, (ih * scale - rect.h) / 2 / rect.h);
  panel.ox = Math.max(-overX, Math.min(overX, panel.ox));
  panel.oy = Math.max(-overY, Math.min(overY, panel.oy));
}

function drawPanel(ctx, panel, rect, grade) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (panel.photo) {
    const iw = panel.photo.naturalWidth;
    const ih = panel.photo.naturalHeight;
    const scale = Math.max(rect.w / iw, rect.h / ih) * panel.zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(panel.photo, rect.x + (rect.w - dw) / 2 + panel.ox * rect.w, rect.y + (rect.h - dh) / 2 + panel.oy * rect.h, dw, dh);
    if (grade.desaturate) {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.globalCompositeOperation = 'source-over';
    }
  } else {
    const sheen = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    sheen.addColorStop(0, '#3a1c56');
    sheen.addColorStop(0.5, '#241233');
    sheen.addColorStop(1, '#120a1c');
    ctx.fillStyle = sheen;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = Math.max(2, rect.w * 0.004);
    ctx.beginPath();
    ctx.moveTo(rect.x, rect.y + rect.h);
    ctx.lineTo(rect.x + rect.w, rect.y);
    ctx.stroke();
  }
  const tint = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  tint.addColorStop(0, grade.panelTop);
  tint.addColorStop(1, grade.panelBottom);
  ctx.fillStyle = tint;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

function drawCaption(ctx, w, h, state, grade) {
  const text = state.caption.trim().toUpperCase();
  const tag = state.tagline.trim().toUpperCase();
  const base = Math.min(w, h);
  const bottom = state.captionPos !== 'top';
  // Scrim band behind the lettering so it reads over any photo.
  const bandH = base * 0.30;
  const bandY = bottom ? h - bandH - base * 0.02 : base * 0.02;
  const scrim = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  if (bottom) {
    scrim.addColorStop(0, 'rgba(10, 4, 18, 0)');
    scrim.addColorStop(1, 'rgba(10, 4, 18, 0.72)');
  } else {
    scrim.addColorStop(0, 'rgba(10, 4, 18, 0.72)');
    scrim.addColorStop(1, 'rgba(10, 4, 18, 0)');
  }
  ctx.fillStyle = scrim;
  ctx.fillRect(0, bandY, w, bandH);

  if (!text) return;
  let size = base * 0.105 * state.captionSize;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const setFont = (s) => { ctx.font = `400 ${s}px Anton, 'Arial Narrow', sans-serif`; };
  setFont(size);
  try { ctx.letterSpacing = `${Math.round(size * 0.02)}px`; } catch (_) { /* older canvas */ }
  while (ctx.measureText(text).width > w * 0.88 && size > 14) {
    size -= 2;
    setFont(size);
  }
  const y = bottom ? h - base * 0.075 : base * 0.16;
  const dx = size * 0.045;
  const dy = size * 0.05;
  // Offset colour shadow, then black outline, then white fill.
  ctx.fillStyle = grade.titleShadow;
  ctx.fillText(text, w / 2 + dx, y + dy);
  ctx.lineWidth = Math.max(2, size * 0.13);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0d0512';
  ctx.strokeText(text, w / 2, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, y);
  if (tag) {
    const tSize = Math.max(12, size * 0.26);
    ctx.font = `400 ${tSize}px Anton, 'Arial Narrow', sans-serif`;
    try { ctx.letterSpacing = `${Math.round(tSize * 0.42)}px`; } catch (_) { /* older canvas */ }
    ctx.fillStyle = grade.tagline;
    // Above the title when it sits at the bottom (clear of the cap height),
    // below it when the title sits at the top.
    const ty = bottom ? y - size * 1.02 : y + size * 0.62;
    ctx.fillText(tag, w / 2, ty);
  }
  try { ctx.letterSpacing = '0px'; } catch (_) { /* older canvas */ }
}

/** Draws the whole cover onto `canvas` at its own size. */
export function drawCover(canvas, state, options = {}) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const grade = GRADES[state.grade] ?? GRADES.sunset;
  ctx.clearRect(0, 0, w, h);
  // White gutters and frame: the cover's paper.
  ctx.fillStyle = '#f6f2f0';
  ctx.fillRect(0, 0, w, h);
  const rects = panelRects(state.layout, w, h);
  for (let i = 0; i < rects.length; i++) {
    drawPanel(ctx, state.panels[i] ?? { photo: null, zoom: 1, ox: 0, oy: 0 }, rects[i], grade);
  }
  // Grade wash over the whole cover, then a vignette.
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, grade.washTop);
  wash.addColorStop(1, grade.washBottom);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, `rgba(0, 0, 0, ${grade.vignette})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  drawCaption(ctx, w, h, state, grade);
  // Editor-only selection outline around the active panel.
  if (options.showSelection && options.selected >= 0 && rects[options.selected]) {
    const r = rects[options.selected];
    ctx.save();
    ctx.strokeStyle = '#ff2e88';
    ctx.lineWidth = Math.max(3, Math.min(w, h) * 0.008);
    ctx.setLineDash([14, 8]);
    ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    ctx.restore();
  }
}
