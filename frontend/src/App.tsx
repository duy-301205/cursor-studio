import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
  MousePointer,
  Sparkles,
  Layers,
  Sun,
  Moon,
  Menu,
  X,
  Compass,
  ArrowRight,
  ShieldCheck,
  Zap,
  Terminal,
} from 'lucide-react';

import { GalleryPage } from './features/gallery/GalleryPage';

type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'ccs.theme.v1';

export default function App(): React.ReactElement {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Sync theme with document root & localStorage
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [theme]);

  // Listen to system theme changes if user hasn't explicitly saved a choice
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent): void => {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (!saved) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = useCallback((): void => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink transition-colors duration-150">
      {/* ============================================================ */}
      {/* 1. Header & Navigation                                       */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-20 bg-surface/90 backdrop-blur-md border-b border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Wordmark / Brand Logo */}
            <NavLink
              to="/"
              className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-lg py-1 px-2 -ml-2 transition-transform duration-150 active:scale-95"
            >
              <div className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shadow-card group-hover:scale-105 transition-transform duration-150">
                <MousePointer className="w-5 h-5 fill-current" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-ink">
                  Custom Cursor <span className="text-brand">Studio</span>
                </span>
                <span className="text-xs text-muted font-medium tracking-wide hidden sm:block">
                  Creative Windows Asset Hub
                </span>
              </div>
            </NavLink>

            {/* Desktop & Tablet Navigation */}
            <nav className="hidden md:flex items-center gap-1 sm:gap-2">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-soft text-brand'
                      : 'text-muted hover:text-ink hover:bg-raised'
                  }`
                }
              >
                <Compass className="w-4 h-4" />
                Explore
              </NavLink>

              <NavLink
                to="/studio"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-soft text-brand'
                      : 'text-muted hover:text-ink hover:bg-raised'
                  }`
                }
              >
                <Sparkles className="w-4 h-4" />
                Studio
              </NavLink>

              <NavLink
                to="/mix"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-soft text-brand'
                      : 'text-muted hover:text-ink hover:bg-raised'
                  }`
                }
              >
                <Layers className="w-4 h-4" />
                Mix &amp; Match
              </NavLink>
            </nav>

            {/* Right Side Actions: Theme Switcher & Mobile Menu Button */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                className="w-10 h-10 rounded-xl bg-raised border border-line flex items-center justify-center text-ink hover:bg-surface hover:border-brand/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus transition-all duration-150 shadow-sm"
              >
                {theme === 'light' ? (
                  <Moon className="w-5 h-5 text-muted hover:text-ink transition-colors" />
                ) : (
                  <Sun className="w-5 h-5 text-warning transition-colors" />
                )}
              </button>

              {/* Hamburger Button for Mobile */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
                className="md:hidden w-10 h-10 rounded-xl bg-raised border border-line flex items-center justify-center text-ink hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-focus transition-all duration-150"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-line bg-surface px-4 pt-3 pb-6 space-y-1 shadow-float">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-soft text-brand'
                    : 'text-ink hover:bg-raised'
                }`
              }
            >
              <Compass className="w-5 h-5" />
              Explore Gallery
            </NavLink>

            <NavLink
              to="/studio"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-soft text-brand'
                    : 'text-ink hover:bg-raised'
                }`
              }
            >
              <Sparkles className="w-5 h-5" />
              Photo Studio
            </NavLink>

            <NavLink
              to="/mix"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-soft text-brand'
                    : 'text-ink hover:bg-raised'
                }`
              }
            >
              <Layers className="w-5 h-5" />
              Mix &amp; Match
            </NavLink>
          </div>
        )}
      </header>

      {/* ============================================================ */}
      {/* 2. Main Layout & Structured Route Placeholders               */}
      {/* ============================================================ */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <Routes>
          <Route path="/" element={<GalleryPage />} />
          <Route path="/packs" element={<GalleryPage />} />
          <Route path="/studio" element={<StudioPlaceholder />} />
          <Route path="/mix" element={<MixPlaceholder />} />
          <Route path="*" element={<NotFoundPlaceholder />} />
        </Routes>
      </main>

      {/* ============================================================ */}
      {/* 3. Footer                                                    */}
      {/* ============================================================ */}
      <footer className="border-t border-line bg-surface mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {/* Branding Column */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center">
                  <MousePointer className="w-4 h-4 fill-current" />
                </div>
                <span className="font-bold text-base text-ink tracking-tight">
                  Custom Cursor Studio
                </span>
              </div>
              <p className="text-sm text-muted leading-relaxed">
                Modern Creative Asset Hub for Windows 10 &amp; 11 cursors. Interactive live preview, 15-slot Registry schemes, and client-side photo conversion.
              </p>
            </div>

            {/* Quick Links Column */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                Navigation
              </h4>
              <ul className="space-y-1 text-sm font-medium">
                <li>
                  <NavLink to="/" className="text-muted hover:text-brand transition-colors">
                    Explore Curated Packs
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/studio" className="text-muted hover:text-brand transition-colors">
                    Photo Studio &amp; CUR Export
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/mix" className="text-muted hover:text-brand transition-colors">
                    Mix &amp; Match 8 Roles
                  </NavLink>
                </li>
              </ul>
            </div>

            {/* System Info / Architecture Guardrail Column */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                System Boundary &amp; Privacy
              </h4>
              <div className="p-3 rounded-xl bg-raised border border-line space-y-2 text-xs">
                <div className="flex items-start gap-2 text-muted">
                  <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span>Personal photos processed in-browser. Zero remote storage before export.</span>
                </div>
                <div className="flex items-center gap-2 text-muted pt-1 border-t border-line/60">
                  <Terminal className="w-3.5 h-3.5 text-brand shrink-0" />
                  <span className="font-mono truncate">API: {apiBaseUrl}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
            <p>&copy; {new Date().getFullYear()} Custom Cursor Studio. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <span>Windows 10 / 11 Compatible</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-soft text-brand font-mono font-medium">
                Phase 3 Frontend
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}


/**
 * Studio Structural Placeholder (Target for T20–T21)
 */
function StudioPlaceholder(): React.ReactElement {
  return (
    <section className="space-y-8 animate-fadeIn">
      <div className="rounded-2xl bg-surface border border-line p-6 sm:p-8 shadow-card space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-soft text-brand text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          Photo Studio
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-ink">
          Convert Custom Artwork to Windows CUR
        </h2>
        <p className="text-muted text-sm sm:text-base max-w-2xl">
          Upload transparent artwork (PNG/WebP &le; 2MB), adjust sticker outline, place pixel-precise hotspots on a 32/48 grid, and export standard Windows binary cursors.
        </p>
      </div>

      <div className="p-8 rounded-2xl border-2 border-dashed border-line bg-raised/50 flex flex-col items-center justify-center text-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-surface border border-line flex items-center justify-center text-brand shadow-sm">
          <Zap className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-ink">Photo Studio Pipeline Container</h3>
          <p className="text-xs text-muted max-w-md">
            Targeted for Task T20 (Hotspot Picker &amp; WASM Background Removal) and Task T21 (Canvas Pipeline &amp; Export API).
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Mix & Match Structural Placeholder (Target for T22)
 */
function MixPlaceholder(): React.ReactElement {
  return (
    <section className="space-y-8 animate-fadeIn">
      <div className="rounded-2xl bg-surface border border-line p-6 sm:p-8 shadow-card space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-soft text-brand text-xs font-semibold">
          <Layers className="w-3.5 h-3.5" />
          Mix &amp; Match
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-ink">
          Personalized 8-Role Preset Composer
        </h2>
        <p className="text-muted text-sm sm:text-base max-w-2xl">
          Combine your favorite cursors across multiple published packs, test interactions in the sandbox, save locally, and generate shareable codes.
        </p>
      </div>

      <div className="p-8 rounded-2xl border-2 border-dashed border-line bg-raised/50 flex flex-col items-center justify-center text-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-surface border border-line flex items-center justify-center text-brand shadow-sm">
          <Layers className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-ink">8-Role MixDock &amp; Share Container</h3>
          <p className="text-xs text-muted max-w-md">
            Targeted for Task T22 (MixMatchDock, localStorage sync, and preset sharing).
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * 404 Route Placeholder
 */
function NotFoundPlaceholder(): React.ReactElement {
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
      <div className="text-6xl font-extrabold text-brand font-mono">404</div>
      <h2 className="text-2xl font-bold text-ink">Page Not Found</h2>
      <p className="text-muted text-sm max-w-sm">
        The requested route does not exist. Please return to the explore gallery.
      </p>
      <NavLink
        to="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-hover transition-colors"
      >
        Return to Explore <ArrowRight className="w-4 h-4" />
      </NavLink>
    </div>
  );
}
