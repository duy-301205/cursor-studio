import React, { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { MousePointer, ArrowRight, Download, Sparkles, AlertCircle } from 'lucide-react';
import type { PackCard as PackCardType } from '../types/api';

export interface PackCardProps {
  card: PackCardType;
  onTry?: (card: PackCardType) => void;
}

export function PackCard({ card, onTry }: PackCardProps): React.ReactElement {
  const [imageError, setImageError] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  // Compute CSS cursor with strictly required native fallback (RULES.md F02)
  const cursorStyle = useMemo<React.CSSProperties>(() => {
    if (imageError || !card.pointer.preview_png_url) {
      return { cursor: 'auto' };
    }

    const { preview_png_url, hotspot_x, hotspot_y } = card.pointer;
    // Clamped coordinates ensuring bounds adherence
    const clampedX = Math.max(0, Math.min(47, Math.round(hotspot_x)));
    const clampedY = Math.max(0, Math.min(47, Math.round(hotspot_y)));

    return {
      cursor: `url("${preview_png_url}") ${clampedX} ${clampedY}, auto`,
    };
  }, [card.pointer, imageError]);

  const handleTryClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onTry?.(card);
  };

  return (
    <article
      className="group relative flex flex-col rounded-card bg-surface border border-line overflow-hidden shadow-card hover:shadow-float hover:border-brand/40 transition-all duration-200"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ============================================================ */}
      {/* 1. Hover-to-Test Sandbox Preview Zone                        */}
      {/* ============================================================ */}
      <div
        style={cursorStyle}
        className="relative w-full aspect-[4/3] bg-raised/70 border-b border-line flex items-center justify-center overflow-hidden transition-colors duration-150 select-none"
        aria-label={`Test cursor area for ${card.title}. Hover to try pointer.`}
        role="region"
      >
        {/* Subtle checkerboard transparency grid */}
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(var(--checker-b, #E2E6EF) 1px, transparent 1px)',
            backgroundSize: '12px 12px',
          }}
        />

        {/* Cursor Image Display */}
        {imageError ? (
          <div className="flex flex-col items-center gap-1.5 text-muted z-10">
            <AlertCircle className="w-8 h-8 opacity-50" />
            <span className="text-xs font-medium">Preview unavailable</span>
          </div>
        ) : (
          <img
            src={card.pointer.preview_png_url || card.thumbnail_url}
            alt={`${card.title} pointer preview`}
            loading="lazy"
            onError={() => setImageError(true)}
            className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-md transition-transform duration-200 group-hover:scale-110 z-10"
          />
        )}

        {/* Hover-to-Test Badge Indicator */}
        <div
          className={`absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs px-2.5 py-1 rounded-pill backdrop-blur-md transition-all duration-200 z-10 ${
            isHovered
              ? 'bg-brand/90 text-white shadow-sm'
              : 'bg-surface/80 text-muted border border-line/60'
          }`}
        >
          <div className="flex items-center gap-1.5 font-medium truncate">
            <MousePointer className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{isHovered ? 'Active custom cursor' : 'Hover to test'}</span>
          </div>
          <span className="font-mono text-[11px] opacity-80 shrink-0">
            ({card.pointer.hotspot_x},{card.pointer.hotspot_y})
          </span>
        </div>

        {/* Type / Animation Badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          {card.is_animated && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-soft text-brand text-[11px] font-semibold">
              <Sparkles className="w-3 h-3" />
              Animated
            </span>
          )}
          {card.is_premium ? (
            <span className="px-2 py-0.5 rounded-full bg-warning/20 text-warning text-[11px] font-semibold">
              Premium
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-surface/90 text-muted border border-line text-[11px] font-semibold">
              Free
            </span>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. Card Metadata & Content                                   */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col p-5 space-y-3">
        {/* Category & Download Stats */}
        <div className="flex items-center justify-between text-xs">
          <span className="px-2.5 py-0.5 rounded-md bg-raised text-muted font-medium border border-line/50">
            {card.category.name}
          </span>
          <div className="flex items-center gap-1 text-muted font-medium">
            <Download className="w-3.5 h-3.5" />
            <span>{card.download_count.toLocaleString()}</span>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-bold text-lg text-ink tracking-tight line-clamp-1 group-hover:text-brand transition-colors">
          <NavLink
            to={`/packs/${card.slug}`}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded"
          >
            {card.title}
          </NavLink>
        </h3>

        {/* Description */}
        <p className="text-sm text-muted line-clamp-2 leading-relaxed flex-1">
          {card.description}
        </p>

        {/* Actions Bar */}
        <div className="pt-3 border-t border-line flex items-center justify-between gap-2">
          {/* Mobile / Keyboard Try Action Button */}
          <button
            type="button"
            onClick={handleTryClick}
            aria-label={`Test ${card.title} cursor`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-raised hover:bg-brand-soft hover:text-brand text-xs font-semibold text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <MousePointer className="w-3.5 h-3.5" />
            Try
          </button>

          {/* View Pack Details Link */}
          <NavLink
            to={`/packs/${card.slug}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-hover transition-colors py-1.5 px-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            View Pack <ArrowRight className="w-3.5 h-3.5" />
          </NavLink>
        </div>
      </div>
    </article>
  );
}

export default PackCard;
