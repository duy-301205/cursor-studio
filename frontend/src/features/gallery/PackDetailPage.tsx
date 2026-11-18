import React, { useState, useEffect, useMemo } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileText,
  ShieldCheck,
  MousePointer,
  HelpCircle,
  Plus,
} from 'lucide-react';
import { apiClient, ApiError } from '../../lib/api';
import { InteractiveSandbox } from '../../components/InteractiveSandbox';
import { useLocalMix } from '../mix/mixStorage';
import type { PackDetail, CursorAsset, CursorRole, PackCursor } from '../../types/api';

const ROLE_DISPLAY_NAMES: Record<CursorRole, { name: string; slot: string; description: string }> = {
  pointer: { name: 'Normal Select', slot: 'Arrow', description: 'Standard desktop pointer' },
  link: { name: 'Link Select', slot: 'Hand', description: 'Clickable links and buttons' },
  text: { name: 'Text Select', slot: 'IBeam', description: 'Text caret and selection' },
  busy: { name: 'Busy', slot: 'Wait', description: 'System waiting or processing' },
  working: { name: 'Working in Background', slot: 'AppStarting', description: 'Background activity' },
  precision: { name: 'Precision Select', slot: 'Crosshair', description: 'Fine pixel targeting' },
  unavailable: { name: 'Unavailable', slot: 'No', description: 'Disabled / forbidden actions' },
  move: { name: 'Move / Resize', slot: 'SizeAll', description: 'Omnidirectional window move' },
};

export function PackDetailPage(): React.ReactElement {
  const { slug } = useParams<{ slug: string }>();

  const [pack, setPack] = useState<PackDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);

  // Download state
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  // Mix & Match state
  const { assignRole, mix } = useLocalMix();
  const [addedRoleToast, setAddedRoleToast] = useState<string | null>(null);

  // Fetch pack details by slug
  useEffect(() => {
    if (!slug) {
      setIsNotFound(true);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    async function loadDetail(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);
      setIsNotFound(false);

      try {
        const data = await apiClient.getPackDetail(slug!, { signal: controller.signal });
        if (isMounted) {
          setPack(data);
        }
      } catch (err: unknown) {
        if (!isMounted || (err as Error)?.name === 'AbortError') return;

        if (err instanceof ApiError && err.status === 404) {
          setIsNotFound(true);
        } else {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load pack details.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [slug]);

  // Map 8 cursor items to rolePreviews map for the sandbox
  const rolePreviews = useMemo<Partial<Record<CursorRole, CursorAsset>>>(() => {
    if (!pack?.cursor_items) return {};
    const map: Partial<Record<CursorRole, CursorAsset>> = {};
    for (const item of pack.cursor_items) {
      map[item.role_type] = item;
    }
    return map;
  }, [pack?.cursor_items]);

  // Handle ZIP Download via backend API
  const handleDownload = async (): Promise<void> => {
    if (!pack || isDownloading) return;

    setIsDownloading(true);
    setDownloadError(null);
    setDownloadSuccess(false);

    try {
      const { blob, filename } = await apiClient.downloadPackZip(pack.id);

      // Trigger standard browser download
      const objectUrl = window.URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = objectUrl;
      downloadLink.download = filename || `${pack.slug}-windows.zip`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      window.URL.revokeObjectURL(objectUrl);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 5000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setDownloadError('This cursor pack is incomplete and cannot be packaged as a 15-slot ZIP.');
        } else if (err.status === 502) {
          setDownloadError('Storage service temporarily unavailable. Please try again shortly.');
        } else if (err.status === 429) {
          setDownloadError(`Download rate limit exceeded. Please wait ${err.retryAfter || 60}s before retrying.`);
        } else {
          setDownloadError(err.message || 'Download failed.');
        }
      } else {
        setDownloadError(err instanceof Error ? err.message : 'Download failed.');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // ================================================================
  // Loading State
  // ================================================================
  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-6 w-32 bg-raised rounded" />
        <div className="h-48 rounded-card bg-raised" />
        <div className="h-64 rounded-card bg-raised" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-raised" />
          ))}
        </div>
      </div>
    );
  }

  // ================================================================
  // 404 Not Found State
  // ================================================================
  if (isNotFound) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-raised border border-line flex items-center justify-center text-muted">
          <HelpCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-ink">Cursor Pack Not Found</h2>
        <p className="text-sm text-muted max-w-md">
          The cursor pack &ldquo;{slug}&rdquo; does not exist or has been unpublished from the catalog.
        </p>
        <NavLink
          to="/packs"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-hover transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Explore
        </NavLink>
      </div>
    );
  }

  // ================================================================
  // Generic Error State
  // ================================================================
  if (errorMessage || !pack) {
    return (
      <div className="p-8 rounded-card bg-danger/10 border border-danger/30 text-center space-y-4 py-16">
        <AlertTriangle className="w-10 h-10 text-danger mx-auto" />
        <h3 className="text-xl font-bold text-ink">Failed to load cursor pack</h3>
        <p className="text-sm text-muted max-w-md mx-auto">{errorMessage}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-hover transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reload Page
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-fadeIn">
      {/* Navigation Breadcrumb */}
      <div>
        <NavLink
          to="/packs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-brand transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Gallery
        </NavLink>
        {addedRoleToast && (
          <div
            role="status"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-semibold shadow-md animate-fadeIn"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{addedRoleToast}</span>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 1. Pack Hero Overview & Download Section                     */}
      {/* ============================================================ */}
      <section className="rounded-card bg-surface border border-line p-6 sm:p-10 shadow-card">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            {/* Category & Status Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-pill bg-brand-soft text-brand text-xs font-semibold">
                {pack.category.name}
              </span>
              {pack.is_animated && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-pill bg-violet-500/10 text-violet-500 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  Animated Scheme
                </span>
              )}
              {pack.is_premium ? (
                <span className="px-3 py-1 rounded-pill bg-warning/20 text-warning text-xs font-semibold">
                  Premium
                </span>
              ) : (
                <span className="px-3 py-1 rounded-pill bg-raised text-muted border border-line text-xs font-semibold">
                  Free Windows Asset
                </span>
              )}
            </div>

            {/* Pack Title & Description */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink">
              {pack.title}
            </h1>
            <p className="text-muted text-base leading-relaxed">
              {pack.description}
            </p>

            {/* Metadata Stats */}
            <div className="flex flex-wrap items-center gap-6 text-xs text-muted pt-2 border-t border-line/60">
              <div className="flex items-center gap-1.5">
                <Download className="w-4 h-4" />
                <span>{pack.download_count.toLocaleString()} downloads</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                <span>15-slot Registry scheme (Install.inf)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>8 verified product roles</span>
              </div>
            </div>
          </div>

          {/* Primary CTA: Download ZIP Package */}
          <div className="w-full lg:w-auto flex flex-col items-stretch lg:items-end gap-3 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              aria-label="Download Windows Quick-Install ZIP package"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm shadow-md hover:shadow-lg transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Download className="w-5 h-5 shrink-0" />
              <span>{isDownloading ? 'Generating ZIP package...' : 'Download Windows Pack'}</span>
            </button>

            {/* Download Status Notification */}
            {downloadSuccess && (
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>ZIP downloaded! See install guide below.</span>
              </div>
            )}
            {downloadError && (
              <div className="inline-flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-semibold max-w-xs text-right">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{downloadError}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. Interactive Sandbox Preview Area (8 Zones)                */}
      {/* ============================================================ */}
      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-ink">Interactive Sandbox</h2>
          <p className="text-sm text-muted">
            Test all 8 cursor states in the interactive environment with independent Light/Dark simulation.
          </p>
        </div>

        <InteractiveSandbox rolePreviews={rolePreviews} />
      </section>

      {/* ============================================================ */}
      {/* 3. 8 Cursor Role Items Gallery                               */}
      {/* ============================================================ */}
      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-ink">Included Cursors (8 Roles)</h2>
          <p className="text-sm text-muted">
            Each cursor file is encoded according to the official Windows DIB CUR binary format.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pack.cursor_items.map((item: PackCursor) => {
            const roleInfo = ROLE_DISPLAY_NAMES[item.role_type] || {
              name: item.role_type,
              slot: item.role_type,
              description: 'Custom role asset',
            };

            return (
              <div
                key={item.id}
                className="rounded-xl border border-line bg-surface p-4 flex flex-col justify-between space-y-3 shadow-sm hover:border-brand/40 transition-colors"
              >
                {/* Role Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-ink">{roleInfo.name}</h3>
                    <span className="text-[11px] text-muted font-mono">Registry: {roleInfo.slot}</span>
                  </div>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-brand-soft text-brand font-semibold">
                    ({item.hotspot_x},{item.hotspot_y})
                  </span>
                </div>

                {/* 32/48px Thumbnail on Checkerboard Background */}
                <div className="w-full aspect-square rounded-lg bg-raised flex items-center justify-center relative overflow-hidden border border-line/50">
                  <div
                    className="absolute inset-0 opacity-40 pointer-events-none"
                    style={{
                      backgroundImage: 'radial-gradient(var(--checker-b, #E2E6EF) 1px, transparent 1px)',
                      backgroundSize: '10px 10px',
                    }}
                  />
                  <img
                    src={item.preview_png_url}
                    alt={`${item.role_type} preview`}
                    loading="lazy"
                    className="w-12 h-12 object-contain drop-shadow z-10"
                  />
                </div>

                {/* Role Footnote & Add to Mix Action */}
                <div className="pt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-muted">
                  <span>{item.cursor_file_url.endsWith('.ani') ? '.ani dynamic' : '.cur static'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      assignRole(item.role_type, {
                        pack_id: pack.id,
                        pack_title: pack.title,
                        pack_slug: pack.slug,
                        role_type: item.role_type,
                        preview_png_url: item.preview_png_url,
                        cursor_file_url: item.cursor_file_url,
                        hotspot_x: item.hotspot_x,
                        hotspot_y: item.hotspot_y,
                      });
                      setAddedRoleToast(`Added ${roleInfo.name} to Mix & Match dock!`);
                      setTimeout(() => setAddedRoleToast(null), 3000);
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                      mix.roles[item.role_type]?.pack_id === pack.id
                        ? 'bg-brand text-white'
                        : 'bg-brand-soft text-brand hover:bg-brand/20'
                    }`}
                    title={`Add this ${roleInfo.name} cursor to your Mix & Match dock`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>{mix.roles[item.role_type]?.pack_id === pack.id ? 'In Mix' : 'Add to Mix'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. Authentic Windows Quick-Install Guide                     */}
      {/* ============================================================ */}
      <section className="rounded-card bg-surface border border-line p-6 sm:p-8 space-y-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
            <MousePointer className="w-4 h-4" />
            <span>Windows Installation Guide</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink">How to Install on Windows 10 &amp; 11</h2>
          <p className="text-xs text-muted max-w-2xl">
            Modern web browsers cannot modify your operating system Registry directly. Our quick installer provides a native Windows <code className="font-mono text-brand">Install.inf</code> scheme that sets up your cursor scheme in 4 simple steps:
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-raised border border-line/80 space-y-2">
            <span className="w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold font-mono">1</span>
            <h3 className="font-bold text-sm text-ink">Extract ZIP Package</h3>
            <p className="text-xs text-muted leading-relaxed">
              Click &ldquo;Download Windows Pack&rdquo; above and extract the downloaded ZIP folder to a permanent location.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-raised border border-line/80 space-y-2">
            <span className="w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold font-mono">2</span>
            <h3 className="font-bold text-sm text-ink">Right-Click Install.inf</h3>
            <p className="text-xs text-muted leading-relaxed">
              Find <code className="font-mono text-brand">Install.inf</code>. Right-click and choose <strong>Install</strong> (On Windows 11: select <em>Show more options</em> first).
            </p>
          </div>

          <div className="p-4 rounded-xl bg-raised border border-line/80 space-y-2">
            <span className="w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold font-mono">3</span>
            <h3 className="font-bold text-sm text-ink">Accept UAC Prompt</h3>
            <p className="text-xs text-muted leading-relaxed">
              When Windows asks for permission to install the scheme, click <strong>Yes</strong>. Windows will copy cursor files to your system folder.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-raised border border-line/80 space-y-2">
            <span className="w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold font-mono">4</span>
            <h3 className="font-bold text-sm text-ink">Apply Scheme</h3>
            <p className="text-xs text-muted leading-relaxed">
              Open <em>Mouse Properties &gt; Pointers</em>, select <strong>{pack.title}</strong> from the Scheme dropdown, and click <strong>Apply</strong>.
            </p>
          </div>
        </div>

        {/* Security / Honesty Callout */}
        <div className="p-4 rounded-xl bg-brand-soft border border-brand/20 flex items-start gap-3 text-xs text-muted">
          <ShieldCheck className="w-5 h-5 text-brand shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-ink">Safe &amp; Clean Standard INF Setup:</span>
            <p>
              No third-party installer software, background processes, or PowerShell scripts are required. The INF file strictly registers the 15 standard Windows cursor slots under your current user profile.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default PackDetailPage;
