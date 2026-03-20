import type { RGB } from './color';
import { rgbKey } from './color';
import { t } from './i18n';

const MAX_COLORS = 256;

export interface ExtractResult {
  colors: RGB[];
  imageData: ImageData;
  width: number;
  height: number;
}

export function extractColors(imageData: ImageData): RGB[] {
  const colorMap = new Map<string, RGB>();
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const rgb: RGB = { r: data[i], g: data[i + 1], b: data[i + 2] };
    const key = rgbKey(rgb);
    if (!colorMap.has(key)) {
      colorMap.set(key, rgb);
    }
  }

  return Array.from(colorMap.values());
}

export function loadImage(file: File): Promise<ExtractResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const colors = extractColors(imageData);

      if (colors.length > MAX_COLORS) {
        reject(new Error(t('errorTooManyColors').replace('{count}', String(colors.length)).replace('{max}', String(MAX_COLORS))));
        return;
      }

      resolve({
        colors,
        imageData,
        width: img.width,
        height: img.height,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(t('errorLoadFailed')));
    };

    img.src = url;
  });
}

export function loadImageFromUrl(url: string): Promise<ExtractResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const colors = extractColors(imageData);

      if (colors.length > MAX_COLORS) {
        reject(new Error(t('errorTooManyColors').replace('{count}', String(colors.length)).replace('{max}', String(MAX_COLORS))));
        return;
      }

      resolve({
        colors,
        imageData,
        width: img.width,
        height: img.height,
      });
    };

    img.onerror = () => {
      reject(new Error(t('errorLoadFailed')));
    };

    img.src = url;
  });
}

export function rebuildImageData(
  originalData: ImageData,
  colorMapping: Map<string, RGB>,
): ImageData {
  const newData = new ImageData(
    new Uint8ClampedArray(originalData.data),
    originalData.width,
    originalData.height,
  );
  const data = newData.data;

  for (let i = 0; i < data.length; i += 4) {
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    const mapped = colorMapping.get(key);
    if (mapped) {
      data[i] = mapped.r;
      data[i + 1] = mapped.g;
      data[i + 2] = mapped.b;
    }
  }

  return newData;
}
