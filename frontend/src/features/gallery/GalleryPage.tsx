import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  X,
  SlidersHorizontal,
  Sparkles,
  MousePointer,
  RotateCcw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { PackCard } from '../../components/PackCard';
import type {
  CategoryEntry,
  PackCard as PackCardType,
  PackPage,
  PackSort,
} from '../../types/api';

export function GalleryPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state extractions
  const currentCategory = searchParams.get('category') || '';
  const currentSort: PackSort = (searchParams.get('sort') as PackSort) === 'newest' ? 'newest' : 'popular';
  const currentQuery = searchParams.get('q') || '';
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  // Local UI & Search input state
  const [searchInput, setSearchInput] = useState<string>(currentQuery);
  const [categories, setCategories] = useState<CategoryEntry[]>([]);
  const [packData, setPackData] = useState<PackPage | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active testing cursor state (for Touch / Mobile / Keyboard Try preview)
  const [testedPack, setTestedPack] = useState<PackCardType | null>(null);

  // Synchronize local search input if URL changes externally (e.g. Back/Forward)
  useEffect(() => {
    setSearchInput(currentQuery);
  }, [currentQuery]);

  // Load Categories on mount
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function fetchCategories(): Promise<void> {
      try {
        const data = await apiClient.getCategories({ signal: controller.signal });
        if (isMounted) {
          setCategories(data);
        }
      } catch (err: unknown) {
        // Silently keep empty categories if cancelled
        if ((err as Error)?.name !== 'AbortError') {
          console.warn('Failed to load categories:', err);
        }
      }
    }

    void fetchCategories();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  // Fetch Packs whenever URL query parameters change (with AbortController for stale cancellation)
  const fetchPacks = useCallback(async (signal: AbortSignal): Promise<void> => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await apiClient.getPacks(
        {
          category: currentCategory || undefined,
          sort: currentSort,
          q: currentQuery || undefined,
          page: currentPage,
          limit: 12,
        },
        { signal }
      );
      setPackData(data);
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'Failed to load cursor packs.';
        setErrorMessage(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentCategory, currentSort, currentQuery, currentPage]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchPacks(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchPacks]);

  // Debounced search query handler (250ms as specified in TASKS.md & PRD.md)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string): void => {
    setSearchInput(value);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const newParams = new URLSearchParams(searchParams);
      const trimmed = value.trim();

      if (trimmed) {
        newParams.set('q', trimmed);
      } else {
        newParams.delete('q');
      }
      newParams.set('page', '1'); // Reset to page 1 on query change
      setSearchParams(newParams);
    }, 250);
  };

  const handleClearSearch = (): void => {
    setSearchInput('');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('q');
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleCategorySelect = (slug: string): void => {
    const newParams = new URLSearchParams(searchParams);
    if (slug) {
      newParams.set('category', slug);
    } else {
      newParams.delete('category');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleSortChange = (sort: PackSort): void => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sort);
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handlePageChange = (newPage: number): void => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', String(newPage));
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetFilters = (): void => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* ============================================================ */}
      {/* 1. Hero Header Banner                                        */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-card bg-surface border border-line p-6 sm:p-10 shadow-card">
        <div className="max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-brand-soft text-brand text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Verified Windows Asset Hub
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-tight">
            Discover &amp; Test Custom Windows Cursors
          </h1>
          <p className="text-muted text-base sm:text-lg leading-relaxed">
            Browse verified community packs, test pointer states directly on each card, and get ready-to-install 15-slot Windows packages.
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. Interactive Testing Sticky Banner (Activated via "Try")   */}
      {/* ============================================================ */}
      {testedPack && (
        <div
          style={{
            cursor: `url("${testedPack.pointer.preview_png_url}") ${testedPack.pointer.hotspot_x} ${testedPack.pointer.hotspot_y}, auto`,
          }}
          className="sticky top-20 z-20 rounded-xl bg-brand text-white p-4 shadow-float flex items-center justify-between gap-4 transition-all duration-200"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <MousePointer className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/80">
                Interactive Testing Zone Active
              </div>
              <div className="text-sm font-bold">
                Currently testing: <span className="underline">{testedPack.title}</span> (Hotspot: {testedPack.pointer.hotspot_x},{testedPack.pointer.hotspot_y})
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTestedPack(null)}
            className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold text-white transition-colors"
          >
            Close Tester
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. Filter Bar: Categories, Search & Sort                     */}
      {/* ============================================================ */}
      <div className="space-y-4">
        {/* Category Chips Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            type="button"
            onClick={() => handleCategorySelect('')}
            className={`px-4 py-2 rounded-pill text-xs font-semibold shrink-0 transition-all duration-150 ${
              !currentCategory
                ? 'bg-brand text-white shadow-sm'
                : 'bg-surface border border-line text-muted hover:text-ink hover:bg-raised'
            }`}
          >
            All Packs
          </button>

          {categories.map((cat) => {
            const isSelected = currentCategory === cat.slug;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategorySelect(cat.slug)}
                className={`flex items-center gap-2 px-4 py-2 rounded-pill text-xs font-semibold shrink-0 transition-all duration-150 ${
                  isSelected
                    ? 'bg-brand text-white shadow-sm'
                    : 'bg-surface border border-line text-muted hover:text-ink hover:bg-raised'
                }`}
              >
                <span>{cat.name}</span>
                {cat.pack_count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      isSelected ? 'bg-white/30 text-white' : 'bg-raised text-muted'
                    }`}
                  >
                    {cat.pack_count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search Input & Sort Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search cursor packs by name..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-surface border border-line text-ink placeholder:text-muted text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-focus transition-all"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="Clear search query"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Sort:</span>
            </div>
            <div className="inline-flex p-1 rounded-xl bg-surface border border-line">
              <button
                type="button"
                onClick={() => handleSortChange('popular')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  currentSort === 'popular'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Popular
              </button>
              <button
                type="button"
                onClick={() => handleSortChange('newest')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  currentSort === 'newest'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Newest
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. Pack Grid / Loading / Error / Empty States                */}
      {/* ============================================================ */}
      {isLoading ? (
        /* Loading Skeleton Cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              className="rounded-card border border-line bg-surface p-5 space-y-4"
            >
              <div className="w-full aspect-[4/3] rounded-lg bg-raised" />
              <div className="space-y-2">
                <div className="h-4 bg-raised rounded w-3/4" />
                <div className="h-3 bg-raised rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : errorMessage ? (
        /* Error State */
        <div className="p-8 rounded-2xl bg-danger/10 border border-danger/30 text-center space-y-4 py-12">
          <AlertTriangle className="w-10 h-10 text-danger mx-auto" />
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-ink">Failed to load cursor packs</h3>
            <p className="text-sm text-muted max-w-md mx-auto">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const controller = new AbortController();
              void fetchPacks(controller.signal);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-hover transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Retry
          </button>
        </div>
      ) : !packData || packData.items.length === 0 ? (
        /* Empty State */
        <div className="p-12 rounded-2xl border-2 border-dashed border-line bg-surface text-center space-y-4 py-16">
          <div className="w-14 h-14 rounded-2xl bg-raised border border-line flex items-center justify-center text-muted mx-auto">
            <Search className="w-7 h-7 opacity-50" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-ink">No cursor packs found</h3>
            <p className="text-sm text-muted max-w-sm mx-auto">
              We couldn&apos;t find any packs matching your current filters or query.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-soft text-brand text-xs font-semibold hover:bg-brand hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear all filters
          </button>
        </div>
      ) : (
        /* Grid of Real API-Driven Pack Cards */
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {packData.items.map((card) => (
              <PackCard
                key={card.id}
                card={card}
                onTry={(c) => setTestedPack(c)}
              />
            ))}
          </div>

          {/* ============================================================ */}
          {/* 5. Pagination Controls                                       */}
          {/* ============================================================ */}
          {packData.pagination.total_pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-6 border-t border-line">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-surface border border-line text-xs font-semibold text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-raised transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>

              <span className="text-xs font-medium text-muted">
                Page <span className="text-ink font-bold">{currentPage}</span> of{' '}
                <span className="text-ink font-bold">{packData.pagination.total_pages}</span>
              </span>

              <button
                type="button"
                disabled={!packData.pagination.has_next}
                onClick={() => handlePageChange(currentPage + 1)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-surface border border-line text-xs font-semibold text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-raised transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default GalleryPage;
