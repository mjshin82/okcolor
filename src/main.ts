import { rgbToOklch, oklchToRgb, rgbToHex, rgbKey } from './color';
import type { RGB, OKLCH } from './color';
import { loadImage, loadImageFromUrl, rebuildImageData } from './image';
import type { ExtractResult } from './image';
import { PRESET_PALETTES, loadPalFile, parseJascPal, mapPaletteByHue } from './palette';
import type { MappingMode } from './palette';
import { generateRandomPalette } from './random-palette';
import type { ValueMode, HueMode, SaturationMode, PaletteSize } from './random-palette';
import { t, getLocale, setLocale, getLocaleNames, getHtmlLang } from './i18n';
import type { Locale } from './i18n';
import { inject } from '@vercel/analytics';
import './style.css';

inject();

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
  randomValueMode: ValueMode;
  randomHueMode: HueMode;
  randomSatMode: SaturationMode;
  randomSize: PaletteSize;
  mappingMode: MappingMode;
} = {
  entries: [],
  extractResult: null,
  chromaOffset: 0,
  hueOffset: 0,
  paletteMode: 'original',
  selectedPreset: 2,
  paletteColors: null,
  paletteMapping: null,
  randomValueMode: 'valueScale',
  randomHueMode: 'complementary',
  randomSatMode: 'satScale',
  randomSize: 16,
  mappingMode: 'nearest' as MappingMode,
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
      <div class="sample-picker">
        <span class="sample-picker-label">${t('sampleImages')}</span>
        <div class="sample-thumbs">
          <img src="/sample1.png" class="sample-thumb active" data-sample="1" alt="Sample 1" />
          <img src="/sample2.png" class="sample-thumb" data-sample="2" alt="Sample 2" />
          <img src="/sample3.png" class="sample-thumb" data-sample="3" alt="Sample 3" />
          <img src="/sample4.png" class="sample-thumb" data-sample="4" alt="Sample 4" />
        </div>
      </div>
      <label class="upload-label" for="file-input">
        <span class="upload-icon">🖼️</span>
        <span>${t('selectImage')}</span>
      </label>
      <input type="file" id="file-input" accept="image/*" />
      <div id="error-msg" class="error"></div>
      <div id="sample-info" class="sample-info">${t('sampleInfo')} <a href="https://store.steampowered.com/app/1147860/UFO_50/" target="_blank" rel="noopener noreferrer"><strong>UFO 50</strong></a></div>
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
          ${t('generateTab')}
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
          <div class="random-controls-vertical">
            <div class="random-row">
              <span class="random-label">${t('valueMode')}</span>
              <div class="toggle-group" data-random="valueMode">
                <button class="toggle-btn${state.randomValueMode === 'highContrast' ? ' active' : ''}" data-value="highContrast">${t('highContrast')}</button>
                <button class="toggle-btn${state.randomValueMode === 'lowContrast' ? ' active' : ''}" data-value="lowContrast">${t('lowContrast')}</button>
                <button class="toggle-btn${state.randomValueMode === 'valueScale' ? ' active' : ''}" data-value="valueScale">${t('valueScale')}</button>
                <button class="toggle-btn${state.randomValueMode === 'rule603010' ? ' active' : ''}" data-value="rule603010">${t('rule603010')}</button>
              </div>
            </div>
            <div class="random-row">
              <span class="random-label">${t('harmony')}</span>
              <div class="toggle-group" data-random="hueMode">
                <button class="toggle-btn${state.randomHueMode === 'complementary' ? ' active' : ''}" data-value="complementary">${t('hueComplementary')}</button>
                <button class="toggle-btn${state.randomHueMode === 'analogous' ? ' active' : ''}" data-value="analogous">${t('hueAnalogous')}</button>
                <button class="toggle-btn${state.randomHueMode === 'triadic' ? ' active' : ''}" data-value="triadic">${t('hueTriadic')}</button>
                <button class="toggle-btn${state.randomHueMode === 'splitComplementary' ? ' active' : ''}" data-value="splitComplementary">${t('hueSplitComp')}</button>
                <button class="toggle-btn${state.randomHueMode === 'tetradic' ? ' active' : ''}" data-value="tetradic">${t('hueTetradic')}</button>
                <button class="toggle-btn${state.randomHueMode === 'monochromatic' ? ' active' : ''}" data-value="monochromatic">${t('hueMonochromatic')}</button>
              </div>
            </div>
            <div class="random-row">
              <span class="random-label">${t('saturation')}</span>
              <div class="toggle-group" data-random="satMode">
                <button class="toggle-btn${state.randomSatMode === 'vividMuted' ? ' active' : ''}" data-value="vividMuted">${t('satVividMuted')}</button>
                <button class="toggle-btn${state.randomSatMode === 'satScale' ? ' active' : ''}" data-value="satScale">${t('satScale')}</button>
                <button class="toggle-btn${state.randomSatMode === 'uniform' ? ' active' : ''}" data-value="uniform">${t('satUniform')}</button>
                <button class="toggle-btn${state.randomSatMode === 'allLow' ? ' active' : ''}" data-value="allLow">${t('satAllLow')}</button>
                <button class="toggle-btn${state.randomSatMode === 'allHigh' ? ' active' : ''}" data-value="allHigh">${t('satAllHigh')}</button>
                <button class="toggle-btn${state.randomSatMode === 'chaotic' ? ' active' : ''}" data-value="chaotic">${t('satChaotic')}</button>
              </div>
            </div>
            <div class="random-row">
              <span class="random-label">${t('colors')}</span>
              <div class="toggle-group" data-random="size">
                <button class="toggle-btn${state.randomSize === 8 ? ' active' : ''}" data-value="8">8</button>
                <button class="toggle-btn${state.randomSize === 16 ? ' active' : ''}" data-value="16">16</button>
                <button class="toggle-btn${state.randomSize === 32 ? ' active' : ''}" data-value="32">32</button>
                <button class="toggle-btn${state.randomSize === 64 ? ' active' : ''}" data-value="64">64</button>
              </div>
            </div>
            <button id="random-generate-btn" class="generate-btn-large">${t('generate')}</button>
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
      <div id="mapping-mode-group" class="mapping-mode-group" style="display:${state.paletteMode !== 'original' ? '' : 'none'}">
        <span class="random-label">${t('mappingMode')}</span>
        <div class="toggle-group">
          <button class="toggle-btn${state.mappingMode === 'nearest' ? ' active' : ''}" data-mapping="nearest">${t('mappingNearest')}</button>
          <button class="toggle-btn${state.mappingMode === 'diverse' ? ' active' : ''}" data-mapping="diverse">${t('mappingDiverse')}</button>
          <button class="toggle-btn${state.mappingMode === 'hueOnly' ? ' active' : ''}" data-mapping="hueOnly">${t('mappingHueOnly')}</button>
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
          <div class="inline-palette">
            <div class="inline-palette-header">
              <span class="inline-palette-count"><span id="orig-color-count">0</span> ${t('colorsCount')}</span>
              <button id="download-orig-pal-btn" class="download-btn">${t('downloadPal')}</button>
            </div>
            <div id="orig-palette-swatches" class="inline-palette-swatches"></div>
          </div>
        </div>
        <div class="preview-box">
          <h3>${t('modified')}</h3>
          <canvas id="modified-canvas"></canvas>
          <div class="inline-palette">
            <div class="inline-palette-header">
              <span class="inline-palette-count"><span id="mod-color-count">0</span> ${t('colorsCount')}</span>
              <button id="download-mod-pal-btn" class="download-btn">${t('downloadPal')}</button>
            </div>
            <div id="mod-palette-swatches" class="inline-palette-swatches"></div>
          </div>
        </div>
      </div>
      <div class="palette-area">
        <div class="palette-area-header">
          <h3>${t('colorMapping')}</h3>
          <button id="toggle-mapping-btn" class="toggle-mapping-btn">${t('showMapping')}</button>
        </div>
        <div id="palette" class="palette" style="display:none"></div>
      </div>
    </section>

    <footer class="footer">
      <p>${t('footerCredit')} <a href="https://x.com/SyntaxFossil" target="_blank" rel="noopener noreferrer">@SyntaxFossil</a> / <a href="https://x.com/TeamConcode" target="_blank" rel="noopener noreferrer">@TeamConcode</a></p>
    </footer>

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
    document.getElementById('controls')!.style.display = '';
    document.getElementById('content')!.style.display = '';
    document.getElementById('palette-selector')!.style.display = '';
    if (state.paletteColors) {
      renderPalettePreview(state.paletteColors);
    } else if (state.paletteMode === 'original') {
      renderPalettePreview(state.entries.map((e) => e.original));
    }
    showContent();
  }
}

function bindEvents() {
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  fileInput.addEventListener('change', handleFileChange);

  // Sample image thumbs
  document.querySelectorAll<HTMLImageElement>('.sample-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const num = thumb.dataset.sample;
      document.querySelectorAll('.sample-thumb').forEach((t) => t.classList.remove('active'));
      thumb.classList.add('active');
      loadSampleImage(`/sample${num}.png`);
    });
  });

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

  // Download .pal buttons
  const downloadOrigBtn = document.getElementById('download-orig-pal-btn');
  if (downloadOrigBtn) {
    downloadOrigBtn.addEventListener('click', downloadOriginalPal);
  }
  const downloadModBtn = document.getElementById('download-mod-pal-btn');
  if (downloadModBtn) {
    downloadModBtn.addEventListener('click', downloadModifiedPal);
  }

  // Toggle mapping visibility
  const toggleMappingBtn = document.getElementById('toggle-mapping-btn');
  const paletteDiv = document.getElementById('palette');
  if (toggleMappingBtn && paletteDiv) {
    toggleMappingBtn.addEventListener('click', () => {
      const hidden = paletteDiv.style.display === 'none';
      paletteDiv.style.display = hidden ? '' : 'none';
      toggleMappingBtn.textContent = hidden ? t('hideMapping') : t('showMapping');
    });
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
        if (key === 'valueMode') state.randomValueMode = btn.dataset.value as ValueMode;
        else if (key === 'hueMode') state.randomHueMode = btn.dataset.value as HueMode;
        else if (key === 'satMode') state.randomSatMode = btn.dataset.value as SaturationMode;
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

  // Mapping mode toggle
  document.querySelectorAll<HTMLButtonElement>('[data-mapping]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mappingMode = btn.dataset.mapping as MappingMode;
      document.querySelectorAll('[data-mapping]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      recomputePaletteMapping();
      updateDisplay();
    });
  });

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
  const mappingGroup = document.getElementById('mapping-mode-group');
  if (mappingGroup) mappingGroup.style.display = state.paletteMode !== 'original' ? '' : 'none';

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
    renderPalettePreview(state.entries.map((e) => e.original));
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
    valueMode: state.randomValueMode,
    hueMode: state.randomHueMode,
    saturationMode: state.randomSatMode,
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
  state.paletteMapping = mapPaletteByHue(origColors, state.paletteColors, state.mappingMode);
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

  // Render inline palettes under each image
  const origSwatches = document.getElementById('orig-palette-swatches');
  const modSwatches = document.getElementById('mod-palette-swatches');
  if (origSwatches) {
    const uniqueOrig = getUniqueColors(state.entries.map((e) => e.original));
    origSwatches.innerHTML = uniqueOrig.map((c) => {
      const hex = rgbToHex(c);
      return `<div class="inline-swatch" style="background:${hex}" title="${hex}"></div>`;
    }).join('');
    const origCount = document.getElementById('orig-color-count');
    if (origCount) origCount.textContent = String(uniqueOrig.length);
  }
  if (modSwatches) {
    const modColors = state.entries.map((e) => computeModifiedColor(e));
    const uniqueMod = getUniqueColors(modColors);
    modSwatches.innerHTML = uniqueMod.map((c) => {
      const hex = rgbToHex(c);
      return `<div class="inline-swatch" style="background:${hex}" title="${hex}"></div>`;
    }).join('');
    const modCount = document.getElementById('mod-color-count');
    if (modCount) modCount.textContent = String(uniqueMod.length);
  }

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

function getUniqueColors(colors: RGB[]): RGB[] {
  const seen = new Set<string>();
  const result: RGB[] = [];
  for (const c of colors) {
    const key = `${c.r},${c.g},${c.b}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }
  return result;
}

function downloadPalFile(colors: RGB[], filename: string) {
  const lines = [
    'JASC-PAL',
    '0100',
    String(colors.length),
    ...colors.map((c) => `${c.r} ${c.g} ${c.b}`),
  ];
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadOriginalPal() {
  if (state.entries.length === 0) return;
  const colors = getUniqueColors(state.entries.map((e) => e.original));
  downloadPalFile(colors, 'original-palette.pal');
}

function downloadModifiedPal() {
  // Download the full selected palette with C/H offsets applied
  const basePalette = state.paletteColors
    ? state.paletteColors
    : state.entries.map((e) => e.original);

  const colors = basePalette.map((rgb) => {
    const oklch = rgbToOklch(rgb);
    const modified: OKLCH = {
      l: oklch.l,
      c: Math.max(0, oklch.c + state.chromaOffset),
      h: (oklch.h + state.hueOffset + 360) % 360,
    };
    return oklchToRgb(modified);
  });

  downloadPalFile(colors, 'modified-palette.pal');
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

async function loadSampleImage(url: string) {
  try {
    const result = await loadImageFromUrl(url);
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
  } catch {
    // sample not available
  }
}

render();
loadSampleImage('/sample1.png').then(() => {
  // Show original palette on initial load
  renderPalettePreview(state.entries.map((e) => e.original));
});
