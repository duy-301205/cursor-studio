import React, { useRef, useId } from 'react';
import { Target, CornerUpLeft, Crosshair, ArrowUpRight } from 'lucide-react';
import {
  type HotspotPoint,
  clampHotspot,
  pointFromPointer,
  scaleHotspot,
} from '../features/studio/hotspot.ts';

export type { HotspotPoint };
export { pointFromPointer, scaleHotspot, clampHotspot };

export interface HotspotGridPickerProps {
  size: 32 | 48;
  imageDataUrl?: string | null | undefined;
  x: number;
  y: number;
  onChange: (point: HotspotPoint) => void;
  onSizeChange?: ((newSize: 32 | 48) => void) | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export const HotspotGridPicker: React.FC<HotspotGridPickerProps> = ({
  size,
  imageDataUrl,
  x,
  y,
  onChange,
  onSizeChange,
  disabled = false,
  className = '',
}) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId();

  // Clamp current incoming hotspot coordinates
  const { x: clampedX, y: clampedY } = clampHotspot({ x, y }, size);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const rect = target.getBoundingClientRect();
    const point = pointFromPointer(e.clientX, e.clientY, rect, size);
    onChange(point);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = pointFromPointer(e.clientX, e.clientY, rect, size);
    onChange(point);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = e.shiftKey ? 5 : 1;
    let nextX = clampedX;
    let nextY = clampedY;
    let handled = true;

    switch (e.key) {
      case 'ArrowUp':
        nextY = Math.max(0, clampedY - step);
        break;
      case 'ArrowDown':
        nextY = Math.min(size - 1, clampedY + step);
        break;
      case 'ArrowLeft':
        nextX = Math.max(0, clampedX - step);
        break;
      case 'ArrowRight':
        nextX = Math.min(size - 1, clampedX + step);
        break;
      case 'Home':
        nextX = 0;
        if (e.ctrlKey) nextY = 0;
        break;
      case 'End':
        nextX = size - 1;
        if (e.ctrlKey) nextY = size - 1;
        break;
      default:
        handled = false;
    }

    if (handled) {
      e.preventDefault();
      onChange({ x: nextX, y: nextY });
    }
  };

  const handleSizeChange = (newSize: 32 | 48) => {
    if (newSize === size || !onSizeChange) return;
    const scaled = scaleHotspot({ x: clampedX, y: clampedY }, size, newSize);
    onSizeChange(newSize);
    onChange(scaled);
  };

  // Percentages for crosshair positioning
  const cellPercent = 100 / size;
  const crosshairCenterX = (clampedX + 0.5) * cellPercent;
  const crosshairCenterY = (clampedY + 0.5) * cellPercent;

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header controls: size toggle and status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-accent-red" aria-hidden="true" />
          <span className="font-semibold text-text-primary text-sm">Hotspot Picker</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-muted text-text-secondary border border-border">
            {size}×{size} px
          </span>
        </div>

        {onSizeChange && (
          <div className="inline-flex rounded-lg p-0.5 bg-surface-muted border border-border" role="group" aria-label="Cursor resolution">
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleSizeChange(32)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                size === 32
                  ? 'bg-surface text-text-primary shadow-sm font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              } disabled:opacity-50`}
            >
              32×32
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleSizeChange(48)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                size === 48
                  ? 'bg-surface text-text-primary shadow-sm font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              } disabled:opacity-50`}
            >
              48×48
            </button>
          </div>
        )}
      </div>

      {/* Main Interactive Grid Area */}
      <div className="relative mx-auto w-full max-w-[384px] aspect-square rounded-xl border border-border overflow-hidden shadow-inner bg-surface">
        <div
          ref={gridRef}
          role="grid"
          tabIndex={disabled ? -1 : 0}
          aria-label={`Hotspot picker grid ${size} by ${size}. Selected X ${clampedX}, Y ${clampedY}. Use arrow keys to move, Shift+Arrow for 5 pixels.`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
          className={`w-full h-full relative cursor-crosshair select-none touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 ${
            disabled ? 'opacity-50 pointer-events-none' : ''
          }`}
          style={{
            backgroundImage: `
              linear-gradient(45deg, rgba(128, 128, 128, 0.12) 25%, transparent 25%),
              linear-gradient(-45deg, rgba(128, 128, 128, 0.12) 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, rgba(128, 128, 128, 0.12) 75%),
              linear-gradient(-45deg, transparent 75%, rgba(128, 128, 128, 0.12) 75%)
            `,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          }}
        >
          {/* Preview Image Raster */}
          {imageDataUrl && (
            <img
              src={imageDataUrl}
              alt="Cursor Raster Preview"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              style={{ imageRendering: 'pixelated' }}
            />
          )}

          {/* Active Pixel Highlight Box */}
          <div
            className="absolute border border-accent-red bg-accent-red/25 pointer-events-none transition-none"
            style={{
              left: `${(clampedX / size) * 100}%`,
              top: `${(clampedY / size) * 100}%`,
              width: `${cellPercent}%`,
              height: `${cellPercent}%`,
            }}
          />

          {/* Precision Red Crosshair Overlay */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* Horizontal Crosshair Line with shadow for contrast */}
            <line
              x1="0"
              y1={crosshairCenterY}
              x2="100"
              y2={crosshairCenterY}
              stroke="#000000"
              strokeWidth="0.8"
              strokeOpacity="0.4"
            />
            <line
              x1="0"
              y1={crosshairCenterY}
              x2="100"
              y2={crosshairCenterY}
              stroke="#EF4444"
              strokeWidth="0.5"
              strokeDasharray="2, 2"
            />

            {/* Vertical Crosshair Line with shadow for contrast */}
            <line
              x1={crosshairCenterX}
              y1="0"
              x2={crosshairCenterX}
              y2="100"
              stroke="#000000"
              strokeWidth="0.8"
              strokeOpacity="0.4"
            />
            <line
              x1={crosshairCenterX}
              y1="0"
              x2={crosshairCenterX}
              y2="100"
              stroke="#EF4444"
              strokeWidth="0.5"
              strokeDasharray="2, 2"
            />

            {/* Center Crosshair Marker */}
            <circle
              cx={crosshairCenterX}
              cy={crosshairCenterY}
              r="1.2"
              fill="#EF4444"
              stroke="#FFFFFF"
              strokeWidth="0.4"
            />
          </svg>
        </div>
      </div>

      {/* Coordinate Readout & Quick Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* JetBrains Mono coordinate indicator */}
        <div
          className="flex items-center gap-2 font-mono bg-surface-muted px-3 py-1.5 rounded-lg border border-border text-text-primary"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-text-secondary font-sans font-medium">Hotspot:</span>
          <span className="font-bold text-accent-red">X: {clampedX}</span>
          <span className="text-border">|</span>
          <span className="font-bold text-accent-red">Y: {clampedY}</span>
        </div>

        {/* Quick Hotspot Presets */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Hotspot quick presets">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ x: 0, y: 0 })}
            title="Top-Left (0, 0) — Default arrow pointer"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary/40 transition-colors disabled:opacity-50"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
            <span>(0,0)</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ x: Math.floor(size / 2), y: Math.floor(size / 2) })}
            title={`Center (${Math.floor(size / 2)}, ${Math.floor(size / 2)}) — Crosshair`}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary/40 transition-colors disabled:opacity-50"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Center</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ x: size - 1, y: 0 })}
            title={`Top-Right (${size - 1}, 0)`}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary/40 transition-colors disabled:opacity-50"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>({size - 1},0)</span>
          </button>
        </div>
      </div>

      {/* Numeric Input Fallbacks (Mandatory per DESIGN.md & RULES.md F05) */}
      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border">
        <div>
          <label htmlFor={`${uniqueId}-x`} className="block text-xs font-medium text-text-secondary mb-1">
            Coordinate X (0 – {size - 1})
          </label>
          <input
            id={`${uniqueId}-x`}
            type="number"
            min={0}
            max={size - 1}
            value={clampedX}
            disabled={disabled}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!Number.isNaN(val)) {
                onChange({ x: Math.max(0, Math.min(size - 1, val)), y: clampedY });
              }
            }}
            className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue disabled:opacity-50"
          />
        </div>
        <div>
          <label htmlFor={`${uniqueId}-y`} className="block text-xs font-medium text-text-secondary mb-1">
            Coordinate Y (0 – {size - 1})
          </label>
          <input
            id={`${uniqueId}-y`}
            type="number"
            min={0}
            max={size - 1}
            value={clampedY}
            disabled={disabled}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!Number.isNaN(val)) {
                onChange({ x: clampedX, y: Math.max(0, Math.min(size - 1, val)) });
              }
            }}
            className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
};
