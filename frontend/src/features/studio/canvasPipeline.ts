/**
 * Custom Cursor Studio & Library — Canvas Pipeline & Sticker Outline
 *
 * Implements non-destructive client-side image processing according to:
 * - RULES.md F04 (Photo Studio & Privacy): 2MiB limit, alpha preservation, zero blob persistence in localStorage.
 * - DESIGN.md Section 4.4 (Canvas pipeline & Sticker outline):
 *   Blob source -> Image -> optional cutout mask -> composited RGBA in working Canvas
 *   -> alpha dilation outline (thickness 0..4px) -> contain-fit raster 32/48 RGBA
 *   -> HotspotGridPicker + PNG Blob for POST /api/v1/studio/convert
 */

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MiB
export const MAX_IMAGE_PIXELS = 12_000_000; // 12 Megapixels
export const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export interface FileValidationResult {
  valid: boolean;
  error?: string | undefined;
}

/**
 * Validate image file size and MIME type before reading/decoding.
 */
export function validateImageFile(file: File): FileValidationResult {
  if (file.size > MAX_UPLOAD_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeMb} MB) exceeds the 2 MB limit. Please select a smaller image.`,
    };
  }

  const isAllowedType = ALLOWED_MIME_TYPES.some(
    (type) => file.type.toLowerCase() === type
  );

  if (!isAllowedType) {
    return {
      valid: false,
      error: `Unsupported file format (${file.type || 'unknown'}). Please choose a PNG, JPEG, or WebP image.`,
    };
  }

  return { valid: true };
}

/**
 * Parses hex color '#RRGGBB' into [r, g, b].
 */
export function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    return [
      parseInt(cleaned[0]! + cleaned[0]!, 16),
      parseInt(cleaned[1]! + cleaned[1]!, 16),
      parseInt(cleaned[2]! + cleaned[2]!, 16),
    ];
  }
  if (cleaned.length === 6) {
    return [
      parseInt(cleaned.slice(0, 2), 16),
      parseInt(cleaned.slice(2, 4), 16),
      parseInt(cleaned.slice(4, 6), 16),
    ];
  }
  return [255, 255, 255]; // default white
}

/**
 * Apply alpha dilation sticker outline to canvas ImageData.
 * Expands alpha boundary by circular radius r in [1, 4] pixels.
 * Renders outline color beneath the subject silhouette.
 */
export function applyAlphaOutline(
  imageData: ImageData,
  thickness: number,
  outlineRgb: [number, number, number] = [255, 255, 255]
): ImageData {
  if (thickness <= 0) {
    return imageData;
  }

  const { width, height, data } = imageData;
  const totalPixels = width * height;

  // 1. Copy source alpha
  const alpha = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    alpha[i] = data[i * 4 + 3] ?? 0;
  }

  // 2. Alpha dilation with circular neighborhood (dx^2 + dy^2 <= r^2)
  const dilated = new Uint8Array(totalPixels);
  const r = Math.min(4, Math.max(1, Math.round(thickness)));
  const rSq = r * r;

  for (let y = 0; y < height; y++) {
    const yOffset = y * width;
    for (let x = 0; x < width; x++) {
      let maxA = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const nYOffset = ny * width;
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > rSq) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighborAlpha = alpha[nYOffset + nx] ?? 0;
          if (neighborAlpha > maxA) {
            maxA = neighborAlpha;
            if (maxA === 255) break;
          }
        }
        if (maxA === 255) break;
      }
      dilated[yOffset + x] = maxA;
    }
  }

  // 3. Composite subject over outline
  const [outR, outG, outB] = outlineRgb;
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const aOrig = alpha[i] ?? 0;
    const aDilated = dilated[i] ?? 0;
    const aOutline = Math.max(0, aDilated - aOrig);

    if (aOrig === 0 && aOutline > 0) {
      // Pure outline pixel
      data[idx] = outR;
      data[idx + 1] = outG;
      data[idx + 2] = outB;
      data[idx + 3] = aOutline;
    } else if (aOrig > 0 && aOutline > 0 && aOrig < 255) {
      // Semi-transparent subject edge blending with outline underneath
      const sAlpha = aOrig / 255;
      const oAlpha = (aOutline / 255) * (1 - sAlpha);
      const blendedAlpha = sAlpha + oAlpha;

      if (blendedAlpha > 0) {
        data[idx] = Math.round(((data[idx] ?? 0) * sAlpha + outR * oAlpha) / blendedAlpha);
        data[idx + 1] = Math.round(((data[idx + 1] ?? 0) * sAlpha + outG * oAlpha) / blendedAlpha);
        data[idx + 2] = Math.round(((data[idx + 2] ?? 0) * sAlpha + outB * oAlpha) / blendedAlpha);
        data[idx + 3] = Math.round(blendedAlpha * 255);
      }
    }
    // Fully opaque subject pixels (aOrig === 255) remain unchanged
  }

  return imageData;
}

/**
 * Render image onto target 32x32 or 48x48 canvas with contain-fit scaling and sticker outline.
 */
export function renderContainFitWithOutline(
  sourceImage: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetCanvas: HTMLCanvasElement,
  targetSize: 32 | 48,
  outlineThickness: number = 0,
  outlineColor: [number, number, number] = [255, 255, 255]
): void {
  targetCanvas.width = targetSize;
  targetCanvas.height = targetSize;

  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.clearRect(0, 0, targetSize, targetSize);

  // Reserve padding for outline dilation so it stays within canvas boundary
  const pad = outlineThickness > 0 ? outlineThickness : 0;
  const availWidth = Math.max(1, targetSize - pad * 2);
  const availHeight = Math.max(1, targetSize - pad * 2);

  const scale = Math.min(availWidth / sourceWidth, availHeight / sourceHeight);
  const destWidth = Math.max(1, Math.round(sourceWidth * scale));
  const destHeight = Math.max(1, Math.round(sourceHeight * scale));
  const destX = Math.round(pad + (availWidth - destWidth) / 2);
  const destY = Math.round(pad + (availHeight - destHeight) / 2);

  // Draw contain-fit subject
  ctx.drawImage(sourceImage, destX, destY, destWidth, destHeight);

  // Apply alpha dilation sticker outline if requested
  if (outlineThickness > 0) {
    const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
    applyAlphaOutline(imgData, outlineThickness, outlineColor);
    ctx.putImageData(imgData, 0, 0);
  }
}

/**
 * Export HTMLCanvasElement content to PNG Blob.
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to encode canvas to PNG blob'));
      }
    }, 'image/png');
  });
}

/**
 * Verify Windows CUR binary header (0x00 0x00 0x02 0x00).
 */
export function isCurBinaryHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x02 && bytes[3] === 0x00;
}
