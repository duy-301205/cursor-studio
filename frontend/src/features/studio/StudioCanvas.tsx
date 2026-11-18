import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Layers, Palette, Sparkles, Sliders } from 'lucide-react';
import {
  type HotspotPoint,
  HotspotGridPicker,
} from '../../components/HotspotGridPicker.tsx';
import {
  renderContainFitWithOutline,
  canvasToBlob,
  hexToRgb,
} from './canvasPipeline.ts';

export interface StudioCanvasProps {
  imageElement: HTMLImageElement | null;
  targetSize: 32 | 48;
  onTargetSizeChange: (size: 32 | 48) => void;
  outlineThickness: number;
  onOutlineThicknessChange: (thickness: number) => void;
  outlineColor: string;
  onOutlineColorChange: (color: string) => void;
  hotspotX: number;
  hotspotY: number;
  onHotspotChange: (point: HotspotPoint) => void;
  onRasterBlobChange: (blob: Blob | null) => void;
  disabled?: boolean;
}

const PRESET_COLORS = [
  { label: 'White', value: '#FFFFFF' },
  { label: 'Black', value: '#000000' },
  { label: 'Yellow', value: '#FFD60A' },
  { label: 'Red', value: '#EF4444' },
  { label: 'Cyan', value: '#06B6D4' },
];

export const StudioCanvas: React.FC<StudioCanvasProps> = ({
  imageElement,
  targetSize,
  onTargetSizeChange,
  outlineThickness,
  onOutlineThicknessChange,
  outlineColor,
  onOutlineColorChange,
  hotspotX,
  hotspotY,
  onHotspotChange,
  onRasterBlobChange,
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rasterDataUrl, setRasterDataUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(false);

  // Re-render canvas when image, size, or outline changes
  const updatePipeline = useCallback(async () => {
    if (!imageElement) {
      setRasterDataUrl(null);
      onRasterBlobChange(null);
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }

    const canvas = canvasRef.current;
    setIsRendering(true);

    try {
      const rgb = hexToRgb(outlineColor);
      renderContainFitWithOutline(
        imageElement,
        imageElement.naturalWidth,
        imageElement.naturalHeight,
        canvas,
        targetSize,
        outlineThickness,
        rgb
      );

      // Generate data URL for instant pixelated grid preview
      const dataUrl = canvas.toDataURL('image/png');
      setRasterDataUrl(dataUrl);

      // Generate binary PNG Blob for server convert API
      const blob = await canvasToBlob(canvas);
      onRasterBlobChange(blob);
    } catch (err) {
      console.error('Failed to update canvas pipeline:', err);
    } finally {
      setIsRendering(false);
    }
  }, [
    imageElement,
    targetSize,
    outlineThickness,
    outlineColor,
    onRasterBlobChange,
  ]);

  useEffect(() => {
    updatePipeline();
  }, [updatePipeline]);

  // CSS cursor style for live preview: cursor: url(...) x y, auto
  const liveCursorStyle = rasterDataUrl
    ? {
        cursor: `url(${rasterDataUrl}) ${hotspotX} ${hotspotY}, auto`,
      }
    : {};

  return (
    <div className="space-y-6">
      {/* 1. Canvas Styling & Geometry Controls */}
      <div className="rounded-2xl bg-surface border border-line p-5 shadow-card space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-brand" />
            <span className="font-bold text-sm text-ink">Sticker &amp; Geometry Controls</span>
          </div>
          {isRendering && (
            <span className="text-xs text-muted font-mono animate-pulse">Rendering...</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Sticker Outline Thickness */}
          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs font-semibold text-muted">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-brand" />
                Sticker Outline Width
              </span>
              <span className="font-mono text-ink font-bold">
                {outlineThickness === 0 ? 'None (0px)' : `${outlineThickness}px`}
              </span>
            </label>
            <div className="flex items-center gap-1.5" role="group" aria-label="Outline thickness options">
              {[0, 1, 2, 3, 4].map((px) => (
                <button
                  key={px}
                  type="button"
                  disabled={disabled}
                  onClick={() => onOutlineThicknessChange(px)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                    outlineThickness === px
                      ? 'bg-brand text-white border-brand shadow-sm'
                      : 'bg-raised text-muted border-line hover:text-ink hover:border-muted'
                  } disabled:opacity-50`}
                >
                  {px === 0 ? 'None' : `${px}px`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted">
              Alpha dilation outline conforms to subject silhouette, not bounding box.
            </p>
          </div>

          {/* Sticker Outline Color */}
          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs font-semibold text-muted">
              <span className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-brand" />
                Outline Color
              </span>
              <span className="font-mono text-ink text-[11px] uppercase">
                {outlineColor}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1" role="group" aria-label="Color presets">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    disabled={disabled || outlineThickness === 0}
                    onClick={() => onOutlineColorChange(preset.value)}
                    title={preset.label}
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                      outlineColor.toUpperCase() === preset.value.toUpperCase()
                        ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface scale-105'
                        : 'border-line hover:scale-105'
                    } disabled:opacity-40`}
                    style={{ backgroundColor: preset.value }}
                  />
                ))}
              </div>

              {/* Custom Color Input */}
              <div className="relative">
                <input
                  type="color"
                  value={outlineColor}
                  disabled={disabled || outlineThickness === 0}
                  onChange={(e) => onOutlineColorChange(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border border-line bg-transparent p-0.5 disabled:opacity-40"
                  title="Choose custom color"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Hotspot Grid Picker (T20 Component) */}
      <div className="rounded-2xl bg-surface border border-line p-5 sm:p-6 shadow-card space-y-4">
        <HotspotGridPicker
          size={targetSize}
          imageDataUrl={rasterDataUrl}
          x={hotspotX}
          y={hotspotY}
          onChange={onHotspotChange}
          onSizeChange={onTargetSizeChange}
          disabled={disabled}
        />
      </div>

      {/* 3. Live 1x Realistic Cursor Tester Area */}
      {rasterDataUrl && (
        <div className="rounded-2xl bg-surface border border-line p-5 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" />
              <span className="font-bold text-sm text-ink">Life-size Hover Tester</span>
            </div>
            <span className="text-xs text-muted font-mono">
              Actual {targetSize}×{targetSize} px
            </span>
          </div>

          <div
            className="w-full h-24 rounded-xl border-2 border-dashed border-line bg-raised/40 flex items-center justify-center select-none transition-colors hover:border-brand/50 hover:bg-brand-soft/20"
            style={liveCursorStyle}
          >
            <p className="text-xs text-muted font-medium pointer-events-none text-center px-4">
              Hover inside this box to test your custom cursor with its exact hotspot at{' '}
              <span className="font-mono font-bold text-brand">({hotspotX}, {hotspotY})</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
