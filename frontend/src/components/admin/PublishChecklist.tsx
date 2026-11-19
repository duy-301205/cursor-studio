import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UploadCloud,
  FileCheck2,
  Lock,
  ExternalLink,
  Loader2,
  AlertCircle,
  X,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import type { CursorRole } from '../../types/api.ts';
import { CURSOR_ROLES } from '../../types/api.ts';
import type {
  AdminPackDetail,
  AdminValidationReport,
  AdminPackResult,
} from '../../types/admin.ts';
import {
  validatePack,
  publishPack,
  unpublishPack,
  AdminApiError,
} from '../../lib/adminApi.ts';

export interface PublishChecklistProps {
  pack: AdminPackDetail;
  etag: string | null;
  isReadOnly?: boolean | undefined;
  onPackUpdated: (result: AdminPackResult) => void;
  onError?: ((errorMsg: string) => void) | undefined;
  onRefreshRequired?: (() => void) | undefined;
}

export const PublishChecklist: React.FC<PublishChecklistProps> = ({
  pack,
  etag,
  isReadOnly = false,
  onPackUpdated,
  onError,
  onRefreshRequired,
}) => {
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [isUnpublishing, setIsUnpublishing] = useState<boolean>(false);

  const [validationReport, setValidationReport] = useState<AdminValidationReport | null>(null);
  const [showUnpublishModal, setShowUnpublishModal] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictOccurred, setConflictOccurred] = useState<boolean>(false);

  const isPublished = pack.status === 'published';
  const isLegacy = !pack.managed;

  // Check role completeness
  const assignedRoles = new Set<CursorRole>(
    pack.roles
      .filter((r) => Boolean(r.asset_id && r.preview_asset_id))
      .map((r) => r.role_type)
  );
  const hasAllRoles = CURSOR_ROLES.every((r) => assignedRoles.has(r));
  const hasThumbnail = Boolean(pack.thumbnail || pack.thumbnail_url);
  const hasValidMetadata = Boolean(pack.title.trim() && pack.slug.trim() && pack.category_id > 0);

  // Validate action
  const handleValidate = async () => {
    if (!etag) {
      setErrorMessage('Không có ETag revision. Vui lòng tải lại bản nháp.');
      return;
    }

    try {
      setIsValidating(true);
      setErrorMessage(null);
      setConflictOccurred(false);

      const report = await validatePack(pack.id, etag);
      setValidationReport(report);
    } catch (err: unknown) {
      if (err instanceof AdminApiError) {
        if (err.isRevisionConflict || err.status === 409) {
          setConflictOccurred(true);
          setErrorMessage('Bản nháp đã thay đổi ở phiên khác (409 Revision Conflict). Vui lòng tải lại.');
        } else {
          setErrorMessage(err.message || 'Lỗi khi kiểm tra hợp lệ.');
        }
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Lỗi không xác định khi gọi validate.');
      }
      if (onError && err instanceof Error) {
        onError(err.message);
      }
    } finally {
      setIsValidating(false);
    }
  };

  // Publish action
  const handlePublish = async () => {
    if (!etag) {
      setErrorMessage('Không có ETag revision. Vui lòng tải lại bản nháp.');
      return;
    }

    try {
      setIsPublishing(true);
      setErrorMessage(null);
      setConflictOccurred(false);

      const result = await publishPack(pack.id, etag);
      setValidationReport(null);
      onPackUpdated(result);
    } catch (err: unknown) {
      if (err instanceof AdminApiError) {
        if (err.isRevisionConflict || err.status === 409) {
          setConflictOccurred(true);
          setErrorMessage('Bản nháp đã thay đổi ở phiên khác (409 Revision Conflict). Vui lòng tải lại.');
        } else if (err.status === 422) {
          const detailMsgs = err.details?.map((d) => `${d.field}: ${d.reason}`).join('; ');
          setErrorMessage(`Pack chưa đủ điều kiện xuất bản (422): ${detailMsgs || err.message}`);
        } else {
          setErrorMessage(err.message || 'Lỗi khi xuất bản pack.');
        }
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Lỗi không xác định khi xuất bản.');
      }
      if (onError && err instanceof Error) {
        onError(err.message);
      }
    } finally {
      setIsPublishing(false);
    }
  };

  // Unpublish action
  const handleUnpublishConfirm = async () => {
    if (!etag) {
      setErrorMessage('Không có ETag revision. Vui lòng tải lại bản nháp.');
      return;
    }

    try {
      setIsUnpublishing(true);
      setErrorMessage(null);
      setConflictOccurred(false);

      const result = await unpublishPack(pack.id, etag);
      setShowUnpublishModal(false);
      setValidationReport(null);
      onPackUpdated(result);
    } catch (err: unknown) {
      if (err instanceof AdminApiError) {
        if (err.isRevisionConflict || err.status === 409) {
          setConflictOccurred(true);
          setErrorMessage('Bản nháp đã thay đổi ở phiên khác. Vui lòng tải lại.');
        } else {
          setErrorMessage(err.message || 'Lỗi khi gỡ xuất bản pack.');
        }
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Lỗi không xác định khi gỡ xuất bản.');
      }
      if (onError && err instanceof Error) {
        onError(err.message);
      }
    } finally {
      setIsUnpublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status & Action Banner */}
      <div className="p-6 rounded-2xl bg-surface border border-line space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                isPublished
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              {isPublished ? <CheckCircle2 className="w-5 h-5" /> : <UploadCloud className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">
                {isPublished ? 'Trạng thái: Đã Xuất Bản (Published)' : 'Kiểm Định & Xuất Bản Pack'}
              </h3>
              <p className="text-xs text-muted">
                {isPublished
                  ? 'Pack hiện đang được phục vụ trên Public Gallery và người dùng có thể tải về.'
                  : 'Kiểm tra snapshot binding 8 role, thumbnail và tính toàn vẹn asset trước khi publish.'}
              </p>
            </div>
          </div>

          {/* Action Button depending on status */}
          <div className="flex items-center gap-2">
            {!isPublished && !isLegacy && (
              <>
                <button
                  type="button"
                  disabled={isValidating || isPublishing || isReadOnly}
                  onClick={handleValidate}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface hover:bg-raised text-ink border border-line transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Đang kiểm tra...
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-3.5 h-3.5 text-brand" />
                      Kiểm tra Hợp Lệ (Validate)
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={
                    isPublishing ||
                    isValidating ||
                    isReadOnly ||
                    (validationReport !== null && !validationReport.valid)
                  }
                  onClick={handlePublish}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Đang xuất bản...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      Xuất Bản (Publish)
                    </>
                  )}
                </button>
              </>
            )}

            {isPublished && !isLegacy && (
              <>
                <a
                  href={`/packs/${pack.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-soft hover:bg-brand-soft/80 text-brand transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Xem trên Gallery
                </a>

                <button
                  type="button"
                  onClick={() => setShowUnpublishModal(true)}
                  disabled={isUnpublishing}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 transition-colors flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Gỡ Xuất Bản (Unpublish)
                </button>
              </>
            )}
          </div>
        </div>

        {/* Error / Conflict Feedback */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            {conflictOccurred && onRefreshRequired && (
              <button
                type="button"
                onClick={onRefreshRequired}
                className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
              >
                Tải lại
              </button>
            )}
          </div>
        )}

        {/* Server Validation Report Display */}
        {validationReport && (
          <div
            className={`p-4 rounded-xl border text-xs space-y-3 ${
              validationReport.valid
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                {validationReport.valid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Báo cáo kiểm định: HỢP LỆ (Sẵn sàng xuất bản)
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Báo cáo kiểm định: CHƯA ĐẠT (Cần khắc phục các tiêu chí dưới đây)
                  </>
                )}
              </div>
              <span className="font-mono text-[11px] opacity-75">
                Revision: r{validationReport.revision}
              </span>
            </div>

            {/* Missing roles notice */}
            {validationReport.missing_roles.length > 0 && (
              <div className="space-y-1">
                <span className="font-semibold block">Các role còn thiếu:</span>
                <div className="flex flex-wrap gap-1.5">
                  {validationReport.missing_roles.map((r) => (
                    <span
                      key={r}
                      className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-900 dark:text-amber-200 font-mono text-[11px]"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {validationReport.errors.length > 0 && (
              <div className="space-y-1">
                <span className="font-semibold block">Lỗi cần sửa:</span>
                <ul className="list-disc list-inside space-y-0.5">
                  {validationReport.errors.map((e, idx) => (
                    <li key={idx}>
                      <strong className="font-mono">[{e.field}]:</strong> {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 4-Item Visual Acceptance Checklist */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
            Tiêu chí nghiệm thu xuất bản (4/4 Yêu cầu)
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Checklist Item 1: Metadata */}
            <div className="p-3.5 rounded-xl bg-canvas border border-line flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                {hasValidMetadata ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                )}
                <div>
                  <span className="font-semibold text-ink block">Metadata Hợp Lệ</span>
                  <span className="text-[11px] text-muted">
                    Tiêu đề, slug URL và danh mục hợp lệ
                  </span>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  hasValidMetadata
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-red-500/10 text-red-600'
                }`}
              >
                {hasValidMetadata ? 'ĐẠT' : 'CHƯA'}
              </span>
            </div>

            {/* Checklist Item 2: Thumbnail */}
            <div className="p-3.5 rounded-xl bg-canvas border border-line flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                {hasThumbnail ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                )}
                <div>
                  <span className="font-semibold text-ink block">Thumbnail Pack</span>
                  <span className="text-[11px] text-muted">
                    Ảnh đại diện WebP/PNG vuông tĩnh tối đa 512×512
                  </span>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  hasThumbnail
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-red-500/10 text-red-600'
                }`}
              >
                {hasThumbnail ? 'ĐẠT' : 'CHƯA'}
              </span>
            </div>

            {/* Checklist Item 3: 8 Canonical Roles */}
            <div className="p-3.5 rounded-xl bg-canvas border border-line flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                {hasAllRoles ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <div>
                  <span className="font-semibold text-ink block">Đủ 8 Roles Canonical</span>
                  <span className="text-[11px] text-muted">
                    {assignedRoles.size} / 8 roles chuẩn Windows đã được gán
                  </span>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  hasAllRoles
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-amber-500/10 text-amber-600'
                }`}
              >
                {hasAllRoles ? 'ĐẠT' : `${assignedRoles.size}/8`}
              </span>
            </div>

            {/* Checklist Item 4: Server Validation Status */}
            <div className="p-3.5 rounded-xl bg-canvas border border-line flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                {validationReport?.valid || isPublished ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-muted shrink-0" />
                )}
                <div>
                  <span className="font-semibold text-ink block">Kiểm Định Toàn Vẹn</span>
                  <span className="text-[11px] text-muted">
                    Header CUR, hotspot, geometry và hash SHA-256
                  </span>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  validationReport?.valid || isPublished
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-raised text-muted'
                }`}
              >
                {validationReport?.valid || isPublished ? 'HỢP LỆ' : 'CHỜ KIỂM'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Unpublish Confirmation Modal */}
      {showUnpublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-surface border border-line rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
                <div className="p-2.5 rounded-xl bg-amber-500/10">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Xác nhận Gỡ Xuất Bản</h3>
                  <p className="text-xs text-muted">Chuyển pack từ Published về Draft</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowUnpublishModal(false)}
                disabled={isUnpublishing}
                className="p-1 rounded-lg text-muted hover:text-ink hover:bg-raised transition-colors"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-raised/50 border border-line text-xs space-y-2 text-ink">
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                Hành động này sẽ có các tác động sau:
              </p>
              <ul className="space-y-1.5 text-muted list-disc list-inside">
                <li>Pack sẽ bị <strong>ẩn ngay lập tức</strong> khỏi trang khám phá (Gallery) công khai.</li>
                <li>Khách truy cập trực tiếp URL pack sẽ nhận lỗi 404.</li>
                <li>Các liên kết chia sẻ Mix &amp; Match sử dụng pack này sẽ trả về lỗi 410.</li>
                <li>Bản nháp sẽ được mở khóa để bạn tiếp tục chỉnh sửa metadata và assets.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowUnpublishModal(false)}
                disabled={isUnpublishing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-ink hover:bg-raised transition-colors"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleUnpublishConfirm}
                disabled={isUnpublishing}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-md flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isUnpublishing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Đang gỡ xuất bản...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-3.5 h-3.5" />
                    Xác nhận Gỡ Xuất Bản
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
