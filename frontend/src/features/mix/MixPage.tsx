import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Layers,
  Sparkles,
  Share2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Plus,
  RefreshCw,
  Compass,
  ShieldCheck,
  Calendar,
  X,
  Loader2,
  LogIn,
} from 'lucide-react';
import { useUserAuth } from '../../components/UserAuthProvider.tsx';
import {
  useLocalMix,
  ALL_CURSOR_ROLES,
  toShareConfig,
  type MixSlotItem,
  type LocalMixStateV1,
} from './mixStorage.ts';
import {
  getPacks,
  getPackDetail,
  createShare,
  getShare,
  ApiError,
} from '../../lib/api.ts';
import { InteractiveSandbox } from '../../components/InteractiveSandbox.tsx';
import type {
  CursorRole,
  MixRole,
  CursorAsset,
  PackCard,
  PackDetail,
  ShareView,
  ResolvedItem,
} from '../../types/api.ts';
import { isMixRole } from '../../types/api.ts';

const ROLE_DISPLAY_NAMES: Record<MixRole, string> = {
  pointer: 'Normal Select (Pointer)',
  link: 'Link Select',
  text: 'Text Select',
  busy: 'Busy / Wait',
  working: 'Working in Background',
  precision: 'Precision Select',
  unavailable: 'Unavailable',
  move: 'Move / Resize',
};

export const MixPage: React.FC = () => {
  const { code: shareCodeParam } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useUserAuth();

  // Local mix state hook
  const {
    mix,
    assignRole,
    removeRole,
    clearAll,
    overwriteMix,
    setTitle,
    assignedCount,
  } = useLocalMix();

  // --- Shared preset states (When /mix/:code is active) ---
  const [sharedPreset, setSharedPreset] = useState<ShareView | null>(null);
  const [sharedLoading, setSharedLoading] = useState<boolean>(Boolean(shareCodeParam));
  const [sharedError, setSharedError] = useState<{ status: number; message: string } | null>(null);

  // --- Catalog packs for quick assignment picker ---
  const [availablePacks, setAvailablePacks] = useState<PackCard[]>([]);
  const [pickerOpenRole, setPickerOpenRole] = useState<MixRole | null>(null);
  const [selectedPackDetail, setSelectedPackDetail] = useState<PackDetail | null>(null);
  const [loadingPackDetail, setLoadingPackDetail] = useState<boolean>(false);

  // --- Share creation states ---
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [shareSuccess, setShareSuccess] = useState<{ code: string; url: string; expiresAt: string } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Helper to show transient toasts
  const triggerToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // 1. If shareCodeParam is present, fetch the shared preset
  useEffect(() => {
    if (!shareCodeParam) {
      setSharedPreset(null);
      setSharedLoading(false);
      setSharedError(null);
      return;
    }

    let isMounted = true;
    setSharedLoading(true);
    setSharedError(null);

    getShare(shareCodeParam)
      .then((data) => {
        if (isMounted) {
          setSharedPreset(data);
          setSharedLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setSharedLoading(false);
        if (err instanceof ApiError) {
          if (err.status === 401 || err.code === 'AUTH_REQUIRED') {
            setSharedError({
              status: 401,
              message: 'Yêu cầu đăng nhập để xem và nạp bản phối được chia sẻ này.',
            });
          } else if (err.status === 404) {
            setSharedError({
              status: 404,
              message: 'Shared mix not found. The link may be invalid or mistyped.',
            });
          } else if (err.status === 410) {
            setSharedError({
              status: 410,
              message: 'This shared cursor mix has expired. Presets are retained for 90 days.',
            });
          } else {
            setSharedError({
              status: err.status,
              message: err.message,
            });
          }
        } else {
          setSharedError({
            status: 500,
            message: 'Failed to retrieve shared preset from the server.',
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [shareCodeParam]);

  // 2. Load catalog packs for quick role slot picker
  useEffect(() => {
    getPacks({ limit: 12 })
      .then((res) => {
        setAvailablePacks(res.items);
      })
      .catch(() => {
        // Non-blocking catalog load
      });
  }, []);

  // Load pack detail when user selects a pack in the slot picker modal
  const handleSelectPackForSlot = (slug: string) => {
    setLoadingPackDetail(true);
    getPackDetail(slug)
      .then((detail) => {
        setSelectedPackDetail(detail);
      })
      .catch(() => {
        setSelectedPackDetail(null);
      })
      .finally(() => {
        setLoadingPackDetail(false);
      });
  };

  // Assign cursor from selected pack to target slot
  const handleAssignItem = (item: MixSlotItem) => {
    if (!pickerOpenRole) return;
    assignRole(pickerOpenRole, item);
    setPickerOpenRole(null);
    setSelectedPackDetail(null);
    triggerToast(`Added ${item.pack_title} (${item.role_type}) to ${ROLE_DISPLAY_NAMES[pickerOpenRole]}.`);
  };

  // Apply shared preset into local draft per RULES.md F06 (explicit user click)
  const handleUseSharedMix = () => {
    if (!sharedPreset) return;

    const newRoles: Partial<Record<MixRole, MixSlotItem>> = {};
    for (const item of sharedPreset.resolved_items) {
      if (isMixRole(item.target_role)) {
        newRoles[item.target_role] = {
          pack_id: item.pack_id,
          pack_title: item.pack_title,
          pack_slug: '',
          role_type: item.role_type,
          preview_png_url: item.preview_png_url,
          hotspot_x: item.hotspot_x,
          hotspot_y: item.hotspot_y,
        };
      }
    }

    const appliedMix: LocalMixStateV1 = {
      version: 1,
      title: sharedPreset.title || 'Shared Preset Mix',
      roles: newRoles,
      updatedAt: new Date().toISOString(),
    };

    overwriteMix(appliedMix);
    triggerToast('Applied shared preset to your local Mix & Match dock!');
    navigate('/mix');
  };

  // Share local mix
  const handleShareMix = async () => {
    if (assignedCount === 0 || isSharing) return;

    if (!isAuthenticated) {
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      navigate(`/login?returnUrl=${returnUrl}`);
      return;
    }

    setIsSharing(true);
    setShareError(null);
    setShareSuccess(null);

    try {
      const sharePayload = {
        title: mix.title || 'My Custom Mix',
        config: toShareConfig(mix),
      };

      const result = await createShare(sharePayload);
      const fullUrl = `${window.location.origin}/mix/${result.share_code}`;

      setShareSuccess({
        code: result.share_code,
        url: fullUrl,
        expiresAt: result.expires_at,
      });

      // Try automatic copy to clipboard
      try {
        await navigator.clipboard.writeText(fullUrl);
        setCopied(true);
      } catch {
        // Clipboard write might fail without focus
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.code === 'AUTH_REQUIRED') {
          const returnUrl = encodeURIComponent(location.pathname + location.search);
          navigate(`/login?returnUrl=${returnUrl}`);
          return;
        }
        setShareError(err.message);
      } else {
        setShareError('Failed to generate share link. Please try again.');
      }
    } finally {
      setIsSharing(false);
    }
  };

  const copyShareLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      triggerToast('Share link copied to clipboard!');
    } catch {
      triggerToast('Could not copy automatically. Please copy the URL manually.');
    }
  };

  // Build Sandbox role previews mapping for live InteractiveSandbox
  const currentRolesSource = sharedPreset
    ? Object.fromEntries(
        sharedPreset.resolved_items.map((item: ResolvedItem) => [
          item.target_role,
          {
            role_type: item.target_role,
            preview_png_url: item.preview_png_url,
            cursor_file_url: item.preview_png_url,
            hotspot_x: item.hotspot_x,
            hotspot_y: item.hotspot_y,
          } as CursorAsset,
        ])
      )
    : Object.fromEntries(
        Object.entries(mix.roles).map(([targetRole, item]) => [
          targetRole,
          {
            role_type: targetRole as CursorRole,
            preview_png_url: item.preview_png_url,
            cursor_file_url: item.cursor_file_url || item.preview_png_url,
            hotspot_x: item.hotspot_x,
            hotspot_y: item.hotspot_y,
          } as CursorAsset,
        ])
      );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn pb-24">
      {/* Toast Banner */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-20 right-4 z-50 rounded-xl bg-brand text-white text-xs font-semibold px-4 py-2.5 shadow-lg flex items-center gap-2 animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header / Hero section */}
      <div className="rounded-2xl bg-surface border border-line p-6 sm:p-8 shadow-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-soft text-brand text-xs font-semibold">
            <Layers className="w-3.5 h-3.5" />
            Mix &amp; Match
          </div>
          {sharedPreset ? (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted font-medium">
              <Calendar className="w-4 h-4 text-brand" />
              Shared Preset &bull; Read-Only Preview
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Local Draft &bull; Persists in Browser (ccs.mix.v1)
            </div>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink">
          {sharedPreset ? sharedPreset.title : 'Personalized 8-Role Preset Composer'}
        </h1>
        <p className="text-muted text-sm sm:text-base max-w-3xl">
          {sharedPreset
            ? 'Previewing a shared cursor mix preset. Test its interactive behavior in the sandbox below, or apply it to your local workspace.'
            : 'Assemble your ultimate Windows cursor pack by mixing favorite states across published collections. Test live in the sandbox and share your preset with others.'}
        </p>
      </div>

      {/* 2. Loading & Error States for /mix/:code */}
      {sharedLoading && (
        <div className="p-12 rounded-2xl bg-surface border border-line text-center space-y-3">
          <Loader2 className="w-8 h-8 text-brand animate-spin mx-auto" />
          <p className="text-sm font-semibold text-ink">Retrieving shared preset...</p>
        </div>
      )}

      {sharedError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-8 text-center space-y-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/40 text-red-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-red-800 dark:text-red-200">
              {sharedError.status === 401
                ? 'Yêu cầu đăng nhập (HTTP 401)'
                : sharedError.status === 410
                ? 'Preset Expired (HTTP 410)'
                : 'Preset Not Found (HTTP 404)'}
            </h2>
            <p className="text-xs sm:text-sm text-red-700 dark:text-red-300 max-w-md mx-auto">
              {sharedError.message}
            </p>
          </div>
          {sharedError.status === 401 ? (
            <Link
              to={`/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-hover transition-colors shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              Đăng nhập để xem bản phối
            </Link>
          ) : (
            <Link
              to="/mix"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-hover transition-colors shadow-sm"
            >
              Back to Personal Mix Composer
            </Link>
          )}
        </div>
      )}

      {/* 3. Shared Preset Actions Bar (When viewing /mix/:code) */}
      {sharedPreset && !sharedLoading && (
        <div className="rounded-2xl bg-surface border border-line p-5 shadow-card flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs text-muted">Share Code:</span>
            <span className="font-mono font-bold text-brand ml-2">{sharedPreset.share_code}</span>
            <span className="text-muted text-xs ml-4">
              Expires: {new Date(sharedPreset.expires_at).toLocaleDateString()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUseSharedMix}
              className="px-4 py-2.5 rounded-xl bg-brand text-white font-bold text-xs hover:bg-brand-hover shadow-card transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Use This Mix (Apply to Local)
            </button>
            <button
              type="button"
              onClick={() => copyShareLink(window.location.href)}
              className="px-3.5 py-2.5 rounded-xl bg-raised border border-line text-ink font-semibold text-xs hover:bg-line/40 transition-colors flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Link
            </button>
          </div>
        </div>
      )}

      {/* 4. Local Mix Title & Toolbar (When editing /mix) */}
      {!shareCodeParam && (
        <div className="rounded-2xl bg-surface border border-line p-5 shadow-card flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[240px]">
            <label htmlFor="mix-title-input" className="block text-[11px] font-semibold text-muted mb-1">
              Mix Preset Title
            </label>
            <input
              id="mix-title-input"
              type="text"
              value={mix.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Minimalist Retro Workstation"
              className="w-full max-w-md px-3.5 py-2 text-sm font-bold text-ink rounded-xl border border-line bg-raised focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={assignedCount === 0 || isSharing}
              onClick={handleShareMix}
              className="px-4 py-2.5 rounded-xl bg-brand text-white font-bold text-xs hover:bg-brand-hover shadow-card transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSharing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Link...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  Share Mix Preset
                </>
              )}
            </button>

            {assignedCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="px-3 py-2.5 rounded-xl bg-raised border border-line text-muted hover:text-red-500 font-semibold text-xs transition-colors flex items-center gap-1.5"
                title="Clear all 8 slots"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Share Generated Dialog */}
      {shareSuccess && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-5 shadow-card space-y-3 animate-fadeIn"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Mix Preset Created &bull; Code: {shareSuccess.code}
            </div>
            <button
              type="button"
              onClick={() => setShareSuccess(null)}
              className="text-muted hover:text-ink"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted">
            Share this link with anyone. Valid for 90 days (expires{' '}
            {new Date(shareSuccess.expiresAt).toLocaleDateString()}).
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareSuccess.url}
              className="flex-1 px-3 py-2 text-xs font-mono rounded-xl border border-line bg-surface text-ink"
            />
            <button
              type="button"
              onClick={() => copyShareLink(shareSuccess.url)}
              className="px-3.5 py-2 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-hover flex items-center gap-1.5 shrink-0"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>
      )}

      {shareError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700">
          {shareError}
        </div>
      )}

      {/* 5. 8-Slot Mixer Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-ink">8 Product Roles Configuration</h2>
            <p className="text-xs text-muted">
              Each slot can hold a cursor item from any published pack in the catalog.
            </p>
          </div>
          <span className="text-xs font-bold font-mono px-3 py-1 rounded-full bg-brand-soft text-brand">
            {assignedCount} / 8 Configured
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ALL_CURSOR_ROLES.map((role) => {
            const item = sharedPreset
              ? sharedPreset.resolved_items.find((r) => r.target_role === role)
              : mix.roles[role];
            const roleName = ROLE_DISPLAY_NAMES[role];

            return (
              <div
                key={role}
                id={`slot-${role}`}
                className={`rounded-2xl border p-4 space-y-3 transition-all ${
                  item
                    ? 'border-brand/40 bg-surface shadow-card'
                    : 'border-dashed border-line bg-raised/30'
                }`}
              >
                {/* Slot Header */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink truncate max-w-[180px]">
                    {roleName}
                  </span>
                  {item ? (
                    <span className="w-2 h-2 rounded-full bg-brand" />
                  ) : (
                    <span className="text-[10px] text-muted font-mono uppercase">Empty</span>
                  )}
                </div>

                {/* Slot Content */}
                {item ? (
                  <div className="flex items-center gap-3 py-2">
                    <div className="w-12 h-12 rounded-xl bg-raised border border-line flex items-center justify-center p-1.5 shadow-inner">
                      <img
                        src={item.preview_png_url}
                        alt={`${roleName} cursor`}
                        className="w-8 h-8 object-contain drop-shadow"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-ink truncate">
                        {item.pack_title}
                      </span>
                      <span className="text-[10px] text-muted">
                        Role: <span className="font-semibold text-brand">{item.role_type}</span>
                      </span>
                      <span className="text-[10px] text-muted font-mono">
                        Hotspot: ({item.hotspot_x}, {item.hotspot_y})
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-surface border border-line flex items-center justify-center text-muted">
                      <Plus className="w-5 h-5" />
                    </div>
                    <p className="text-[11px] text-muted max-w-[160px]">
                      Slot is empty. Pick a cursor from any pack.
                    </p>
                  </div>
                )}

                {/* Slot Actions (Local edit only) */}
                {!sharedPreset && (
                  <div className="pt-2 border-t border-line/60 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerOpenRole(role)}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-raised text-ink hover:bg-brand-soft hover:text-brand text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                    >
                      {item ? (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          Replace
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          Assign
                        </>
                      )}
                    </button>

                    {item && (
                      <button
                        type="button"
                        onClick={() => removeRole(role)}
                        className="py-1.5 px-2.5 rounded-lg border border-line text-muted hover:text-red-500 hover:border-red-300 text-xs transition-colors"
                        title="Remove cursor from slot"
                        aria-label={`Remove cursor from ${roleName}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. Live Interactive Sandbox Integration */}
      <section className="space-y-4 pt-4 border-t border-line">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-ink">Interactive Mix Sandbox</h2>
            <p className="text-xs text-muted">
              Hover across the 8 zones below to test your current mix in real time.
            </p>
          </div>
          <span className="text-xs text-muted">
            Independent Light/Dark Sandbox Mode
          </span>
        </div>

        <InteractiveSandbox rolePreviews={currentRolesSource} />
      </section>

      {/* 7. Catalog Quick-Picker Modal */}
      {pickerOpenRole && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="picker-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
        >
          <div className="bg-canvas border border-line rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-brand" />
                <h3 id="picker-modal-title" className="font-bold text-base text-ink">
                  Assign Cursor for: <span className="text-brand">{ROLE_DISPLAY_NAMES[pickerOpenRole]}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPickerOpenRole(null);
                  setSelectedPackDetail(null);
                }}
                className="p-1 rounded-lg text-muted hover:text-ink hover:bg-raised transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step A: Choose pack if none selected */}
            {!selectedPackDetail ? (
              <div className="space-y-3">
                <p className="text-xs text-muted">Select a published cursor pack to view its items:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availablePacks.map((pack) => (
                    <button
                      key={pack.id}
                      type="button"
                      disabled={loadingPackDetail}
                      onClick={() => handleSelectPackForSlot(pack.slug)}
                      className="p-3 rounded-xl border border-line bg-surface hover:border-brand hover:scale-[1.01] text-left transition-all flex items-center gap-3 group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-raised flex items-center justify-center p-1 shrink-0">
                        <img
                          src={pack.pointer.preview_png_url}
                          alt={pack.title}
                          className="w-7 h-7 object-contain"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-ink group-hover:text-brand truncate">
                          {pack.title}
                        </span>
                        <span className="text-[10px] text-muted">
                          {pack.category.name} &bull; 8 states
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Step B: Choose item from selected pack */
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-line">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Pack:</span>
                    <span className="text-xs font-bold text-ink">{selectedPackDetail.title}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPackDetail(null)}
                    className="text-xs text-brand hover:underline"
                  >
                    &larr; Choose different pack
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {selectedPackDetail.cursor_items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        handleAssignItem({
                          pack_id: selectedPackDetail.id,
                          pack_title: selectedPackDetail.title,
                          pack_slug: selectedPackDetail.slug,
                          role_type: item.role_type,
                          preview_png_url: item.preview_png_url,
                          cursor_file_url: item.cursor_file_url,
                          hotspot_x: item.hotspot_x,
                          hotspot_y: item.hotspot_y,
                        })
                      }
                      className="p-3 rounded-xl border border-line bg-surface hover:border-brand hover:bg-brand-soft/20 flex flex-col items-center justify-center text-center space-y-2 group transition-all"
                    >
                      <div className="w-10 h-10 rounded-lg bg-raised flex items-center justify-center p-1">
                        <img
                          src={item.preview_png_url}
                          alt={item.role_type}
                          className="w-7 h-7 object-contain"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      </div>
                      <span className="text-xs font-bold text-ink group-hover:text-brand">
                        {item.role_type}
                      </span>
                      <span className="text-[10px] text-muted font-mono">
                        ({item.hotspot_x}, {item.hotspot_y})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
