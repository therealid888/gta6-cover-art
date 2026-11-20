// Vice Cover Studio — cover painter.
//
// Draws the multi-panel GTA-style poster onto a canvas from a plain state
// object. Everything is canvas 2D, no libraries, no network: the photos come
// from the state, the lettering from the vendored Anton font, the colour from
// the grade table below.
//
// State shape:
//   {
//     layout: 'hero' | 'triple' | 'grid' | 'single',
//     grade:  'sunset' | 'neon' | 'golden' | 'ocean' | 'noir',
//     title: string, tagline: string, taglinePos: 'above' | 'below',
//     panels: [ { img, zoom, ox, oy } x 4 ]   // img is an HTMLImageElement or null
//   }
// Panel slots are positional: a layout uses the first panels it needs
// (hero and triple use three, grid four, single one). ox/oy pan the photo as
// fractions of the panel's width and height; zoom is a scale multiplier.

export const LAYOUTS = ['hero', 'triple', 'grid', 'single'];

// One grade: a wash gradient laid over the photos, the colour of the title's
// offset shadow, how strong the corner vignette is, and whether the photos
// are drained of colour.
export const GRADES = {
  sunset: {
    label: 'Vice Sunset',
    shadow: '#ff2d78',
    blend: 'overlay',
    wash: [[0, 'rgba(255, 122, 26, 0.34)'], [0.55, 'rgba(255, 45, 120, 0.22)'], [1, 'rgba(90, 20, 140, 0.30)']],
    vignette: 0.32,
    desaturate: false,
  },
  neon: {
    label: 'Neon Nights',
    shadow: '#22d3ee',
    blend: 'soft-light',
    wash: [[0, 'rgba(255, 0, 128, 0.42)'], [0.5, 'rgba(80, 0, 160, 0.30)'], [1, 'rgba(0, 210, 255, 0.38)']],
    vignette: 0.38,
    desaturate: false,
  },
  golden: {
    label: 'Golden Hour',
    shadow: '#ffb020',
    blend: 'overlay',
    wash: [[0, 'rgba(255, 190, 60, 0.30)'], [1, 'rgba(200, 90, 0, 0.30)']],
    vignette: 0.26,
    desaturate: false,
  },
  ocean: {
    label: 'Ocean Drive',
    shadow: '#2ee6a8',
    blend: 'soft-light',
    wash: [[0, 'rgba(0, 220, 190, 0.30)'], [1, 'rgba(0, 60, 160, 0.38)']],
    vignette: 0.30,
    desaturate: false,
  },
  noir: {
    label: 'Noir',
    shadow: '#e8e8e8',
    blend: 'source-over',
    wash: [[0, 'rgba(0, 0, 0, 0.10)'], [1, 'rgba(0, 0, 0, 0.22)']],
    vignette: 0.48,
    desaturate: true,
  },
};

/** The gutter between panels and around the frame, in pixels for a cover of this size. */
function gutterFor(w, h) {
  return Math.max(4, Math.round(Math.min(w, h) * 0.018));
}

/**
 * The panel rectangles for a layout on a cover of w x h, in canvas pixels.
 * Rects adapt to the cover's shape: wide covers stack the hero's small
 * panels to the right, tall covers stack them underneath.
 */
export function panelRects(layout, w, h) {
  const g = gutterFor(w, h);
  const full = { x: g, y: g, w: w - 2 * g, h: h - 2 * g };
  const wide = w >= h;
  if (layout === 'single') return [full];
  if (layout === 'grid') {
    const cw = (w - 3 * g) / 2;
    const ch = (h - 3 * g) / 2;
    return [
      { x: g, y: g, w: cw, h: ch },
      { x: 2 * g + cw, y: g, w: cw, h: ch },
      { x: g, y: 2 * g + ch, w: cw, h: ch },
      { x: 2 * g + cw, y: 2 * g + ch, w: cw, h: ch },
    ];
  }
  if (layout === 'triple') {
    if (wide) {
      const cw = (w - 4 * g) / 3;
      return [0, 1, 2].map((i) => ({ x: g + i * (cw + g), y: g, w: cw, h: h - 2 * g }));
    }
    const ch = (h - 4 * g) / 3;
    return [0, 1, 2].map((i) => ({ x: g, y: g + i * (ch + g), w: w - 2 * g, h: ch }));
  }
  // hero: one big panel and two small ones.
  if (wide) {
    const bigW = (w - 3 * g) * 0.62;
    const smallX = g + bigW + g;
    const smallW = w - smallX - g;
    const smallH = (h - 3 * g) / 2;
    return [
      { x: g, y: g, w: bigW, h: h - 2 * g },
      { x: smallX, y: g, w: smallW, h: smallH },
      { x: smallX, y: 2 * g + smallH, w: smallW, h: smallH },
    ];
  }
  const bigH = (h - 3 * g) * 0.62;
  const smallY = g + bigH + g;
  const smallH = h - smallY - g;
  const smallW = (w - 3 * g) / 2;
  return [
    { x: g, y: g, w: w - 2 * g, h: bigH },
    { x: g, y: smallY, w: smallW, h: smallH },
    { x: 2 * g + smallW, y: smallY, w: smallW, h: smallH },
  ];
}

/** How many panels a layout shows. */
export function panelCount(layout) {
  return layout === 'grid' ? 4 : layout === 'single' ? 1 : 3;
}

/**
 * Draw one photo into a panel, cover-fitting it and applying the panel's
 * pan and zoom. ox/oy move the photo as fractions of the panel size.
 */
function drawPhoto(ctx, img, rect, panel, desaturate) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const scale = Math.max(rect.w / iw, rect.h / ih) * (panel.zoom || 1);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = rect.x + (rect.w - dw) / 2 + (panel.ox || 0) * rect.w;
  const dy = rect.y + (rect.h - dh) / 2 + (panel.oy || 0) * rect.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (desaturate) ctx.filter = 'saturate(0.06) brightness(1.04)';
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

/** Lay a grade's wash over one panel rectangle. */
function washPanel(ctx, rect, grade) {
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  for (const [stop, color] of grade.wash) grad.addColorStop(stop, color);
  ctx.save();
  ctx.globalCompositeOperation = grade.blend;
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** Darken the cover's corners a little, for the poster feel. */
function vignette(ctx, w, h, strength) {
  if (strength <= 0) return;
  const grad = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.32,
    w / 2, h / 2, Math.max(w, h) * 0.72,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, `rgba(0, 0, 0, ${strength})`);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** The biggest title size that fits the cover's width, in pixels. */
function titleSizeFor(ctx, title, w) {
  const margin = w * 0.06;
  let size = Math.round(w * 0.088);
  ctx.font = `${size}px Anton, 'Arial Black', sans-serif`;
  try { ctx.letterSpacing = `${Math.round(size * 0.02)}px`; } catch { /* older canvas: ignore */ }
  while (size > 12 && ctx.measureText(title).width > w - 2 * margin) {
    size = Math.round(size * 0.94);
    ctx.font = `${size}px Anton, 'Arial Black', sans-serif`;
  }
  return size;
}

/**
 * Draw the tagline and the title near the bottom of the cover. The title
 * gets an offset colour shadow, a black outline and a white fill; the
 * tagline sits above it or below it, letter-spaced and outlined.
 */
function drawLettering(ctx, state, w, h, grade) {
  const title = (state.title || '').toUpperCase();
  const tagline = (state.tagline || '').toUpperCase();
  const margin = w * 0.06;
  const size = titleSizeFor(ctx, title || ' ', w);
  const titleX = margin;
  const titleBaseline = h - margin * 0.9;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';

  const tagSize = Math.max(10, Math.round(size * 0.30));
  if (tagline) {
    ctx.font = `${tagSize}px Anton, 'Arial Black', sans-serif`;
    try { ctx.letterSpacing = `${Math.round(tagSize * 0.28)}px`; } catch { /* ignore */ }
    ctx.lineWidth = Math.max(2, tagSize / 7);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillStyle = '#ffffff';
    const tagY = state.taglinePos === 'below'
      ? titleBaseline + tagSize * 1.5
      : titleBaseline - size * 1.02;
    ctx.strokeText(tagline, titleX, tagY);
    ctx.fillText(tagline, titleX, tagY);
  }

  if (title) {
    ctx.font = `${size}px Anton, 'Arial Black', sans-serif`;
    try { ctx.letterSpacing = `${Math.round(size * 0.02)}px`; } catch { /* ignore */ }
    const dx = Math.round(size * 0.055);
    const dy = Math.round(size * 0.055);
    // Offset colour shadow first, then the outlined white letters on top.
    ctx.fillStyle = grade.shadow;
    ctx.fillText(title, titleX + dx, titleBaseline + dy);
    ctx.lineWidth = Math.max(3, size / 9);
    ctx.strokeStyle = '#000000';
    ctx.strokeText(title, titleX, titleBaseline);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, titleX, titleBaseline);
  }
  try { ctx.letterSpacing = '0px'; } catch { /* ignore */ }
}

/**
 * Paint the whole cover onto `canvas` from `state`.
 * opts: { selected: panel index or -1, showSelection: boolean } — the
 * selection outline is an editor aid and never appears on exports.
 */
export function paintCover(canvas, state, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const grade = GRADES[state.grade] || GRADES.sunset;
  const rects = panelRects(state.layout, w, h);
  const count = panelCount(state.layout);

  // White frame and gutters first.
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < count; i++) {
    const rect = rects[i];
    const panel = (state.panels && state.panels[i]) || {};
    if (panel.img) {
      drawPhoto(ctx, panel.img, rect, panel, grade.desaturate);
      washPanel(ctx, rect, grade);
    } else {
      // No photo yet: a dark placeholder so the panel reads as a panel.
      const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
      grad.addColorStop(0, '#23232e');
      grad.addColorStop(1, '#101016');
      ctx.fillStyle = grad;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      washPanel(ctx, rect, grade);
    }
  }
  vignette(ctx, w, h, grade.vignette);
  drawLettering(ctx, state, w, h, grade);

  if (opts.showSelection && opts.selected != null && opts.selected >= 0 && opts.selected < count) {
    const rect = rects[opts.selected];
    ctx.save();
    ctx.strokeStyle = grade.shadow;
    ctx.lineWidth = Math.max(3, Math.round(w * 0.005));
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    ctx.restore();
  }
  ctx.restore();
}
