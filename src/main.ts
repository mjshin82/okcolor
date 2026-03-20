import { rgbToOklch, oklchToRgb, rgbToHex, rgbKey } from './color';
import type { RGB, OKLCH } from './color';
import { loadImage, loadImageFromUrl, rebuildImageData } from './image';
import type { ExtractResult } from './image';
import { PRESET_PALETTES, loadPalFile, parseJascPal, mapPaletteByHue } from './palette';
import { generateRandomPalette } from './random-palette';
import type { Brightness, HueMode, PaletteSize } from './random-palette';
import { t, getLocale, setLocale, getLocaleNames, getHtmlLang } from './i18n';
import type { Locale } from './i18n';
import './style.css';

interface ColorEntry {
  original: RGB;
  oklch: OKLCH;
}

type PaletteMode = 'original' | 'preset' | 'custom' | 'random';

let state: {
  entries: ColorEntry[];
  extractResult: ExtractResult | null;
  chromaOffset: number;
  hueOffset: number;
  paletteMode: PaletteMode;
  selectedPreset: number;
  paletteColors: RGB[] | null;
  paletteMapping: Map<string, RGB> | null;
  randomBrightness: Brightness;
  randomHueMode: HueMode;
  randomSize: PaletteSize;
} = {
  entries: [],
  extractResult: null,
  chromaOffset: 0,
  hueOffset: 0,
  paletteMode: 'original',
  selectedPreset: 0,
  paletteColors: null,
  paletteMapping: null,
  randomBrightness: 'normal',
  randomHueMode: 'diverse',
  randomSize: 16,
};

const app = document.getElementById('app')!;

function renderLocaleOptions(): string {
  const names = getLocaleNames();
  const current = getLocale();
  return (Object.entries(names) as [Locale, string][])
    .map(([code, name]) => `<option value="${code}"${code === current ? ' selected' : ''}>${name}</option>`)
    .join('');
}

function renderPresetOptions(): string {
  return PRESET_PALETTES.map(
    (p, i) => `<option value="${i}"${i === state.selectedPreset ? ' selected' : ''}>${p.name}</option>`,
  ).join('');
}

function render() {
  document.documentElement.lang = getHtmlLang();

  app.innerHTML = `
    <header class="header">
      <div class="header-top">
        <h1>${t('title')}</h1>
        <select id="lang-select" class="lang-select">${renderLocaleOptions()}</select>
      </div>
      <p>${t('subtitle')}</p>
    </header>

    <section class="upload-section">
      <label class="upload-label" for="file-input">
        <span class="upload-icon">🖼️</span>
        <span>${t('selectImage')}</span>
      </label>
      <input type="file" id="file-input" accept="image/*" />
      <div id="error-msg" class="error"></div>
      <div id="sample-info" class="sample-info" style="display:none">${t('sampleInfo')} <strong>UFO 50</strong></div>
    </section>

    <section class="palette-selector-section" id="palette-selector" style="display:none">
      <h3>${t('palette')}</h3>
      <div class="palette-options">
        <label class="palette-radio${state.paletteMode === 'original' ? ' active' : ''}">
          <input type="radio" name="palette-mode" value="original"${state.paletteMode === 'original' ? ' checked' : ''} />
          ${t('original')}
        </label>
        <label class="palette-radio${state.paletteMode === 'preset' ? ' active' : ''}">
          <input type="radio" name="palette-mode" value="preset"${state.paletteMode === 'preset' ? ' checked' : ''} />
          ${t('preset')}
        </label>
        <label class="palette-radio${state.paletteMode === 'random' ? ' active' : ''}">
          <input type="radio" name="palette-mode" value="random"${state.paletteMode === 'random' ? ' checked' : ''} />
          ${t('random')}
        </label>
        <label class="palette-radio${state.paletteMode === 'custom' ? ' active' : ''}">
          <input type="radio" name="palette-mode" value="custom"${state.paletteMode === 'custom' ? ' checked' : ''} />
          ${t('uploadPal')}
        </label>
      </div>
      <div class="palette-sub-options">
        <div id="preset-options" style="display:${state.paletteMode === 'preset' ? '' : 'none'}">
          <select id="preset-select">${renderPresetOptions()}</select>
          <a id="preset-link" class="preset-link" href="${PRESET_PALETTES[state.selectedPreset].url}" target="_blank" rel="noopener noreferrer">${PRESET_PALETTES[state.selectedPreset].name} ${t('onLospec')} ↗</a>
        </div>
        <div id="random-options" style="display:${state.paletteMode === 'random' ? '' : 'none'}">
          <div class="random-controls">
            <div class="random-group">
              <span class="random-label">${t('brightness')}</span>
              <div class="toggle-group" data-random="brightness">
                <button class="toggle-btn${state.randomBrightness === 'bright' ? ' active' : ''}" data-value="bright">${t('bright')}</button>
                <button class="toggle-btn${state.randomBrightness === 'normal' ? ' active' : ''}" data-value="normal">${t('normal')}</button>
                <button class="toggle-btn${state.randomBrightness === 'muted' ? ' active' : ''}" data-value="muted">${t('muted')}</button>
              </div>
            </div>
            <div class="random-group">
              <span class="random-label">${t('hue')}</span>
              <div class="toggle-group" data-random="hueMode">
                <button class="toggle-btn${state.randomHueMode === 'diverse' ? ' active' : ''}" data-value="diverse">${t('diverse')}</button>
                <button class="toggle-btn${state.randomHueMode === 'complementary' ? ' active' : ''}" data-value="complementary">${t('complementary')}</button>
                <button class="toggle-btn${state.randomHueMode === 'monotone' ? ' active' : ''}" data-value="monotone">${t('monotone')}</button>
              </div>
            </div>
            <div class="random-group">
              <span class="random-label">${t('colors')}</span>
              <div class="toggle-group" data-random="size">
                <button class="toggle-btn${state.randomSize === 8 ? ' active' : ''}" data-value="8">8</button>
                <button class="toggle-btn${state.randomSize === 16 ? ' active' : ''}" data-value="16">16</button>
                <button class="toggle-btn${state.randomSize === 32 ? ' active' : ''}" data-value="32">32</button>
              </div>
            </div>
            <button id="random-generate-btn" class="generate-btn">${t('generate')}</button>
          </div>
        </div>
        <div id="custom-options" style="display:${state.paletteMode === 'custom' ? '' : 'none'}">
          <label class="upload-label small" for="pal-file-input">
            <span>${t('selectPalFile')}</span>
          </label>
          <input type="file" id="pal-file-input" accept=".pal" />
          <span id="custom-pal-name" class="pal-name"></span>
        </div>
      </div>
      <div id="palette-preview" class="palette-preview"></div>
    </section>

    <section class="controls-section" id="controls" style="display:none">
      <div class="slider-group">
        <label>
          ${t('chromaOffset')}: <span id="chroma-value">${state.chromaOffset.toFixed(3)}</span>
        </label>
        <input type="range" id="chroma-slider" min="-0.4" max="0.4" step="0.001" value="${state.chromaOffset}" />
      </div>
      <div class="slider-group">
        <label>
          ${t('hueOffset')}: <span id="hue-value">${state.hueOffset.toFixed(1)}°</span>
        </label>
        <input type="range" id="hue-slider" min="-180" max="180" step="0.5" value="${state.hueOffset}" />
      </div>
      <button id="reset-btn" class="reset-btn">${t('reset')}</button>
    </section>

    <section class="content-section" id="content" style="display:none">
      <div class="preview-area">
        <div class="preview-box">
          <h3>${t('original')}</h3>
          <canvas id="original-canvas"></canvas>
        </div>
        <div class="preview-box">
          <h3>${t('modified')}</h3>
          <canvas id="modified-canvas"></canvas>
        </div>
      </div>
      <div class="palette-area">
        <div class="palette-area-header">
          <h3>${t('colorPalette')} (<span id="color-count">0</span> ${t('colorsCount')})</h3>
          <button id="download-pal-btn" class="download-btn">${t('downloadPal')}</button>
        </div>
        <div id="palette" class="palette"></div>
      </div>
    </section>

    <div id="lightbox" class="lightbox" style="display:none">
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-content">
        <canvas id="lightbox-canvas"></canvas>
        <button class="lightbox-close">&times;</button>
      </div>
    </div>
  `;

  bindEvents();

  if (state.extractResult) {
    showContent();
  }
}

function bindEvents() {
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  fileInput.addEventListener('change', handleFileChange);

  // Language selector
  const langSelect = document.getElementById('lang-select') as HTMLSelectElement;
  if (langSelect) {
    langSelect.addEventListener('change', () => {
      setLocale(langSelect.value as Locale);
      render();
      // Re-render palette preview if active
      if (state.paletteColors) renderPalettePreview(state.paletteColors);
    });
  }

  const chromaSlider = document.getElementById('chroma-slider') as HTMLInputElement;
  const hueSlider = document.getElementById('hue-slider') as HTMLInputElement;
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;

  if (chromaSlider) {
    chromaSlider.addEventListener('input', () => {
      state.chromaOffset = parseFloat(chromaSlider.value);
      updateDisplay();
    });
  }

  if (hueSlider) {
    hueSlider.addEventListener('input', () => {
      state.hueOffset = parseFloat(hueSlider.value);
      updateDisplay();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.chromaOffset = 0;
      state.hueOffset = 0;
      const cs = document.getElementById('chroma-slider') as HTMLInputElement;
      const hs = document.getElementById('hue-slider') as HTMLInputElement;
      if (cs) cs.value = '0';
      if (hs) hs.value = '0';
      updateDisplay();
    });
  }

  // Download .pal
  const downloadBtn = document.getElementById('download-pal-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadModifiedPal);
  }

  // Palette mode radios
  const radios = document.querySelectorAll<HTMLInputElement>('input[name="palette-mode"]');
  radios.forEach((radio) => {
    radio.addEventListener('change', () => {
      state.paletteMode = radio.value as PaletteMode;
      updatePaletteModeUI();
      applyPaletteSelection();
    });
  });

  // Preset select
  const presetSelect = document.getElementById('preset-select') as HTMLSelectElement;
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      state.selectedPreset = parseInt(presetSelect.value, 10);
      updatePresetLink();
      applyPaletteSelection();
    });
  }

  // Random palette controls
  document.querySelectorAll<HTMLDivElement>('.toggle-group').forEach((group) => {
    const key = group.dataset.random;
    group.querySelectorAll<HTMLButtonElement>('.toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (key === 'brightness') state.randomBrightness = btn.dataset.value as Brightness;
        else if (key === 'hueMode') state.randomHueMode = btn.dataset.value as HueMode;
        else if (key === 'size') state.randomSize = parseInt(btn.dataset.value!, 10) as PaletteSize;
        group.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  });

  const generateBtn = document.getElementById('random-generate-btn');
  if (generateBtn) {
    generateBtn.addEventListener('click', applyRandomPalette);
  }

  // Custom .pal upload
  const palInput = document.getElementById('pal-file-input') as HTMLInputElement;
  if (palInput) {
    palInput.addEventListener('change', handlePalFileChange);
  }

  // Lightbox
  const lightbox = document.getElementById('lightbox')!;
  const lightboxBackdrop = lightbox.querySelector('.lightbox-backdrop')!;
  const lightboxClose = lightbox.querySelector('.lightbox-close')!;

  const closeLightbox = () => { lightbox.style.display = 'none'; };
  lightboxBackdrop.addEventListener('click', closeLightbox);
  lightboxClose.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.style.display !== 'none') closeLightbox();
  });
}

function updatePaletteModeUI() {
  const presetOpts = document.getElementById('preset-options');
  const randomOpts = document.getElementById('random-options');
  const customOpts = document.getElementById('custom-options');
  if (presetOpts) presetOpts.style.display = state.paletteMode === 'preset' ? '' : 'none';
  if (randomOpts) randomOpts.style.display = state.paletteMode === 'random' ? '' : 'none';
  if (customOpts) customOpts.style.display = state.paletteMode === 'custom' ? '' : 'none';

  document.querySelectorAll<HTMLLabelElement>('.palette-radio').forEach((label) => {
    const input = label.querySelector('input') as HTMLInputElement;
    label.classList.toggle('active', input.checked);
  });
}

function updatePresetLink() {
  const link = document.getElementById('preset-link') as HTMLAnchorElement;
  if (!link) return;
  const preset = PRESET_PALETTES[state.selectedPreset];
  link.href = preset.url;
  link.textContent = `${preset.name} ${t('onLospec')} ↗`;
}

async function applyPaletteSelection() {
  if (state.paletteMode === 'original') {
    state.paletteColors = null;
    state.paletteMapping = null;
    renderPalettePreview(null);
    updateDisplay();
    return;
  }

  if (state.paletteMode === 'preset') {
    const preset = PRESET_PALETTES[state.selectedPreset];
    try {
      const colors = await loadPalFile(preset.file);
      state.paletteColors = colors;
      recomputePaletteMapping();
      renderPalettePreview(colors);
      updateDisplay();
    } catch {
      state.paletteColors = null;
      state.paletteMapping = null;
      updateDisplay();
    }
  }

  if (state.paletteMode === 'random') {
    applyRandomPalette();
  }
  // custom mode is handled by handlePalFileChange
}

function applyRandomPalette() {
  const colors = generateRandomPalette({
    brightness: state.randomBrightness,
    hueMode: state.randomHueMode,
    size: state.randomSize,
  });
  state.paletteColors = colors;
  recomputePaletteMapping();
  renderPalettePreview(colors);
  updateDisplay();
}

async function handlePalFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const nameEl = document.getElementById('custom-pal-name');
  if (nameEl) nameEl.textContent = file.name;

  const text = await file.text();
  const colors = parseJascPal(text);
  state.paletteColors = colors;
  recomputePaletteMapping();
  renderPalettePreview(colors);
  updateDisplay();
}

function recomputePaletteMapping() {
  if (!state.paletteColors || state.entries.length === 0) {
    state.paletteMapping = null;
    return;
  }
  const origColors = state.entries.map((e) => e.original);
  state.paletteMapping = mapPaletteByHue(origColors, state.paletteColors);
}

function renderPalettePreview(colors: RGB[] | null) {
  const container = document.getElementById('palette-preview');
  if (!container) return;
  if (!colors) {
    container.innerHTML = '';
    return;
  }
  const swatches = colors
    .map((c) => {
      const hex = rgbToHex(c);
      return `<div class="palette-preview-swatch" style="background:${hex}" title="${hex}"></div>`;
    })
    .join('');
  container.innerHTML = swatches;
}

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const errorEl = document.getElementById('error-msg')!;
  errorEl.textContent = '';
  const sampleInfo = document.getElementById('sample-info');
  if (sampleInfo) sampleInfo.style.display = 'none';

  try {
    const result = await loadImage(file);
    state.extractResult = result;
    state.entries = result.colors.map((rgb) => ({
      original: rgb,
      oklch: rgbToOklch(rgb),
    }));
    state.chromaOffset = 0;
    state.hueOffset = 0;

    document.getElementById('controls')!.style.display = '';
    document.getElementById('content')!.style.display = '';
    document.getElementById('palette-selector')!.style.display = '';

    const cs = document.getElementById('chroma-slider') as HTMLInputElement;
    const hs = document.getElementById('hue-slider') as HTMLInputElement;
    if (cs) cs.value = '0';
    if (hs) hs.value = '0';

    recomputePaletteMapping();
    showContent();
  } catch (err) {
    errorEl.textContent = (err as Error).message;
  }
}

function showContent() {
  const result = state.extractResult;
  if (!result) return;

  drawOriginalCanvas(result);
  updateDisplay();
}

function drawOriginalCanvas(result: ExtractResult) {
  const canvas = document.getElementById('original-canvas') as HTMLCanvasElement;
  if (!canvas) return;
  canvas.width = result.width;
  canvas.height = result.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(result.imageData, 0, 0);
  canvas.style.cursor = 'pointer';
  canvas.onclick = () => openLightbox(canvas);
}

function computeModifiedColor(entry: ColorEntry): RGB {
  let baseOklch: OKLCH;
  if (state.paletteMapping) {
    const key = `${entry.original.r},${entry.original.g},${entry.original.b}`;
    const mapped = state.paletteMapping.get(key);
    if (mapped) {
      baseOklch = rgbToOklch(mapped);
    } else {
      baseOklch = { ...entry.oklch };
    }
  } else {
    baseOklch = { ...entry.oklch };
  }

  const modified: OKLCH = {
    l: baseOklch.l,
    c: Math.max(0, baseOklch.c + state.chromaOffset),
    h: (baseOklch.h + state.hueOffset + 360) % 360,
  };
  return oklchToRgb(modified);
}

function updateDisplay() {
  const chromaValueEl = document.getElementById('chroma-value');
  const hueValueEl = document.getElementById('hue-value');
  if (chromaValueEl) chromaValueEl.textContent = state.chromaOffset.toFixed(3);
  if (hueValueEl) hueValueEl.textContent = `${state.hueOffset.toFixed(1)}°`;

  const colorMapping = new Map<string, RGB>();
  const paletteItems: string[] = [];

  for (const entry of state.entries) {
    const modified = computeModifiedColor(entry);
    colorMapping.set(rgbKey(entry.original), modified);

    const origHex = rgbToHex(entry.original);
    const modHex = rgbToHex(modified);
    const modOklch = rgbToOklch(modified);

    paletteItems.push(`
      <div class="palette-item">
        <div class="color-swatch" style="background:${origHex}" title="${t('original')}: ${origHex}"></div>
        <div class="color-arrow">→</div>
        <div class="color-swatch" style="background:${modHex}" title="${t('modified')}: ${modHex}"></div>
        <div class="color-info">
          <span class="hex">${modHex}</span>
          <span class="oklch-info">L:${modOklch.l.toFixed(2)} C:${modOklch.c.toFixed(3)} H:${modOklch.h.toFixed(0)}°</span>
        </div>
      </div>
    `);
  }

  const paletteEl = document.getElementById('palette');
  if (paletteEl) paletteEl.innerHTML = paletteItems.join('');

  const countEl = document.getElementById('color-count');
  if (countEl) countEl.textContent = String(state.entries.length);

  if (state.extractResult) {
    const modCanvas = document.getElementById('modified-canvas') as HTMLCanvasElement;
    if (modCanvas) {
      modCanvas.width = state.extractResult.width;
      modCanvas.height = state.extractResult.height;
      const ctx = modCanvas.getContext('2d')!;
      const newImageData = rebuildImageData(state.extractResult.imageData, colorMapping);
      ctx.putImageData(newImageData, 0, 0);
      modCanvas.style.cursor = 'pointer';
      modCanvas.onclick = () => openLightbox(modCanvas);
    }
  }
}

function downloadModifiedPal() {
  if (state.entries.length === 0) return;

  const modifiedColors = state.entries.map((entry) => computeModifiedColor(entry));
  const lines = [
    'JASC-PAL',
    '0100',
    String(modifiedColors.length),
    ...modifiedColors.map((c) => `${c.r} ${c.g} ${c.b}`),
  ];
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modified-palette.pal';
  a.click();
  URL.revokeObjectURL(url);
}

function openLightbox(sourceCanvas: HTMLCanvasElement) {
  const lightbox = document.getElementById('lightbox')!;
  const lbCanvas = document.getElementById('lightbox-canvas') as HTMLCanvasElement;
  lbCanvas.width = sourceCanvas.width;
  lbCanvas.height = sourceCanvas.height;
  const ctx = lbCanvas.getContext('2d')!;
  ctx.drawImage(sourceCanvas, 0, 0);
  lightbox.style.display = '';
}

async function loadDefaultImage() {
  try {
    const result = await loadImageFromUrl('/sample.png');
    state.extractResult = result;
    state.entries = result.colors.map((rgb) => ({
      original: rgb,
      oklch: rgbToOklch(rgb),
    }));

    document.getElementById('controls')!.style.display = '';
    document.getElementById('content')!.style.display = '';
    document.getElementById('palette-selector')!.style.display = '';
    document.getElementById('sample-info')!.style.display = '';
    showContent();
  } catch {
    // sample.png not available, just wait for user upload
  }
}

render();
loadDefaultImage();
