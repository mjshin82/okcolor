import { rgbToOklch, oklchToRgb, rgbToHex, rgbKey } from './color';
import type { RGB, OKLCH } from './color';
import { loadImage, loadImageFromUrl, rebuildImageData } from './image';
import type { ExtractResult } from './image';
import './style.css';

interface ColorEntry {
  original: RGB;
  oklch: OKLCH;
}

let state: {
  entries: ColorEntry[];
  extractResult: ExtractResult | null;
  chromaOffset: number;
  hueOffset: number;
} = {
  entries: [],
  extractResult: null,
  chromaOffset: 0,
  hueOffset: 0,
};

const app = document.getElementById('app')!;

function render() {
  app.innerHTML = `
    <header class="header">
      <h1>OKLCH Color Tool</h1>
      <p>이미지의 색상을 OKLCH 컬러 스페이스에서 조절합니다 (256색 이하)</p>
    </header>

    <section class="upload-section">
      <label class="upload-label" for="file-input">
        <span class="upload-icon">🖼️</span>
        <span>이미지 파일 선택 (PNG, GIF 등 256색 이하)</span>
      </label>
      <input type="file" id="file-input" accept="image/*" />
      <div id="error-msg" class="error"></div>
    </section>

    <section class="controls-section" id="controls" style="display:none">
      <div class="slider-group">
        <label>
          Chroma 오프셋: <span id="chroma-value">${state.chromaOffset.toFixed(3)}</span>
        </label>
        <input type="range" id="chroma-slider" min="-0.4" max="0.4" step="0.001" value="${state.chromaOffset}" />
      </div>
      <div class="slider-group">
        <label>
          Hue 오프셋: <span id="hue-value">${state.hueOffset.toFixed(1)}°</span>
        </label>
        <input type="range" id="hue-slider" min="-180" max="180" step="0.5" value="${state.hueOffset}" />
      </div>
      <button id="reset-btn" class="reset-btn">초기화</button>
    </section>

    <section class="content-section" id="content" style="display:none">
      <div class="preview-area">
        <div class="preview-box">
          <h3>원본</h3>
          <canvas id="original-canvas"></canvas>
        </div>
        <div class="preview-box">
          <h3>변경됨</h3>
          <canvas id="modified-canvas"></canvas>
        </div>
      </div>
      <div class="palette-area">
        <h3>컬러 팔레트 (<span id="color-count">0</span>색)</h3>
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

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const errorEl = document.getElementById('error-msg')!;
  errorEl.textContent = '';

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

    const cs = document.getElementById('chroma-slider') as HTMLInputElement;
    const hs = document.getElementById('hue-slider') as HTMLInputElement;
    if (cs) cs.value = '0';
    if (hs) hs.value = '0';

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
  const modified: OKLCH = {
    l: entry.oklch.l,
    c: Math.max(0, entry.oklch.c + state.chromaOffset),
    h: (entry.oklch.h + state.hueOffset + 360) % 360,
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

    paletteItems.push(`
      <div class="palette-item">
        <div class="color-swatch" style="background:${origHex}" title="원본: ${origHex}"></div>
        <div class="color-arrow">→</div>
        <div class="color-swatch" style="background:${modHex}" title="변경: ${modHex}"></div>
        <div class="color-info">
          <span class="hex">${modHex}</span>
          <span class="oklch-info">L:${entry.oklch.l.toFixed(2)} C:${(Math.max(0, entry.oklch.c + state.chromaOffset)).toFixed(3)} H:${((entry.oklch.h + state.hueOffset + 360) % 360).toFixed(0)}°</span>
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
    showContent();
  } catch {
    // sample.png not available, just wait for user upload
  }
}

render();
loadDefaultImage();
