import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Layers,
  Share2,
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  Sparkles,
  MousePointer,
  Hand,
  Type,
  Hourglass,
  Clock,
  Crosshair,
  Ban,
  Move,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  type LocalMixStateV1,
  ALL_CURSOR_ROLES,
  countAssignedRoles,
} from '../features/mix/mixStorage.ts';
import type { CursorRole } from '../types/api.ts';

export interface MixMatchDockProps {
  mix: LocalMixStateV1;
  onRemove?: (role: CursorRole) => void;
  onClear?: () => void;
  onShare?: () => void;
  className?: string;
}

const ROLE_ICONS: Record<CursorRole, LucideIcon> = {
  pointer: MousePointer,
  link: Hand,
  text: Type,
  busy: Hourglass,
  working: Clock,
  precision: Crosshair,
  unavailable: Ban,
  move: Move,
};

const ROLE_LABELS: Record<CursorRole, string> = {
  pointer: 'Pointer',
  link: 'Link',
  text: 'Text',
  busy: 'Busy',
  working: 'Working',
  precision: 'Precision',
  unavailable: 'Unavailable',
  move: 'Move',
};

export const MixMatchDock: React.FC<MixMatchDockProps> = ({
  mix,
  onRemove,
  onClear,
  onShare,
  className = '',
}) => {
  const [isExpandedMobile, setIsExpandedMobile] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const navigate = useNavigate();
  const location = useLocation();

  const assignedCount = countAssignedRoles(mix.roles);
  const isMixPage = location.pathname.startsWith('/mix');

  // Option 1 UX Optimization:
  // Hide the dock completely when empty (assignedCount === 0) to avoid obstructing gallery cards and controls.
  // Also hide on /mix page since /mix already contains the full interactive 8-slot composer.
  if (assignedCount === 0 || isMixPage) {
    return null;
  }

  const handleSlotClick = (role: CursorRole) => {
    navigate(`/mix#slot-${role}`);
  };

  const handleClearClick = () => {
    if (assignedCount === 0) return;
    if (showClearConfirm) {
      onClear?.();
      setShowClearConfirm(false);
    } else {
      setShowClearConfirm(true);
      setTimeout(() => setShowClearConfirm(false), 4000);
    }
  };

  return (
    <aside
      aria-label="Mix and Match Cursor Dock"
      className={`fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-30 w-[calc(100vw-24px)] max-w-[1100px] transition-all duration-200 animate-fadeIn ${className}`}
    >
      <div className="rounded-2xl border border-line bg-surface/95 backdrop-blur-md shadow-2xl p-3 sm:p-4 text-ink">
        {/* Mobile Header / Collapsed Strip */}
        <div className="flex md:hidden items-center justify-between pb-2 border-b border-line/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-soft text-brand flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-ink leading-none">Mix &amp; Match</span>
              <span className="text-[10px] text-muted font-medium">
                <span className="text-brand font-bold">{assignedCount}</span> / 8 roles assigned
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isMixPage && (
              <button
                type="button"
                onClick={() => navigate('/mix')}
                className="px-2.5 py-1 rounded-lg bg-brand text-white text-[11px] font-semibold flex items-center gap-1 shadow-sm"
              >
                Open Mixer <ArrowRight className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsExpandedMobile((prev) => !prev)}
              className="p-1.5 rounded-lg bg-raised text-muted hover:text-ink transition-colors"
              aria-label={isExpandedMobile ? 'Collapse dock' : 'Expand dock'}
            >
              {isExpandedMobile ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 8-Slot Rack (Visible on Desktop, Collapsible on Mobile) */}
        <div
          className={`pt-2 md:pt-0 ${
            isExpandedMobile ? 'block' : 'hidden md:block'
          }`}
        >
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Left Desktop Brand / Summary */}
            <div className="hidden lg:flex items-center gap-3 pr-2 border-r border-line shrink-0">
              <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand flex items-center justify-center shadow-sm">
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-extrabold text-ink tracking-tight">Mix Dock</span>
                <span className="text-[11px] text-muted font-medium">
                  <span className="font-bold text-brand">{assignedCount}</span>/8 selected
                </span>
              </div>
            </div>

            {/* 8 Cursor Slots */}
            <div
              className="grid grid-cols-4 sm:grid-cols-8 gap-2 flex-1 overflow-x-auto py-1"
              role="group"
              aria-label="Cursor mix roles slots"
            >
              {ALL_CURSOR_ROLES.map((role) => {
                const item = mix.roles[role];
                const Icon = ROLE_ICONS[role];
                const label = ROLE_LABELS[role];

                return (
                  <div
                    key={role}
                    onClick={() => handleSlotClick(role)}
                    className={`group relative flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      item
                        ? 'border-brand/40 bg-brand-soft/20 hover:border-brand hover:scale-105 shadow-sm'
                        : 'border-dashed border-line bg-raised/30 hover:border-muted hover:bg-raised/60'
                    }`}
                    title={
                      item
                        ? `${label}: ${item.pack_title} (${role}) — Click to view in Mixer`
                        : `${label}: Empty slot — Click to assign from catalog`
                    }
                  >
                    {/* Active Cursor Thumbnail or Fallback Icon */}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center relative select-none">
                      {item ? (
                        <img
                          src={item.preview_png_url}
                          alt={`${label} Preview`}
                          className="w-7 h-7 object-contain drop-shadow"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : (
                        <Icon className="w-4 h-4 text-muted group-hover:text-ink transition-colors" />
                      )}

                      {/* Remove button (X) when item is present */}
                      {item && onRemove && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove(role);
                          }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface border border-line text-muted hover:text-red-500 hover:border-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          title={`Remove ${label} cursor`}
                          aria-label={`Remove ${label}`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>

                    {/* Role Label */}
                    <span className="text-[10px] font-semibold text-muted group-hover:text-ink truncate max-w-full mt-1">
                      {label}
                    </span>

                    {/* State dot */}
                    <div
                      className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                        item ? 'bg-brand' : 'bg-line'
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Right Action Controls */}
            <div className="flex items-center justify-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-line md:pl-3">
              {/* Navigate to /mix */}
              {!isMixPage && (
                <button
                  type="button"
                  onClick={() => navigate('/mix')}
                  className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand-hover shadow-sm transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Mix &amp; Match
                </button>
              )}

              {/* Share Preset CTA */}
              {onShare && (
                <button
                  type="button"
                  disabled={assignedCount === 0}
                  onClick={onShare}
                  className="flex items-center gap-1 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-brand-soft text-brand text-xs font-semibold hover:bg-brand/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Share your custom mix preset (expires in 90 days)"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Share</span>
                </button>
              )}

              {/* Clear All CTA */}
              {onClear && assignedCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearClick}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                    showClearConfirm
                      ? 'bg-red-50 dark:bg-red-950/50 border-red-300 text-red-600 dark:text-red-400 font-bold'
                      : 'border-line text-muted hover:text-red-500 hover:border-red-300'
                  }`}
                  title="Clear all 8 slots in local mix"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="text-[11px]">
                    {showClearConfirm ? 'Confirm Clear?' : 'Clear'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
