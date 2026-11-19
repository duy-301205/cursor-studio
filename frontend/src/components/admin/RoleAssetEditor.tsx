import React, { useState, useRef } from 'react';
import {
  MousePointer,
  Link2,
  Type,
  Hourglass,
  Clock,
  Crosshair,
  Ban,
  Move,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Sparkles,
  FileCode,
  Layers,
  type LucideIcon,
} from 'lucide-react';
import type { CursorRole } from '../../types/api.ts';
import { CURSOR_ROLES } from '../../types/api.ts';
import type {
  AdminPackRole,
  AdminPackAsset,
  AdminPackResult,
} from '../../types/admin.ts';
import {
  assignRole,
  uploadAsset,
  AdminApiError,
} from '../../lib/adminApi.ts';
import { convertCursor } from '../../lib/api.ts';
import { HotspotGridPicker, type HotspotPoint } from '../HotspotGridPicker.tsx';

export interface RoleAssetEditorProps {
  packId: number;
  roles: AdminPackRole[];
  assets: AdminPackAsset[];
  etag: string | null;
  isReadOnly?: boolean | undefined;
  onRoleAssigned: (result: AdminPackResult) => void;
  onError?: ((errorMsg: string) => void) | undefined;
}

const ROLE_METADATA: Record<
  CursorRole,
  { label: string; enLabel: string; desc: string; icon: LucideIcon }
> = {
  pointer: {
    label: 'Con trỏ chính',
    enLabel: 'Normal Select (Arrow)',
    desc: 'Con trỏ mũi tên mặc định dùng để di chuyển và trỏ',
    icon: MousePointer,
  },
  link: {
    label: 'Liên kết',
    enLabel: 'Link Select (Hand)',
    desc: 'Bàn tay trỏ khi rê chuột qua liên kết hoặc nút bấm',
    icon: Link2,
  },
  text: {
    label: 'Soạn thảo văn bản',
    enLabel: 'Text Select (I-Beam)',
    desc: 'Hình chữ I khi di chuột qua đoạn văn hoặc ô nhập liệu',
    icon: Type,
  },
  busy: {
    label: 'Đang bận',
    enLabel: 'Busy / Wait',
    desc: 'Biểu tượng đồng hồ cát hoặc vòng xoay khi hệ thống bận',
    icon: Hourglass,
  },
  working: {
    label: 'Đang xử lý nền',
    enLabel: 'Working in Background',
    desc: 'Mũi tên kèm đồng hồ cát khi tác vụ nền đang chạy',
    icon: Clock,
  },
  precision: {
    label: 'Căn chỉnh chính xác',
    enLabel: 'Precision Select (Crosshair)',
    desc: 'Tâm ngắm chữ thập dùng trong đồ họa hoặc vẽ kỹ thuật',
    icon: Crosshair,
  },
  unavailable: {
    label: 'Không khả dụng',
    enLabel: 'Unavailable / Forbidden',
    desc: 'Biểu tượng cấm vòng tròn gạch chéo khi không thể thao tác',
    icon: Ban,
  },
  move: {
    label: 'Di chuyển',
    enLabel: 'Move (4-way Arrow)',
    desc: 'Mũi tên 4 hướng khi kéo thả hoặc di chuyển cửa sổ/vật thể',
    icon: Move,
  },
};

export const RoleAssetEditor: React.FC<RoleAssetEditorProps> = ({
  packId,
  roles,
  assets,
  etag,
  isReadOnly = false,
  onRoleAssigned,
  onError,
}) => {
  // Modal state for active role being assigned
  const [activeRole, setActiveRole] = useState<CursorRole | null>(null);

  // Assignment dialog state
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [selectedPreviewAssetId, setSelectedPreviewAssetId] = useState<string | null>(null);

  const [selectedCurFile, setSelectedCurFile] = useState<File | null>(null);
  const [selectedCurAssetId, setSelectedCurAssetId] = useState<string | null>(null);

  const [hotspot, setHotspot] = useState<HotspotPoint>({ x: 0, y: 0 });
  const [cursorSize, setCursorSize] = useState<32 | 48>(32);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictOccurred, setConflictOccurred] = useState<boolean>(false);

  const previewFileInputRef = useRef<HTMLInputElement>(null);
  const curFileInputRef = useRef<HTMLInputElement>(null);

  // Map roles by type for fast lookup
  const roleMap = new Map<CursorRole, AdminPackRole>();
  for (const r of roles) {
    roleMap.set(r.role_type, r);
  }

  // Count assigned roles
  const assignedCount = CURSOR_ROLES.filter((r) => {
    const item = roleMap.get(r);
    return Boolean(item?.asset_id && item.preview_asset_id);
  }).length;

  const openAssignModal = (role: CursorRole) => {
    if (isReadOnly) return;
    setActiveRole(role);
    setErrorMessage(null);
    setConflictOccurred(false);
    setSelectedPreviewFile(null);
    setSelectedCurFile(null);

    const existing = roleMap.get(role);
    if (existing) {
      setSelectedPreviewAssetId(existing.preview_asset_id);
      setSelectedCurAssetId(existing.asset_id);
      setHotspot({ x: existing.hotspot_x, y: existing.hotspot_y });
      setPreviewDataUrl(existing.preview_url || null);
    } else {
      setSelectedPreviewAssetId(null);
      setSelectedCurAssetId(null);
      setHotspot({ x: 0, y: 0 });
      setPreviewDataUrl(null);
    }
  };

  const closeAssignModal = () => {
    setActiveRole(null);
    setSelectedPreviewFile(null);
    setSelectedCurFile(null);
    setPreviewDataUrl(null);
    setSelectedPreviewAssetId(null);
    setSelectedCurAssetId(null);
    setErrorMessage(null);
    setConflictOccurred(false);
  };

  const handlePreviewFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png') {
      setErrorMessage('Preview role bắt buộc phải là ảnh định dạng PNG (32×32 hoặc 48×48).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('Kích thước ảnh vượt quá giới hạn cho phép (2MB).');
      return;
    }

    setErrorMessage(null);
    setSelectedPreviewFile(file);
    setSelectedPreviewAssetId(null);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCurFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.cur')) {
      setErrorMessage('File con trỏ phải có phần mở rộng .cur');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('Kích thước file CUR vượt quá giới hạn 2MB.');
      return;
    }

    setErrorMessage(null);
    setSelectedCurFile(file);
    setSelectedCurAssetId(null);
  };

  const handleAutoGenerateCur = async () => {
    if (!selectedPreviewFile && !previewDataUrl) {
      setErrorMessage('Vui lòng chọn hoặc tải ảnh Preview PNG trước khi tạo CUR.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      let fileToConvert: Blob;
      if (selectedPreviewFile) {
        fileToConvert = selectedPreviewFile;
      } else if (previewDataUrl) {
        const res = await fetch(previewDataUrl);
        fileToConvert = await res.blob();
      } else {
        throw new Error('Không tìm thấy ảnh preview');
      }

      const { blob, filename } = await convertCursor({
        file: fileToConvert,
        size: cursorSize,
        hotspot_x: hotspot.x,
        hotspot_y: hotspot.y,
      });

      const generatedCurFile = new File([blob], filename || 'generated.cur', {
        type: 'image/x-icon',
      });

      setSelectedCurFile(generatedCurFile);
      setSelectedCurAssetId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi tạo CUR tự động từ Studio API.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveRole = async () => {
    if (!activeRole) return;
    if (!etag) {
      setErrorMessage('Không có ETag revision của pack. Vui lòng tải lại bản nháp.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setConflictOccurred(false);

    try {
      let previewAssetId = selectedPreviewAssetId;
      let curAssetId = selectedCurAssetId;

      // 1. Upload preview asset if user uploaded a new file
      if (selectedPreviewFile) {
        const uploadedPreview = await uploadAsset(
          packId,
          { file: selectedPreviewFile, kind: 'preview' },
          etag
        );
        previewAssetId = uploadedPreview.asset_id;
      }

      // 2. Upload CUR asset if user uploaded or generated a new file
      if (selectedCurFile) {
        const uploadedCur = await uploadAsset(
          packId,
          { file: selectedCurFile, kind: 'cursor' },
          etag
        );
        curAssetId = uploadedCur.asset_id;
      }

      if (!previewAssetId) {
        throw new Error('Chưa có Preview Asset (PNG) cho role này.');
      }
      if (!curAssetId) {
        throw new Error('Chưa có Cursor Asset (.cur) cho role này.');
      }

      // 3. Assign role with If-Match precondition
      const result = await assignRole(
        packId,
        activeRole,
        {
          asset_id: curAssetId,
          preview_asset_id: previewAssetId,
          hotspot_x: hotspot.x,
          hotspot_y: hotspot.y,
        },
        etag
      );

      onRoleAssigned(result);
      closeAssignModal();
    } catch (err: unknown) {
      if (err instanceof AdminApiError) {
        if (err.isRevisionConflict || err.status === 409) {
          setConflictOccurred(true);
          setErrorMessage('Bản nháp đã thay đổi ở một phiên khác (409 Revision Conflict). Vui lòng đóng hộp thoại và tải lại bản nháp.');
        } else if (err.isPreconditionRequired) {
          setErrorMessage('Yêu cầu ETag If-Match (428 Precondition Required). Vui lòng làm mới trang.');
        } else if (err.status === 422) {
          const detailMsgs = err.details?.map((d) => `${d.field}: ${d.reason}`).join('; ');
          setErrorMessage(`Lỗi kiểm tra tính hợp lệ (422): ${detailMsgs || err.message}`);
        } else {
          setErrorMessage(err.message || 'Lỗi khi gán role.');
        }
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Đã xảy ra lỗi không xác định.');
      }
      if (onError && err instanceof Error) {
        onError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Role Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-line">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand" />
            <h3 className="font-semibold text-ink text-base">8 Canonical Cursor Roles</h3>
          </div>
          <p className="text-xs text-muted mt-1">
            Quy chuẩn Windows 10 &amp; 11: Mỗi pack cần gán đủ 8 role chuẩn để được xuất bản (Publish).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs font-medium text-muted block">Tiến độ gán role</span>
            <span className="text-sm font-bold text-ink">
              {assignedCount} / 8 Roles
            </span>
          </div>
          <div className="w-16 bg-raised rounded-full h-2.5 overflow-hidden border border-line">
            <div
              className={`h-full transition-all duration-300 ${
                assignedCount === 8 ? 'bg-emerald-500' : 'bg-brand'
              }`}
              style={{ width: `${(assignedCount / 8) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* 8-Role Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {CURSOR_ROLES.map((roleKey) => {
          const meta = ROLE_METADATA[roleKey];
          const Icon = meta.icon;
          const assignedRole = roleMap.get(roleKey);
          const isAssigned = Boolean(assignedRole?.asset_id && assignedRole.preview_asset_id);

          return (
            <div
              key={roleKey}
              className={`relative flex flex-col justify-between p-4 rounded-xl border transition-all duration-150 ${
                isAssigned
                  ? 'bg-surface border-line shadow-sm'
                  : 'bg-surface/50 border-dashed border-line/80'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-raised border border-line text-ink">
                      <Icon className="w-4 h-4 text-brand" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-ink leading-tight">
                        {meta.label}
                      </h4>
                      <span className="text-[10px] text-muted font-mono block">
                        {roleKey}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      isAssigned
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {isAssigned ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        Đã gán
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3" />
                        Chưa gán
                      </>
                    )}
                  </span>
                </div>

                <p className="text-xs text-muted leading-relaxed min-h-[32px] mb-3">
                  {meta.desc}
                </p>

                {/* Preview Thumbnail and Hotspot Information */}
                {isAssigned && assignedRole ? (
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-raised/70 border border-line text-xs mb-3">
                    <div className="w-10 h-10 rounded bg-canvas border border-line flex items-center justify-center p-1 shrink-0 overflow-hidden">
                      <img
                        src={assignedRole.preview_url}
                        alt={meta.label}
                        className="max-w-full max-h-full object-contain [image-rendering:pixelated]"
                        onError={(e) => {
                          // Fallback on broken image
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1 text-[11px] font-mono text-ink">
                        <Crosshair className="w-3 h-3 text-brand" />
                        <span>Hotspot: ({assignedRole.hotspot_x}, {assignedRole.hotspot_y})</span>
                      </div>
                      <div className="text-[10px] text-muted font-mono truncate">
                        ID: {assignedRole.asset_id?.slice(0, 8)}...
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-14 rounded-lg border border-dashed border-line flex items-center justify-center text-xs text-muted mb-3 bg-raised/30">
                    Chưa có asset được gán
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => openAssignModal(roleKey)}
                className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  isReadOnly
                    ? 'opacity-50 cursor-not-allowed bg-raised text-muted'
                    : isAssigned
                    ? 'bg-raised hover:bg-raised/80 text-ink border border-line'
                    : 'bg-brand hover:bg-brand/90 text-white shadow-sm'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                {isAssigned ? 'Cập nhật Asset' : 'Gán Asset Role'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Role Assignment Modal */}
      {activeRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-surface border border-line rounded-2xl shadow-2xl p-6 space-y-6 my-8">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-brand-soft text-brand">
                  {React.createElement(ROLE_METADATA[activeRole].icon, { className: 'w-5 h-5' })}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">
                    Gán Asset cho role: {ROLE_METADATA[activeRole].label}
                  </h3>
                  <p className="text-xs text-muted">
                    {ROLE_METADATA[activeRole].enLabel} ({activeRole})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeAssignModal}
                disabled={isSubmitting}
                className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-raised transition-colors"
                aria-label="Đóng hộp thoại"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error / Conflict Banner */}
            {errorMessage && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                  conflictOccurred
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">{errorMessage}</p>
                  {conflictOccurred && (
                    <p className="text-[11px] text-muted">
                      Để tránh ghi đè dữ liệu sai lệch, vui lòng đóng hộp thoại và nhấn nút &quot;Làm mới bản nháp&quot; ở thanh điều hướng trên cùng.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step 1: Preview PNG Asset */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted">
                  1. Preview Image (PNG 32×32 hoặc 48×48)
                </label>
                {selectedPreviewFile && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Đã chọn file: {selectedPreviewFile.name}
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-raised/50 border border-line">
                <div className="w-16 h-16 rounded-xl bg-canvas border border-line flex items-center justify-center p-2 shrink-0 overflow-hidden">
                  {previewDataUrl ? (
                    <img
                      src={previewDataUrl}
                      alt="Preview"
                      className="max-w-full max-h-full object-contain [image-rendering:pixelated]"
                    />
                  ) : (
                    <FileCode className="w-6 h-6 text-muted" />
                  )}
                </div>

                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <input
                    ref={previewFileInputRef}
                    type="file"
                    accept="image/png"
                    onChange={handlePreviewFileSelected}
                    className="hidden"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => previewFileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-surface hover:bg-raised text-xs font-semibold text-ink border border-line transition-colors flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5 text-brand" />
                      Tải lên ảnh PNG mới
                    </button>

                    {assets.filter((a) => a.kind === 'preview').length > 0 && (
                      <select
                        value={selectedPreviewAssetId || ''}
                        onChange={(e) => {
                          const assetId = e.target.value;
                          setSelectedPreviewAssetId(assetId || null);
                          setSelectedPreviewFile(null);
                          const found = assets.find((a) => a.asset_id === assetId);
                          if (found?.content_url) {
                            setPreviewDataUrl(found.content_url);
                          }
                        }}
                        disabled={isSubmitting}
                        className="px-3 py-1.5 rounded-lg bg-surface text-xs font-medium text-ink border border-line focus:outline-none focus:ring-1 focus:ring-brand"
                      >
                        <option value="">-- Hoặc chọn từ Asset có sẵn --</option>
                        {assets
                          .filter((a) => a.kind === 'preview')
                          .map((a) => (
                            <option key={a.asset_id} value={a.asset_id}>
                              {a.asset_id.slice(0, 8)}... ({a.width}×{a.height} PNG)
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                  <p className="text-[11px] text-muted">
                    Bắt buộc định dạng PNG vuông chuẩn hóa (32×32 hoặc 48×48), tối đa 2MB.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2: Hotspot & Cursor (.cur) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted">
                  2. Chọn Điểm Neo (Hotspot) &amp; Cursor (.cur)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-medium text-ink">
                    Hotspot: ({hotspot.x}, {hotspot.y})
                  </span>
                </div>
              </div>

              {/* HotspotGridPicker Component */}
              <div className="p-4 rounded-xl bg-raised/50 border border-line space-y-4">
                <HotspotGridPicker
                  size={cursorSize}
                  imageDataUrl={previewDataUrl}
                  x={hotspot.x}
                  y={hotspot.y}
                  onChange={(point) => setHotspot(point)}
                  onSizeChange={(newSize) => setCursorSize(newSize)}
                  disabled={isSubmitting}
                />

                {/* Option to Auto-generate or Upload CUR */}
                <div className="pt-3 border-t border-line/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting || (!selectedPreviewFile && !previewDataUrl)}
                      onClick={handleAutoGenerateCur}
                      className="px-3 py-1.5 rounded-lg bg-brand-soft hover:bg-brand-soft/80 text-brand text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Tự động tạo file .cur từ Hotspot &amp; Preview
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={curFileInputRef}
                      type="file"
                      accept=".cur"
                      onChange={handleCurFileSelected}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => curFileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-surface hover:bg-raised text-xs font-medium text-ink border border-line transition-colors flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5 text-muted" />
                      Tải lên file .cur thủ công
                    </button>
                  </div>
                </div>

                {selectedCurFile && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Đã chuẩn bị file CUR: {selectedCurFile.name} ({(selectedCurFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
                {!selectedCurFile && selectedCurAssetId && (
                  <div className="flex items-center gap-2 text-xs text-muted font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                    Sử dụng CUR Asset hiện tại: {selectedCurAssetId.slice(0, 12)}...
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
              <button
                type="button"
                onClick={closeAssignModal}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-ink hover:bg-raised transition-colors"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleSaveRole}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand/90 text-white text-xs font-semibold shadow-md flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Đang lưu và gán role...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Lưu Gán Role
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
