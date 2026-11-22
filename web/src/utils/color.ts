import { safeHttpUrl } from './format';

// Строгие деловые Metro-акценты для фолбэка, если обложка отсутствует или заблокирована CORS
const METRO_FALLBACK_PALETTE = [
  '#0067b8',
  '#107c10',
  '#8764b8',
  '#038387',
  '#ca5010',
  '#b4009e',
  '#004e8c',
  '#498205',
];

export function getDeterministicAccentColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return METRO_FALLBACK_PALETTE[Math.abs(hash) % METRO_FALLBACK_PALETTE.length];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Безопасно извлекает основной цвет обложки через 16x16 canvas (crossOrigin='anonymous').
 * При CORS-ограничении или отсутствии изображения возвращает детерминированный Metro-цвет.
 */
export async function extractAccentColor(
  thumbnailUrl: string | null | undefined,
  fallbackSeed: string
): Promise<string> {
  const fallback = getDeterministicAccentColor(fallbackSeed);
  const safeSrc = safeHttpUrl(thumbnailUrl);
  if (!safeSrc) return fallback;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;
    const finish = (color: string) => {
      if (settled) return;
      settled = true;
      resolve(color);
    };

    const timer = setTimeout(() => finish(fallback), 3000);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(fallback);
          return;
        }
        ctx.drawImage(img, 0, 0, 16, 16);
        const { data } = ctx.getImageData(0, 0, 16, 16);

        let bestR = 0;
        let bestG = 0;
        let bestB = 0;
        let weightSum = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 180) continue;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 2;
          // Игнорируем слишком чёрные и слишком белые пиксели
          if (lum < 30 || lum > 225) continue;

          const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
          const weight = 0.25 + sat * 2;
          bestR += r * weight;
          bestG += g * weight;
          bestB += b * weight;
          weightSum += weight;
        }

        if (weightSum < 1) {
          finish(fallback);
          return;
        }

        finish(rgbToHex(bestR / weightSum, bestG / weightSum, bestB / weightSum));
      } catch {
        // Canvas tainted by CORS — используем fallback
        finish(fallback);
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      finish(fallback);
    };

    img.src = safeSrc;
  });
}
