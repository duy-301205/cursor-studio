/**
 * Custom Cursor Studio & Library — Admin Pack Table Component
 * Responsive table/cards displaying admin cursor packs with status, revision, and actions.
 */

import React from 'react';
import {
  Layers,
  Edit,
  ExternalLink,
  Shield,
  CheckCircle2,
  Clock,
  Sparkles,
  Lock,
} from 'lucide-react';
import type { AdminPackSummary } from '../../types/admin.ts';

export interface AdminPackTableProps {
  items: AdminPackSummary[];
  categoryMap: Map<number, string>;
  isLoading: boolean;
  onEdit: (pack: AdminPackSummary) => void;
  onClearFilters?: () => void;
  isFiltered?: boolean;
}

export function AdminPackTable({
  items,
  categoryMap,
  isLoading,
  onEdit,
  onClearFilters,
  isFiltered,
}: AdminPackTableProps): React.ReactElement {
  // 1. Loading Skeleton State
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Đang tải danh sách bộ con trỏ..."
        aria-busy="true"
        className="bg-surface border border-line rounded-2xl p-4 sm:p-6 shadow-sm space-y-4"
      >
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-raised/70 animate-pulse flex items-center justify-between px-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-line/60"></div>
                <div className="space-y-1.5">
                  <div className="w-32 sm:w-48 h-4 rounded bg-line/60"></div>
                  <div className="w-20 sm:w-28 h-3 rounded bg-line/40"></div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-6 rounded-full bg-line/40 hidden sm:block"></div>
                <div className="w-20 h-8 rounded-lg bg-line/50"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 2. Empty State
  if (items.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-8 sm:p-12 text-center space-y-4 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-raised text-muted mx-auto flex items-center justify-center">
          <Layers className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-ink">
            {isFiltered ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có cursor pack nào'}
          </h3>
          <p className="text-sm text-muted max-w-sm mx-auto">
            {isFiltered
              ? 'Hãy thử thay đổi từ khóa tìm kiếm hoặc bỏ bộ lọc trạng thái.'
              : 'Bắt đầu bằng cách tạo một bộ con trỏ mới trong hệ thống.'}
          </p>
        </div>
        {isFiltered && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-line text-sm font-semibold hover:bg-raised transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>
    );
  }

  // 3. Render Table on Desktop, Cards on Mobile
  return (
    <div className="bg-surface border border-line rounded-2xl shadow-sm overflow-hidden">
      {/* Desktop Table View (>= 768px) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm text-muted" aria-label="Bảng quản lý cursor packs">
          <thead className="bg-raised/60 text-xs uppercase tracking-wider text-muted font-bold border-b border-line">
            <tr>
              <th scope="col" className="py-3.5 px-4 w-16">
                ID
              </th>
              <th scope="col" className="py-3.5 px-4">
                Bộ con trỏ
              </th>
              <th scope="col" className="py-3.5 px-4">
                Danh mục
              </th>
              <th scope="col" className="py-3.5 px-4">
                Trạng thái
              </th>
              <th scope="col" className="py-3.5 px-4">
                Phân loại
              </th>
              <th scope="col" className="py-3.5 px-4 text-center">
                Bản sửa đổi
              </th>
              <th scope="col" className="py-3.5 px-4">
                Cập nhật
              </th>
              <th scope="col" className="py-3.5 px-4 text-right">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {items.map((pack) => {
              const categoryName = categoryMap.get(pack.category_id) || `Danh mục #${pack.category_id}`;
              const isDraft = pack.status === 'draft';
              const formattedDate = new Date(pack.updated_at).toLocaleDateString('vi-VN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              return (
                <tr
                  key={pack.id}
                  className="hover:bg-raised/40 transition-colors group focus-within:bg-raised/40"
                >
                  {/* ID */}
                  <td className="py-3.5 px-4 font-mono text-xs text-muted font-semibold">
                    #{pack.id}
                  </td>

                  {/* Pack Title & Slug */}
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink text-sm group-hover:text-brand transition-colors">
                          {pack.title}
                        </span>
                        {pack.is_premium && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <Sparkles className="w-2.5 h-2.5" /> Pro
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-muted/80">{pack.slug}</span>
                      {isDraft && pack.is_animated && (
                        <span className="mt-1 w-fit rounded bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">
                          Có con trỏ động
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Category */}
                  <td className="py-3.5 px-4 text-xs font-medium text-ink">
                    {categoryName}
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4">
                    {isDraft ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                        <Clock className="w-3 h-3" />
                        Bản nháp
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20">
                        <CheckCircle2 className="w-3 h-3" />
                        Đã xuất bản
                      </span>
                    )}
                  </td>

                  {/* Managed vs Legacy */}
                  <td className="py-3.5 px-4">
                    {pack.managed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                        <Shield className="w-3.5 h-3.5" />
                        Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                        <Lock className="w-3.5 h-3.5" />
                        Legacy
                      </span>
                    )}
                  </td>

                  {/* Revision */}
                  <td className="py-3.5 px-4 text-center">
                    {pack.revision !== null ? (
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-raised text-ink">
                        r{pack.revision}
                      </span>
                    ) : (
                      <span className="text-muted/60 text-xs">—</span>
                    )}
                  </td>

                  {/* Updated At */}
                  <td className="py-3.5 px-4 text-xs text-muted">
                    {formattedDate}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* View on Public Site (if published) */}
                      {!isDraft && (
                        <a
                          href={`/packs/${pack.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Xem trên trang thư viện công khai"
                          className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-raised transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span className="sr-only">Xem công khai {pack.title}</span>
                        </a>
                      )}

                      {/* Edit Button (Managed draft/published) */}
                      {pack.managed ? (
                        <button
                          type="button"
                          onClick={() => onEdit(pack)}
                          title="Chỉnh sửa bộ con trỏ"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-hover text-xs font-semibold shadow-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Sửa</span>
                        </button>
                      ) : (
                        <span
                          title="Bộ legacy được tạo trước hệ thống Admin, không thể chỉnh sửa"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-muted bg-raised cursor-not-allowed opacity-75"
                        >
                          <Lock className="w-3 h-3" />
                          Chỉ đọc
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View (< 768px) */}
      <div className="md:hidden divide-y divide-line/60">
        {items.map((pack) => {
          const categoryName = categoryMap.get(pack.category_id) || `Danh mục #${pack.category_id}`;
          const isDraft = pack.status === 'draft';
          const formattedDate = new Date(pack.updated_at).toLocaleDateString('vi-VN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });

          return (
            <div key={pack.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted font-bold">#{pack.id}</span>
                    <span className="font-bold text-ink text-base">{pack.title}</span>
                  </div>
                  <div className="text-xs font-mono text-muted">{pack.slug}</div>
                  {isDraft && pack.is_animated && (
                    <span className="mt-1 inline-block rounded bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">
                      Có con trỏ động
                    </span>
                  )}
                </div>

                {isDraft ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shrink-0">
                    Bản nháp
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20 shrink-0">
                    Đã xuất bản
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <div>
                  Danh mục: <span className="font-semibold text-ink">{categoryName}</span>
                </div>
                {pack.revision !== null && (
                  <div>
                    Sửa đổi: <span className="font-mono font-bold text-ink">r{pack.revision}</span>
                  </div>
                )}
                <div>
                  Cập nhật: <span>{formattedDate}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-line/40">
                <div className="text-xs text-muted flex items-center gap-1">
                  {pack.managed ? (
                    <span className="text-brand font-medium flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5" /> Admin Managed
                    </span>
                  ) : (
                    <span className="text-muted flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> Legacy
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!isDraft && (
                    <a
                      href={`/packs/${pack.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-xl text-muted hover:text-ink hover:bg-raised transition-colors"
                      title="Xem trên web"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}

                  {pack.managed ? (
                    <button
                      type="button"
                      onClick={() => onEdit(pack)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold shadow-sm hover:bg-brand-hover transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Chỉnh sửa</span>
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-lg bg-raised text-xs text-muted font-medium cursor-not-allowed">
                      Chỉ đọc
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AdminPackTable;
