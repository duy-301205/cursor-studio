import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  HelpCircle,
  PenTool,
  ArrowUpDown,
  ArrowLeftRight,
  MoveDiagonal,
  MoveDiagonal2,
  ArrowUp,
  MapPin,
  User,
} from 'lucide-react';
import type { CursorAsset, CursorRole } from '../types/api';
import { SANDBOX_17_ROLES, type SandboxRoleDefinition } from '../types/sandboxRoles.ts';
import { getAdminApiBaseUrl } from '../lib/adminApi.ts';
import { getApiBaseUrl } from '../lib/api.ts';

export interface InteractiveSandboxProps {
  rolePreviews: Partial<Record<CursorRole, CursorAsset>>;
  initialMode?: 'light' | 'dark';
  onRoleInspect?: (role: CursorRole) => void;
  isAdmin?: boolean;
}

export interface RoleConfig extends SandboxRoleDefinition {
  icon: React.ElementType;
}

const ROLE_ICONS: Record<CursorRole, React.ElementType> = {
  pointer: Folder,
  help: HelpCircle,
  working: Loader2,
  busy: Clock,
  precision: Crosshair,
  text: Type,
  handwriting: PenTool,
  unavailable: Ban,
  resize_vertical: ArrowUpDown,
  resize_horizontal: ArrowLeftRight,
  resize_diagonal_nwse: MoveDiagonal,
  resize_diagonal_nesw: MoveDiagonal2,
  move: Move,
  alternate: ArrowUp,
  link: ExternalLink,
  location: MapPin,
  person: User,
};

export const ROLES_CONFIG: readonly RoleConfig[] = SANDBOX_17_ROLES.map((def) => ({
  ...def,
  icon: ROLE_ICONS[def.role],
}));

function animationEndpoint(asset: CursorAsset | undefined, role: CursorRole): string | null {
  if (!asset) return null;
  if (!asset.cursor_file_url) {
    const adminPack = asset.preview_png_url.match(
      /^\/api\/v1\/admin\/packs\/([1-9]\d{0,15})\/assets\/[0-9a-f-]+\/content$/
    )?.[1];
    return adminPack ? `${getAdminApiBaseUrl()}/packs/${adminPack}/roles/${role}/animation` : null;
  }
  const cursorPath = URL.canParse(asset.cursor_file_url, window.location.origin)
    ? new URL(asset.cursor_file_url, window.location.origin).pathname
    : '';
  if (!cursorPath.endsWith('.ani')) return null;
  const publicPack = cursorPath.match(
    /\/(?:packs\/([1-9]\d{0,15})\/assets\/[^/]+\/cursor|managed\/([1-9]\d{0,15})\/[^/]+)\.ani$/
  );
  const packId = publicPack?.[1] ?? publicPack?.[2];
  return packId ? `${getApiBaseUrl()}/packs/${packId}/assets/${role}/animation` : null;
}

const PREVIEW_SIZE = 32;

interface CursorPreview {
  asset: CursorAsset;
  source: string;
  width: number;
  height: number;
  animated: boolean;
}

export function InteractiveSandbox({
  rolePreviews,
  initialMode = 'light',
  onRoleInspect,
  isAdmin = false,
}: InteractiveSandboxProps): React.ReactElement {
  // Independent sandbox theme state (RULES.md F03 — completely isolated from website theme)
  const [sandboxMode, setSandboxMode] = useState<'light' | 'dark'>(initialMode);
  const [activeZone, setActiveZone] = useState<CursorRole | null>(null);
  const [preview, setPreview] = useState<CursorPreview | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const previewImage = useRef<HTMLImageElement>(null);
  const activeAsset = activeZone ? rolePreviews[activeZone] : undefined;
  const endpoint = activeZone ? animationEndpoint(activeAsset, activeZone) : null;
  const renderedPreview = preview?.asset === activeAsset ? preview : null;
  const hotspotX = renderedPreview
    ? renderedPreview.asset.hotspot_x * PREVIEW_SIZE / renderedPreview.width
    : 0;
  const hotspotY = renderedPreview
    ? renderedPreview.asset.hotspot_y * PREVIEW_SIZE / renderedPreview.height
    : 0;

  useEffect(() => {
    if (!activeAsset?.preview_png_url) return;
    const asset = activeAsset;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const stop = () => setActiveZone(null);

    const showImage = async (source: string, animated: boolean) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      if (!controller.signal.aborted && image.naturalWidth && image.naturalHeight) {
        setPreview({
          asset, source, width: image.naturalWidth, height: image.naturalHeight, animated,
        });
      }
    };

    const load = async () => {
      try {
        await showImage(asset.preview_png_url, false);
      } catch {
        // The zone still has its CSS cursor fallback.
      }
      if (!endpoint || motion.matches || controller.signal.aborted) return;
      try {
        const response = await fetch(endpoint, {
          credentials: endpoint.startsWith(getAdminApiBaseUrl() + '/') ? 'include' : 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok || response.headers.get('content-type') !== 'image/png') return;
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        await showImage(objectUrl, true);
      } catch {
        // Keep the static image if the animation cannot be loaded.
      }
    };
    void load();
    window.addEventListener('blur', stop);
    motion.addEventListener('change', stop);
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPreview(null);
      window.removeEventListener('blur', stop);
      motion.removeEventListener('change', stop);
    };
  }, [endpoint, activeAsset]);

  const movePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointer.current = { x: event.clientX, y: event.clientY };
    if (previewImage.current) {
      previewImage.current.style.left = `${event.clientX - hotspotX}px`;
      previewImage.current.style.top = `${event.clientY - hotspotY}px`;
    }
  };

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
            Rê chuột vào bất kỳ ô nào trong đủ 17 vị trí Windows bên dưới để thử con trỏ tương ứng và tọa độ hotspot.
          </span>
        </div>
        {activeZone && (
          <span className="font-mono font-semibold text-violet-400 shrink-0">
            Active: [{activeZone}]
          </span>
        )}
      </div>

      {/* ============================================================ */}
      {/* 3. The 17 Interactive Zones Grid (Canonical Windows Order)    */}
      {/* ============================================================ */}
      <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {ROLES_CONFIG.map(({ role, slot, label, nativeFallback, description, icon: Icon }) => {
          const asset = rolePreviews[role];
          const isAssigned = Boolean(asset && asset.preview_png_url);
          const cursorValue = getCursorStyle(role, nativeFallback);

          return (
            <div
              key={role}
              data-cursor-role={role}
              data-testid={`sandbox-zone-${role}`}
              style={{ cursor: activeZone === role && renderedPreview ? 'none' : cursorValue }}
              onPointerEnter={(event) => {
                if (event.pointerType === 'touch') return;
                movePointer(event);
                setActiveZone(role);
                onRoleInspect?.(role);
              }}
              onPointerMove={movePointer}
              onPointerLeave={() => {
                setActiveZone((prev) => (prev === role ? null : prev));
              }}
              className={`group relative rounded-xl border p-4 flex flex-col justify-between min-h-[140px] transition-all duration-150 shadow-sm ${zoneCardClasses}`}
            >
              {/* Header: Role Name, Slot & Hotspot/Status Badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-xs tracking-tight truncate">
                    <Icon className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="truncate">{label}</span>
                  </div>
                  <span className="font-mono text-[10px] opacity-60 block">
                    [{role}] ({slot})
                  </span>
                </div>

                {isAssigned && asset ? (
                  <span
                    data-testid={`hotspot-badge-${role}`}
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-semibold shrink-0"
                  >
                    ({asset.hotspot_x},{asset.hotspot_y})
                  </span>
                ) : isAdmin ? (
                  <span
                    data-testid={`unassigned-badge-${role}`}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-semibold shrink-0"
                  >
                    Chưa gán
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
                {role === 'location' && (
                  <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                {role === 'person' && (
                  <User className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                )}
                {role === 'help' && (
                  <span className="text-violet-400 text-[11px] font-bold">?</span>
                )}
                {role === 'handwriting' && (
                  <PenTool className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                {role === 'resize_vertical' && (
                  <ArrowUpDown className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                )}
                {role === 'resize_horizontal' && (
                  <ArrowLeftRight className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                )}
                {role === 'resize_diagonal_nwse' && (
                  <MoveDiagonal className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                )}
                {role === 'resize_diagonal_nesw' && (
                  <MoveDiagonal2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                )}
                {role === 'alternate' && (
                  <ArrowUp className="w-3.5 h-3.5 text-violet-400 shrink-0" />
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

      {/* Floating Animated Cursor Preview (if active) */}
      {renderedPreview && createPortal(
        <img
          ref={previewImage}
          src={renderedPreview.source}
          alt=""
          aria-hidden="true"
          data-sandbox-cursor={renderedPreview.animated ? 'animated' : 'static'}
          className="pointer-events-none fixed z-50 max-w-none [image-rendering:pixelated]"
          style={{
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
            left: pointer.current.x - hotspotX,
            top: pointer.current.y - hotspotY,
          }}
          onError={() => setPreview(null)}
        />,
        document.body
      )}
    </div>
  );
}

export default InteractiveSandbox;
