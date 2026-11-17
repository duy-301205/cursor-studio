import React, { useState, useMemo } from 'react';
import {
  Sun,
  Moon,
  Folder,
  ExternalLink,
  Type,
  Loader2,
  Clock,
  Crosshair,
  Ban,
  Move,
  Info,
} from 'lucide-react';
import type { CursorAsset, CursorRole } from '../types/api';

export interface InteractiveSandboxProps {
  rolePreviews: Partial<Record<CursorRole, CursorAsset>>;
  initialMode?: 'light' | 'dark';
  onRoleInspect?: (role: CursorRole) => void;
}

interface RoleConfig {
  role: CursorRole;
  label: string;
  nativeFallback: string;
  description: string;
  icon: React.ElementType;
}

const ROLES_CONFIG: readonly RoleConfig[] = [
  {
    role: 'pointer',
    label: 'Normal Select',
    nativeFallback: 'auto',
    description: 'Windows desktop folder / primary click',
    icon: Folder,
  },
  {
    role: 'link',
    label: 'Link Select',
    nativeFallback: 'pointer',
    description: 'Hyperlink & interactive elements',
    icon: ExternalLink,
  },
  {
    role: 'text',
    label: 'Text Select',
    nativeFallback: 'text',
    description: 'Editable input fields & documents',
    icon: Type,
  },
  {
    role: 'busy',
    label: 'Busy / Wait',
    nativeFallback: 'wait',
    description: 'System waiting / blocked operations',
    icon: Clock,
  },
  {
    role: 'working',
    label: 'Working in Background',
    nativeFallback: 'progress',
    description: 'Background tasks & progress loading',
    icon: Loader2,
  },
  {
    role: 'precision',
    label: 'Precision Select',
    nativeFallback: 'crosshair',
    description: 'Target crosshair & graphics canvas',
    icon: Crosshair,
  },
  {
    role: 'unavailable',
    label: 'Unavailable',
    nativeFallback: 'not-allowed',
    description: 'Disabled buttons & restricted actions',
    icon: Ban,
  },
  {
    role: 'move',
    label: 'Move / Resize',
    nativeFallback: 'move',
    description: 'Draggable windows & movable items',
    icon: Move,
  },
] as const;

export function InteractiveSandbox({
  rolePreviews,
  initialMode = 'light',
  onRoleInspect,
}: InteractiveSandboxProps): React.ReactElement {
  // Independent sandbox theme state (RULES.md F03 — completely isolated from website theme)
  const [sandboxMode, setSandboxMode] = useState<'light' | 'dark'>(initialMode);
  const [activeZone, setActiveZone] = useState<CursorRole | null>(null);

  const toggleSandboxTheme = (): void => {
    setSandboxMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Helper to compute CSS cursor string with mandatory native fallback
  const getCursorStyle = useMemo(() => {
    return (role: CursorRole, fallback: string): string => {
      const asset = rolePreviews[role];
      if (asset?.preview_png_url) {
        const x = Math.max(0, Math.min(47, Math.round(asset.hotspot_x)));
        const y = Math.max(0, Math.min(47, Math.round(asset.hotspot_y)));
        return `url("${asset.preview_png_url}") ${x} ${y}, ${fallback}`;
      }
      return fallback;
    };
  }, [rolePreviews]);

  // Theme-specific styling classes for the mock Windows canvas
  const isDark = sandboxMode === 'dark';
  const themeClasses = isDark
    ? 'bg-slate-900 border-slate-700 text-slate-100'
    : 'bg-slate-100 border-slate-300 text-slate-800';

  const zoneCardClasses = isDark
    ? 'bg-slate-800/90 border-slate-700/80 hover:border-violet-500/50'
    : 'bg-white border-slate-200/90 hover:border-violet-500/50';

  const titleBarClasses = isDark
    ? 'bg-slate-950 border-slate-800 text-slate-300'
    : 'bg-slate-200/80 border-slate-300 text-slate-700';

  return (
    <div
      data-sandbox-theme={sandboxMode}
      className={`rounded-card border transition-colors duration-200 overflow-hidden shadow-card ${themeClasses}`}
    >
      {/* ============================================================ */}
      {/* 1. Sandbox Header & Mock OS Titlebar                         */}
      {/* ============================================================ */}
      <div
        className={`px-4 sm:px-6 py-3 border-b flex items-center justify-between gap-4 transition-colors ${titleBarClasses}`}
      >
        <div className="flex items-center gap-3">
          {/* Mock OS Window Controls */}
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="w-3 h-3 rounded-full bg-red-400/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-400/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-400/80 inline-block" />
          </div>
          <span className="text-xs font-bold font-mono tracking-wide">
            Windows Interactive Cursor Sandbox
          </span>
        </div>

        {/* Independent Sandbox Theme Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium opacity-70 hidden sm:inline">
            Sandbox Theme: {sandboxMode === 'light' ? 'Light' : 'Dark'}
          </span>
          <button
            type="button"
            onClick={toggleSandboxTheme}
            aria-label={`Toggle Sandbox theme to ${sandboxMode === 'light' ? 'dark' : 'light'}`}
            className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isDark
                ? 'bg-slate-800 border-slate-600 text-amber-300 hover:bg-slate-700'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm'
            }`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden md:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. Helper Guidance Banner                                    */}
      {/* ============================================================ */}
      <div
        className={`px-4 sm:px-6 py-2.5 border-b text-xs flex items-center justify-between gap-3 ${
          isDark ? 'bg-slate-950/60 border-slate-800/80 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}
      >
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span>
            Hover over any of the 8 simulated zones below to test the corresponding cursor state and native fallback.
          </span>
        </div>
        {activeZone && (
          <span className="font-mono font-semibold text-violet-400 shrink-0">
            Active: [{activeZone}]
          </span>
        )}
      </div>

      {/* ============================================================ */}
      {/* 3. The 8 Interactive Zones Grid                              */}
      {/* ============================================================ */}
      <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {ROLES_CONFIG.map(({ role, label, nativeFallback, description, icon: Icon }) => {
          const asset = rolePreviews[role];
          const cursorValue = getCursorStyle(role, nativeFallback);

          return (
            <div
              key={role}
              data-cursor-role={role}
              style={{ cursor: cursorValue }}
              onMouseEnter={() => {
                setActiveZone(role);
                onRoleInspect?.(role);
              }}
              onMouseLeave={() => {
                setActiveZone((prev) => (prev === role ? null : prev));
              }}
              className={`group relative rounded-xl border p-4 flex flex-col justify-between min-h-[140px] transition-all duration-150 shadow-sm ${zoneCardClasses}`}
            >
              {/* Header: Role Name & State Badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-xs tracking-tight">
                    <Icon className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span>{label}</span>
                  </div>
                  <span className="font-mono text-[10px] opacity-60 block">
                    [{role}]
                  </span>
                </div>

                {asset ? (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-semibold shrink-0">
                    ({asset.hotspot_x},{asset.hotspot_y})
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400 font-medium shrink-0">
                    Default
                  </span>
                )}
              </div>

              {/* Interactive Zone Content Preview */}
              <div className="my-2 py-3 px-2.5 rounded-lg border border-dashed border-slate-500/30 flex items-center justify-between text-xs select-none">
                <span className="opacity-75 truncate">{description}</span>
                {role === 'text' && (
                  <span className="font-mono text-violet-400 animate-pulse font-bold">|</span>
                )}
                {role === 'working' && (
                  <div className="w-12 h-1.5 rounded-full bg-violet-500/30 overflow-hidden">
                    <div className="w-2/3 h-full bg-violet-400 rounded-full animate-pulse" />
                  </div>
                )}
                {role === 'busy' && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                )}
                {role === 'link' && (
                  <span className="underline text-violet-400 text-[11px] font-semibold">Click</span>
                )}
              </div>

              {/* Footer: Fallback keyword indicator */}
              <div className="flex items-center justify-between text-[11px] opacity-60 pt-1 border-t border-slate-500/20">
                <span>Fallback:</span>
                <span className="font-mono font-medium">{nativeFallback}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default InteractiveSandbox;
