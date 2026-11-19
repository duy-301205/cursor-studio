/**
 * Custom Cursor Studio & Library — Admin Pack Management Page (Task A12)
 * Full-featured pack manager with real API search, filter, pagination, and navigation.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  RotateCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Layers,
  X,
} from 'lucide-react';
import { getPacks, AdminApiError } from '../../lib/adminApi.ts';
import { getCategories } from '../../lib/api.ts';
import { AdminPackTable } from '../../components/admin/AdminPackTable.tsx';
import type { AdminPackSummary, AdminPackStatus, AdminPackPagination } from '../../types/admin.ts';

type FilterStatus = 'all' | 'draft' | 'published';

export function AdminPacksPage(): React.ReactElement {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. Read query parameters from URL
  const queryQ = searchParams.get('q') || '';
  const queryStatus = (searchParams.get('status') || 'all') as FilterStatus;
  const queryPage = parseInt(searchParams.get('page') || '1', 10);
  const validPage = Number.isNaN(queryPage) || queryPage < 1 ? 1 : queryPage;

  // 2. Component State
  const [searchInput, setSearchInput] = useState<string>(queryQ);
  const [items, setItems] = useState<AdminPackSummary[]>([]);
  const [pagination, setPagination] = useState<AdminPackPagination>({
    page: validPage,
    limit: 12,
    total: 0,
    total_pages: 1,
    has_next: false,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryMap, setCategoryMap] = useState<Map<number, string>>(new Map());

  // Ref to cancel stale in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load categories once to resolve category IDs to human names
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const categories = await getCategories();
        if (mounted) {
          const map = new Map<number, string>();
          for (const cat of categories) {
            map.set(cat.id, cat.name);
          }
          setCategoryMap(map);
        }
      } catch {
        // Fallback to displaying raw category IDs
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // 3. Fetch Packs Function
  const fetchPacks = useCallback(
    async (q: string, status: FilterStatus, page: number): Promise<void> => {
      // Abort previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const statusParam: AdminPackStatus | undefined =
          status === 'draft' || status === 'published' ? status : undefined;

        const res = await getPacks(
          {
            q: q.trim() || undefined,
            status: statusParam,
            page,
            limit: 12,
          },
          { signal: controller.signal }
        );

        setItems(res.items);
        setPagination(res.pagination);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return; // Ignore intentional aborts
        }

        if (err instanceof AdminApiError) {
          if (err.isUnauthorized) {
            setError('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
          } else {
            setError(err.message || 'Không thể tải danh sách bộ con trỏ.');
          }
        } else {
          setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Sync state with URL params
  useEffect(() => {
    setSearchInput(queryQ);
    void fetchPacks(queryQ, queryStatus, validPage);
  }, [queryQ, queryStatus, validPage, fetchPacks]);

  // Debounced Search Sync (250ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchInput !== queryQ) {
        const nextParams = new URLSearchParams(searchParams);
        if (searchInput.trim()) {
          nextParams.set('q', searchInput.trim());
        } else {
          nextParams.delete('q');
        }
        nextParams.set('page', '1'); // Reset to page 1 on search change
        setSearchParams(nextParams);
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [searchInput, queryQ, searchParams, setSearchParams]);

  // Change Status Filter
  const handleStatusChange = (newStatus: FilterStatus): void => {
    const nextParams = new URLSearchParams(searchParams);
    if (newStatus === 'all') {
      nextParams.delete('status');
    } else {
      nextParams.set('status', newStatus);
    }
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  // Pagination Change
  const handlePageChange = (newPage: number): void => {
    if (newPage < 1 || newPage > pagination.total_pages) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('page', String(newPage));
    setSearchParams(nextParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Clear Filters
  const handleClearFilters = (): void => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  // Navigate to Pack Editor (Task A13)
  const handleEditPack = (pack: AdminPackSummary): void => {
    navigate(`/admin/packs/${pack.id}/edit`);
  };

  const isFiltered = queryQ.trim().length > 0 || queryStatus !== 'all';

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight flex items-center gap-2.5">
            <Layers className="w-7 h-7 text-brand" />
            <span>Quản lý Cursor Packs</span>
          </h1>
          <p className="text-sm text-muted mt-1">
            Xem, tìm kiếm, biên tập và xuất bản các bộ con trỏ Windows trong thư viện
          </p>
        </div>

        {/* Primary CTA: Create New Pack */}
        <button
          type="button"
          onClick={() => navigate('/admin/packs/new')}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold shadow-card transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo Cursor Pack mới</span>
        </button>
      </div>

      {/* 2. Filter & Search Controls */}
      <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo tên bộ con trỏ hoặc slug..."
            className="w-full pl-10 pr-9 py-2 rounded-xl bg-raised border border-line text-ink placeholder:text-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:bg-surface transition-all duration-150"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Xóa từ khóa tìm kiếm"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-ink"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-raised rounded-xl border border-line shrink-0">
          {(
            [
              { key: 'all', label: 'Tất cả' },
              { key: 'draft', label: 'Bản nháp' },
              { key: 'published', label: 'Đã xuất bản' },
            ] as const
          ).map((tab) => {
            const isActive = queryStatus === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleStatusChange(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  isActive
                    ? 'bg-surface text-brand shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Manual Refresh Button */}
        <button
          type="button"
          onClick={() => void fetchPacks(queryQ, queryStatus, validPage)}
          disabled={isLoading}
          title="Tải lại danh sách"
          aria-label="Tải lại danh sách bộ con trỏ"
          className="p-2.5 rounded-xl border border-line bg-raised hover:bg-surface text-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus self-end md:self-auto disabled:opacity-50"
        >
          <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 3. Error Banner */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-center justify-between gap-3 animate-fadeIn"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchPacks(queryQ, queryStatus, validPage)}
            className="px-3 py-1 rounded-lg bg-danger text-white text-xs font-bold hover:bg-danger/90 transition-colors"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 4. Pack Table */}
      <AdminPackTable
        items={items}
        categoryMap={categoryMap}
        isLoading={isLoading}
        onEdit={handleEditPack}
        onClearFilters={handleClearFilters}
        isFiltered={isFiltered}
      />

      {/* 5. Pagination Footer */}
      {!isLoading && items.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="text-xs text-muted font-medium">
            Hiển thị <span className="font-bold text-ink">{items.length}</span> trên tổng số{' '}
            <span className="font-bold text-ink">{pagination.total}</span> bộ con trỏ
          </div>

          {pagination.total_pages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                aria-label="Trang trước"
                className="p-2 rounded-xl border border-line bg-surface hover:bg-raised text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-raised text-ink font-mono">
                {pagination.page} / {pagination.total_pages}
              </span>

              <button
                type="button"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={!pagination.has_next}
                aria-label="Trang tiếp theo"
                className="p-2 rounded-xl border border-line bg-surface hover:bg-raised text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminPacksPage;
