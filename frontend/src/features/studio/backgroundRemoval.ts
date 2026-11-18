/**
 * Custom Cursor Studio & Library — Background Removal AI Service
 *
 * Implements lazy dynamic import for @imgly/background-removal.
 * PRIVACY & PERFORMANCE GUARDRAILS (RULES.md F04 & PRD.md):
 * 1. ZERO remote upload: all AI segmentation is performed client-side via WebAssembly/ONNX.
 * 2. ZERO eager load: the AI model and WASM binaries are never fetched on initial page load or Gallery.
 * 3. AGPL-3.0 License Gate: this library is distributed under AGPL-3.0. Commercial distribution
 *    or hosted release requires compliance review and source code distribution obligations.
 * 4. Graceful Fallback: if WASM or WebGPU is unsupported or model fails to load, provides clear
 *    error metadata so the caller can offer a "Skip AI" option to proceed with the raw image.
 */

export interface RemovalProgress {
  key: string;
  current: number;
  total: number;
  percentage: number;
}

export type RemovalProgressCallback = (progress: RemovalProgress) => void;

export interface BackgroundRemovalOptions {
  onProgress?: RemovalProgressCallback | undefined;
  debug?: boolean | undefined;
}

export class BackgroundRemovalError extends Error {
  readonly code: 'WASM_UNSUPPORTED' | 'MODEL_FETCH_FAILED' | 'PROCESSING_FAILED';
  readonly originalError?: unknown | undefined;

  constructor(
    code: 'WASM_UNSUPPORTED' | 'MODEL_FETCH_FAILED' | 'PROCESSING_FAILED',
    message: string,
    originalError?: unknown
  ) {
    super(message);
    this.name = 'BackgroundRemovalError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Check whether the current browser environment supports WebAssembly.
 */
export function isWasmSupported(): boolean {
  try {
    if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
      const module = new WebAssembly.Module(
        Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
      );
      return module instanceof WebAssembly.Module;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Execute client-side background removal using @imgly/background-removal.
 * Lazily imports the library upon invocation.
 */
export async function removeBackground(
  imageSource: ImageData | ImageBitmap | HTMLImageElement | HTMLCanvasElement | Blob | File | string,
  options?: BackgroundRemovalOptions
): Promise<Blob> {
  // 1. Verify WebAssembly support before loading binaries
  if (!isWasmSupported()) {
    throw new BackgroundRemovalError(
      'WASM_UNSUPPORTED',
      'WebAssembly is not supported or is disabled in your browser. You can still use the image directly with Skip AI.'
    );
  }

  try {
    // 2. Dynamic lazy import (F04: Never loaded during initial bundle or Gallery browsing)
    const { removeBackground: imglyRemove } = await import('@imgly/background-removal');

    // 3. Configure execution and progress reporting
    const config = {
      progress: (key: string, current: number, total: number): void => {
        if (options?.onProgress && total > 0) {
          const percentage = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
          options.onProgress({
            key,
            current,
            total,
            percentage,
          });
        }
      },
      debug: options?.debug ?? false,
    };

    // 4. Perform background removal
    const resultBlob = await imglyRemove(imageSource, config);
    return resultBlob;
  } catch (err: unknown) {
    if (err instanceof BackgroundRemovalError) {
      throw err;
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('Failed to load')) {
      throw new BackgroundRemovalError(
        'MODEL_FETCH_FAILED',
        'Failed to download the background removal model files. Please check your internet connection or use Skip AI.',
        err
      );
    }

    throw new BackgroundRemovalError(
      'PROCESSING_FAILED',
      `Background removal failed: ${errorMsg}. You can skip AI and use the original image.`,
      err
    );
  }
}

/**
 * Track license compliance information for AGPL-3.0.
 */
export const AGPL_LICENSE_NOTICE = {
  packageName: '@imgly/background-removal',
  license: 'AGPL-3.0-or-later',
  reviewRequiredBeforeRelease: true,
  summary:
    'This module uses @imgly/background-removal for in-browser ML segmentation under AGPL-3.0. Legal review required prior to commercial public launch.',
} as const;
