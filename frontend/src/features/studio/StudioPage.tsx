import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Sparkles,
  Download,
  RotateCcw,
  Maximize2,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  FileImage,
  Loader2,
  X,
} from 'lucide-react';
import { StudioCanvas } from './StudioCanvas.tsx';
import {
  validateImageFile,
} from './canvasPipeline.ts';
import {
  removeBackground,
  isWasmSupported,
  type RemovalProgress,
  BackgroundRemovalError,
} from './backgroundRemoval.ts';
import { convertCursor, ApiError } from '../../lib/api.ts';
import { InteractiveSandbox } from '../../components/InteractiveSandbox.tsx';
import type { CursorAsset, CursorRole } from '../../types/api.ts';

export const StudioPage: React.FC = () => {
  const navigate = useNavigate();
  // --- Image & Pipeline States ---
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number; sizeBytes: number } | null>(null);
  const [rawImageElement, setRawImageElement] = useState<HTMLImageElement | null>(null);
  const [activeImageElement, setActiveImageElement] = useState<HTMLImageElement | null>(null);
  const [isCutout, setIsCutout] = useState<boolean>(false);

  // Object URLs tracking for proper cleanup (RULES.md F04)
  const activeObjectUrlsRef = useRef<Set<string>>(new Set());

  // --- Geometry & Outline States ---
  const [targetSize, setTargetSize] = useState<32 | 48>(32);
  const [outlineThickness, setOutlineThickness] = useState<number>(1);
  const [outlineColor, setOutlineColor] = useState<string>('#FFFFFF');
  const [hotspotX, setHotspotX] = useState<number>(0);
  const [hotspotY, setHotspotY] = useState<number>(0);
  const [rasterBlob, setRasterBlob] = useState<Blob | null>(null);

  // --- AI Background Removal States ---
  const [aiStatus, setAiStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [aiProgress, setAiProgress] = useState<RemovalProgress | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);

  // --- Export & Error States ---
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ filename: string; bytes: number } | null>(null);

  // --- Drag & Drop state ---
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Sandbox Preview Modal ---
  const [sandboxModalOpen, setSandboxModalOpen] = useState<boolean>(false);
  const [customPreviewUrl, setCustomPreviewUrl] = useState<string | null>(null);

  // Helper to safely track and revoke object URLs
  const createTrackedUrl = useCallback((blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    activeObjectUrlsRef.current.add(url);
    return url;
  }, []);

  const revokeAllTrackedUrls = useCallback(() => {
    activeObjectUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore revoke errors
      }
    });
    activeObjectUrlsRef.current.clear();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      revokeAllTrackedUrls();
    };
  }, [revokeAllTrackedUrls]);

  // Handle new file selection
  const processSelectedFile = useCallback((file: File) => {
    // 1. Validate size and MIME type
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setExportError(validation.error ?? 'Invalid file selected.');
      return;
    }

    setExportError(null);
    setAiErrorMessage(null);
    setSuccessInfo(null);
    setAiStatus('idle');
    setAiProgress(null);
    setIsCutout(false);

    // 2. Revoke previous URLs and create new URL
    revokeAllTrackedUrls();
    const objectUrl = createTrackedUrl(file);

    // 3. Load into HTMLImageElement
    const img = new Image();
    img.onload = () => {
      setImageMeta({
        width: img.naturalWidth,
        height: img.naturalHeight,
        sizeBytes: file.size,
      });
      setRawImageElement(img);
      setActiveImageElement(img);
      setSourceFile(file);
    };
    img.onerror = () => {
      setExportError('Failed to load image. The file may be corrupt or unreadable.');
    };
    img.src = objectUrl;
  }, [createTrackedUrl, revokeAllTrackedUrls]);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0]) {
      processSelectedFile(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && files[0]) {
      processSelectedFile(files[0]);
    }
  };

  // Trigger AI background removal
  const handleRemoveBackground = async () => {
    if (!sourceFile) return;

    if (!isWasmSupported()) {
      setAiStatus('error');
      setAiErrorMessage(
        'WebAssembly is disabled or not supported in this browser. You can still use Skip AI and export with the original image.'
      );
      return;
    }

    setAiStatus('processing');
    setAiErrorMessage(null);
    setAiProgress({ key: 'init', current: 0, total: 100, percentage: 0 });

    try {
      const cutoutBlob = await removeBackground(sourceFile, {
        onProgress: (p) => {
          setAiProgress(p);
        },
      });

      const cutoutUrl = createTrackedUrl(cutoutBlob);
      const cutoutImg = new Image();
      cutoutImg.onload = () => {
        setActiveImageElement(cutoutImg);
        setIsCutout(true);
        setAiStatus('success');
      };
      cutoutImg.src = cutoutUrl;
    } catch (err: unknown) {
      console.warn('Background removal failed or cancelled:', err);
      setAiStatus('error');
      if (err instanceof BackgroundRemovalError) {
        setAiErrorMessage(err.message);
      } else {
        setAiErrorMessage(
          'Background removal encountered an error. You can continue by using the raw image with Skip AI.'
        );
      }
    }
  };

  // Revert back to original image
  const handleRevertToOriginal = () => {
    if (rawImageElement) {
      setActiveImageElement(rawImageElement);
      setIsCutout(false);
      setAiStatus('idle');
      setAiErrorMessage(null);
    }
  };

  // Reset entire studio
  const handleReset = () => {
    revokeAllTrackedUrls();
    setSourceFile(null);
    setImageMeta(null);
    setRawImageElement(null);
    setActiveImageElement(null);
    setIsCutout(false);
    setAiStatus('idle');
    setAiProgress(null);
    setAiErrorMessage(null);
    setExportError(null);
    setSuccessInfo(null);
    setHotspotX(0);
    setHotspotY(0);
    setRasterBlob(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Export Windows CUR file
  const handleExportCur = async () => {
    if (!rasterBlob || isExporting) return;

    setIsExporting(true);
    setExportError(null);
    setSuccessInfo(null);

    try {
      const result = await convertCursor({
        file: rasterBlob,
        size: targetSize,
        hotspot_x: hotspotX,
        hotspot_y: hotspotY,
      });

      // Trigger browser download
      const downloadUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = result.filename || 'custom-cursor.cur';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 1000);

      setSuccessInfo({
        filename: result.filename,
        bytes: result.blob.size,
      });
    } catch (err: unknown) {
      console.error('Failed to export cursor:', err);
      if (err instanceof ApiError) {
        if (err.status === 401 || err.code === 'AUTH_REQUIRED') {
          navigate('/login?returnUrl=%2Fstudio');
          return;
        } else if (err.status === 413) {
          setExportError('Payload too large. The image exceeded the 2MB server limit.');
        } else if (err.status === 415) {
          setExportError('Unsupported image format. Please ensure your image is a valid PNG.');
        } else if (err.status === 422) {
          setExportError(`Validation error: ${err.message}. Please check hotspot coordinates.`);
        } else if (err.status === 429) {
          const waitTime = err.retryAfter ? `${err.retryAfter}s` : 'a few moments';
          setExportError(`Rate limit reached (10 converts/minute). Please wait ${waitTime} before trying again.`);
        } else {
          setExportError(`Export failed (${err.code}): ${err.message}`);
        }
      } else {
        setExportError('Network error: Unable to contact conversion server. Please verify backend is running.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  // Open Sandbox preview modal
  const handleOpenSandbox = () => {
    if (!rasterBlob) return;
    const url = createTrackedUrl(rasterBlob);
    setCustomPreviewUrl(url);
    setSandboxModalOpen(true);
  };

  // Build mock CursorAsset records for Sandbox modal
  const createSandboxAsset = (role: CursorRole): CursorAsset => ({
    role_type: role,
    preview_png_url: customPreviewUrl || '',
    cursor_file_url: customPreviewUrl || '',
    hotspot_x: hotspotX,
    hotspot_y: hotspotY,
  });

  const sandboxRolePreviews: Partial<Record<CursorRole, CursorAsset>> = {
    pointer: createSandboxAsset('pointer'),
    link: createSandboxAsset('link'),
    text: createSandboxAsset('text'),
    busy: createSandboxAsset('busy'),
    working: createSandboxAsset('working'),
    precision: createSandboxAsset('precision'),
    unavailable: createSandboxAsset('unavailable'),
    move: createSandboxAsset('move'),
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      {/* 1. Header / Intro */}
      <div className="rounded-2xl bg-surface border border-line p-6 sm:p-8 shadow-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-soft text-brand text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Photo Studio
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs text-muted font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Client-Side AI &bull; No Photo Uploads until Export
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink">
          Convert Custom Artwork to Windows CUR
        </h1>
        <p className="text-muted text-sm sm:text-base max-w-3xl">
          Upload transparent artwork (PNG/JPEG/WebP &le; 2MB), optionally remove background with in-browser AI,
          add sticker outline, set precision hotspot coordinates on a 32/48 grid, and export standard Windows binary cursors.
        </p>
      </div>

      {/* 2. Global Error / Alert Banner */}
      {exportError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300 flex items-start gap-3 shadow-sm"
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
          <div className="space-y-1">
            <p className="font-semibold">Unable to process export</p>
            <p className="text-xs">{exportError}</p>
          </div>
        </div>
      )}

      {/* 3. Export Success Toast/Banner */}
      {successInfo && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm text-emerald-700 dark:text-emerald-300 flex items-start justify-between gap-3 shadow-sm animate-fadeIn"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
            <div className="space-y-1">
              <p className="font-semibold">Cursor .cur is ready!</p>
              <p className="text-xs">
                Downloaded <span className="font-mono font-bold">{successInfo.filename}</span> (
                {(successInfo.bytes / 1024).toFixed(1)} KB) with hotspot at ({hotspotX}, {hotspotY}).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSuccessInfo(null)}
            className="text-emerald-600 dark:text-emerald-400 hover:opacity-75"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4. Upload Zone / Dropzone (When no image or changing) */}
      {!activeImageElement ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center cursor-pointer transition-all duration-150 ${
            isDragging
              ? 'border-brand bg-brand-soft/30 scale-[1.01]'
              : 'border-line hover:border-brand/50 hover:bg-raised/40 bg-surface'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileInputChange}
          />

          <div className="max-w-md mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-brand-soft text-brand flex items-center justify-center mx-auto shadow-sm">
              <Upload className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-ink">
                Drop your cursor image here, or browse
              </h3>
              <p className="text-xs sm:text-sm text-muted">
                Supports PNG, JPEG, and WebP up to 2MB. Square artwork with transparent background recommended.
              </p>
            </div>

            <button
              type="button"
              className="px-5 py-2.5 rounded-xl bg-brand text-white font-semibold text-xs sm:text-sm hover:bg-brand-hover shadow-sm transition-colors"
            >
              Choose Image File
            </button>

            <div className="pt-4 border-t border-line/60 flex items-center justify-center gap-2 text-[11px] text-muted">
              <Info className="w-3.5 h-3.5 shrink-0 text-brand" />
              <span>
                Ảnh chỉ được gửi lên máy chủ khi bạn chọn Export .cur. Tách nền xử lý trên thiết bị của bạn.
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* 5. Main Studio Workspace when Image is Loaded */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Image Information & AI Cutout Controls (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Image Details Card */}
            <div className="rounded-2xl bg-surface border border-line p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-brand" />
                  <span className="font-bold text-sm text-ink">Source Image</span>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center gap-1 text-xs text-muted hover:text-red-500 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Choose different
                </button>
              </div>

              {imageMeta && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-raised border border-line">
                    <span className="block text-muted text-[11px]">Original Dimensions</span>
                    <span className="font-mono font-bold text-ink">
                      {imageMeta.width} &times; {imageMeta.height} px
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-raised border border-line">
                    <span className="block text-muted text-[11px]">File Size</span>
                    <span className="font-mono font-bold text-ink">
                      {(imageMeta.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>
              )}

              {/* Status Badges */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {isCutout ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    AI Cutout Applied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-raised text-muted font-medium border border-line">
                    Raw Image Source
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-soft text-brand font-medium">
                  Output: {targetSize}&times;{targetSize} CUR
                </span>
              </div>
            </div>

            {/* AI Background Removal Card */}
            <div className="rounded-2xl bg-surface border border-line p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand" />
                  <span className="font-bold text-sm text-ink">In-Browser AI Cutout</span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-raised text-muted border border-line">
                  WASM / Client-side
                </span>
              </div>

              <p className="text-xs text-muted">
                Automatically segment subjects and remove backgrounds directly in your browser. No image data leaves your device.
              </p>

              {/* AI Processing Progress */}
              {aiStatus === 'processing' && (
                <div className="space-y-2 p-3 rounded-xl bg-brand-soft/20 border border-brand/20">
                  <div className="flex items-center justify-between text-xs text-brand font-medium">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Segmenting background...
                    </span>
                    <span className="font-mono">{aiProgress?.percentage ?? 0}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-line overflow-hidden">
                    <div
                      className="h-full bg-brand transition-all duration-150"
                      style={{ width: `${aiProgress?.percentage ?? 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* AI Error / Fallback Notice */}
              {aiErrorMessage && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 space-y-2">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    AI Cutout Notice
                  </p>
                  <p>{aiErrorMessage}</p>
                </div>
              )}

              {/* AI Actions */}
              <div className="flex flex-col gap-2 pt-1">
                {!isCutout ? (
                  <button
                    type="button"
                    disabled={aiStatus === 'processing'}
                    onClick={handleRemoveBackground}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-hover shadow-sm transition-all disabled:opacity-50"
                  >
                    {aiStatus === 'processing' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing Cutout...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Remove Background (AI)
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRevertToOriginal}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-raised border border-line text-ink text-xs font-semibold hover:bg-line/40 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4 text-muted" />
                    Revert to Raw Image
                  </button>
                )}

                <div className="text-[11px] text-muted text-center">
                  Tip: If your image already has a transparent PNG background, you can skip AI.
                </div>
              </div>
            </div>

            {/* Export & Actions Card */}
            <div className="rounded-2xl bg-surface border border-line p-5 shadow-card space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-line">
                <Download className="w-4 h-4 text-brand" />
                <span className="font-bold text-sm text-ink">Export Windows Cursor</span>
              </div>

              <div className="space-y-2 text-xs text-muted">
                <div className="flex justify-between">
                  <span>Target Resolution:</span>
                  <span className="font-mono font-bold text-ink">{targetSize}&times;{targetSize} px</span>
                </div>
                <div className="flex justify-between">
                  <span>Selected Hotspot:</span>
                  <span className="font-mono font-bold text-brand">({hotspotX}, {hotspotY})</span>
                </div>
                <div className="flex justify-between">
                  <span>Binary Format:</span>
                  <span className="font-semibold text-ink">Single Static Windows CUR</span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  disabled={!rasterBlob || isExporting}
                  onClick={handleExportCur}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-hover shadow-card transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating .cur...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Export Windows .cur
                    </>
                  )}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!rasterBlob || isExporting}
                    onClick={handleOpenSandbox}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-raised border border-line text-ink text-xs font-semibold hover:bg-line/40 transition-colors disabled:opacity-50"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-brand" />
                    Preview in Sandbox
                  </button>

                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-raised border border-line text-muted hover:text-red-500 text-xs font-semibold hover:bg-line/40 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Studio
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Canvas Controls & Interactive Hotspot Grid (7 cols) */}
          <div className="lg:col-span-7">
            <StudioCanvas
              imageElement={activeImageElement}
              targetSize={targetSize}
              onTargetSizeChange={setTargetSize}
              outlineThickness={outlineThickness}
              onOutlineThicknessChange={setOutlineThickness}
              outlineColor={outlineColor}
              onOutlineColorChange={setOutlineColor}
              hotspotX={hotspotX}
              hotspotY={hotspotY}
              onHotspotChange={(pt) => {
                setHotspotX(pt.x);
                setHotspotY(pt.y);
              }}
              onRasterBlobChange={setRasterBlob}
              disabled={isExporting}
            />
          </div>
        </div>
      )}

      {/* 6. Interactive Sandbox Preview Modal */}
      {sandboxModalOpen && customPreviewUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sandbox-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
        >
          <div className="bg-canvas border border-line rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand" />
                <h3 id="sandbox-modal-title" className="font-bold text-lg text-ink">
                  Interactive Sandbox Preview
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSandboxModalOpen(false)}
                className="p-1 rounded-lg text-muted hover:text-ink hover:bg-raised transition-colors"
                aria-label="Close sandbox preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-muted">
              Move your mouse across the 8 zones below to test how your custom cursor behaves across different UI states.
            </p>

            <InteractiveSandbox
              rolePreviews={sandboxRolePreviews}
            />

            <div className="flex justify-end pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setSandboxModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-hover transition-colors"
              >
                Done Testing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
