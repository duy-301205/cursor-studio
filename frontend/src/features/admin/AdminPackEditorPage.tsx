import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  RefreshCw,
  ExternalLink,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Info,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import type { CategoryEntry } from '../../types/api.ts';
import type {
  AdminPackDetail,
  AdminCreatePackRequest,
  AdminPatchPackRequest,
  AdminPackResult,
} from '../../types/admin.ts';
import {
  getPack,
  createPack,
  updatePack,
  uploadAsset,
  AdminApiError,
} from '../../lib/adminApi.ts';
import { getCategories } from '../../lib/api.ts';
import { RoleAssetEditor } from '../../components/admin/RoleAssetEditor.tsx';
import { PublishChecklist } from '../../components/admin/PublishChecklist.tsx';
import { AdminPackPreview } from '../../components/admin/AdminPackPreview.tsx';

function slugify(text: string): string {
  return text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove Vietnamese diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export const AdminPackEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isCreateMode = !id || id === 'new';
  const navigate = useNavigate();

  // Core state
  const [pack, setPack] = useState<AdminPackDetail | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(!isCreateMode);
  const [pageError, setPageError] = useState<string | null>(null);

  // Metadata form state
  const [title, setTitle] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [categoryId, setCategoryId] = useState<number>(1);
  const [description, setDescription] = useState<string>('');
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState<boolean>(false);

  // Mutation and banner states
  const [isSavingMetadata, setIsSavingMetadata] = useState<boolean>(false);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState<boolean>(false);
  const [metadataSuccessMsg, setMetadataSuccessMsg] = useState<string | null>(null);
  const [metadataErrorMsg, setMetadataErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflictOccurred, setConflictOccurred] = useState<boolean>(false);

  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Determine read-only modes per spec
  const isReadOnly = Boolean(pack && (pack.status === 'published' || !pack.managed));
  const isLegacy = Boolean(pack && !pack.managed);
  const isPublished = Boolean(pack && pack.status === 'published');

  // Load categories
  useEffect(() => {
    let active = true;
    getCategories()
      .then((cats) => {
        if (active) {
          setCategories(cats);
          if (cats.length > 0 && cats[0]) {
            setCategoryId((prev) => (prev === 1 ? cats[0]!.id : prev));
          }
        }
      })
      .catch(() => {
        // Fallback categories will be empty or populated on retry
      });
    return () => {
      active = false;
    };
  }, []);

  // Fetch pack details in edit mode
  const fetchPackDetail = useCallback(async () => {
    if (isCreateMode || !id) return;

    try {
      setIsLoading(true);
      setPageError(null);
      setConflictOccurred(false);

      const result = await getPack(id);
      setPack(result.data);
      setEtag(result.etag);

      // Populate form fields
      setTitle(result.data.title);
      setSlug(result.data.slug);
      setCategoryId(result.data.category_id);
      setDescription(result.data.description || '');
      setIsPremium(result.data.is_premium);
    } catch (err: unknown) {
      if (err instanceof AdminApiError) {
        if (err.isUnauthorized) {
          setPageError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        } else if (err.status === 404) {
          setPageError(`Không tìm thấy pack có ID: ${id}`);
        } else {
          setPageError(err.message || 'Lỗi khi tải thông tin pack.');
        }
      } else if (err instanceof Error) {
        setPageError(err.message);
      } else {
        setPageError('Đã xảy ra lỗi không xác định.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id, isCreateMode]);

  useEffect(() => {
    if (!isCreateMode) {
      void fetchPackDetail();
    }
  }, [fetchPackDetail, isCreateMode]);

  // Auto-slugify on title change in create mode
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    if (isCreateMode && !slugManuallyEdited) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugManuallyEdited(true);
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  // Validate form client-side
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      errors['title'] = 'Tiêu đề không được để trống.';
    } else if (trimmedTitle.length > 180) {
      errors['title'] = 'Tiêu đề tối đa 180 ký tự.';
    }

    const trimmedSlug = slug.trim();
    if (!trimmedSlug) {
      errors['slug'] = 'Slug không được để trống.';
    } else if (trimmedSlug.length > 200) {
      errors['slug'] = 'Slug tối đa 200 ký tự.';
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug)) {
      errors['slug'] = 'Slug chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang.';
    }

    if (!categoryId || categoryId <= 0) {
      errors['category_id'] = 'Vui lòng chọn danh mục hợp lệ.';
    }

    if (description.length > 4000) {
      errors['description'] = 'Mô tả tối đa 4000 ký tự.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle Save / Submit
  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    if (!validateForm()) return;

    setIsSavingMetadata(true);
    setMetadataSuccessMsg(null);
    setMetadataErrorMsg(null);
    setConflictOccurred(false);

    try {
      if (isCreateMode) {
        // POST /packs
        const createPayload: AdminCreatePackRequest = {
          title: title.trim(),
          slug: slug.trim(),
          category_id: categoryId,
          description: description.trim(),
          is_premium: isPremium,
        };

        const result = await createPack(createPayload);
        setMetadataSuccessMsg('Tạo bản nháp pack thành công! Đang chuyển hướng...');
        setTimeout(() => {
          navigate(`/admin/packs/${result.data.id}/edit`, { replace: true });
        }, 600);
      } else {
        // PATCH /packs/:id
        if (!pack || !etag) {
          throw new Error('Thiếu thông tin ETag bản nháp. Vui lòng làm mới trang.');
        }

        const patchPayload: AdminPatchPackRequest = {
          title: title.trim(),
          slug: slug.trim(),
          category_id: categoryId,
          description: description.trim(),
          is_premium: isPremium,
        };

        const result = await updatePack(pack.id, patchPayload, etag);
        setPack(result.data);
        setEtag(result.etag);
        setMetadataSuccessMsg('Cập nhật metadata thành công.');
      }
    } catch (err: unknown) {
      if (err instanceof AdminApiError) {
        if (err.isRevisionConflict || err.status === 409) {
          setConflictOccurred(true);
          setMetadataErrorMsg('Bản nháp đã thay đổi ở một phiên khác (409 Revision Conflict). Hãy nhấn nút "Tải lại bản nháp" để cập nhật dữ liệu mới nhất.');
        } else if (err.status === 409 && err.code === 'SLUG_CONFLICT') {
          setFieldErrors((prev) => ({ ...prev, slug: 'Slug này đã được sử dụng. Vui lòng chọn slug khác.' }));
          setMetadataErrorMsg('Slug đã tồn tại trong hệ thống.');
        } else if (err.isPreconditionRequired) {
          setMetadataErrorMsg('Yêu cầu điều kiện If-Match (428). Vui lòng làm mới lại bản nháp.');
        } else if (err.status === 422) {
          const newErrors: Record<string, string> = {};
          err.details?.forEach((d) => {
            if (d.field) newErrors[d.field] = d.reason;
          });
          setFieldErrors(newErrors);
          setMetadataErrorMsg(err.message || 'Lỗi xác thực dữ liệu.');
        } else {
          setMetadataErrorMsg(err.message || 'Lỗi khi lưu metadata.');
        }
      } else if (err instanceof Error) {
        setMetadataErrorMsg(err.message);
      } else {
        setMetadataErrorMsg('Đã xảy ra lỗi không xác định.');
      }
    } finally {
      setIsSavingMetadata(false);
    }
  };

  // Thumbnail upload
  const handleThumbnailFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pack || isReadOnly) return;

    if (!['image/png', 'image/webp'].includes(file.type)) {
      setMetadataErrorMsg('Thumbnail phải là ảnh định dạng PNG hoặc WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMetadataErrorMsg('Kích thước ảnh thumbnail vượt quá 2MB.');
      return;
    }

    try {
      setIsUploadingThumbnail(true);
      setMetadataErrorMsg(null);

      // 1. Upload thumbnail asset
      const uploaded = await uploadAsset(
        pack.id,
        { file, kind: 'thumbnail' },
        etag || undefined
      );

      // 2. Assign thumbnail asset to pack metadata
      const result = await updatePack(
        pack.id,
        { thumbnail_asset_id: uploaded.asset_id },
        etag || undefined
      );

      setPack(result.data);
      setEtag(result.etag);
      setMetadataSuccessMsg('Cập nhật thumbnail thành công.');
    } catch (err: unknown) {
      if (err instanceof AdminApiError) {
        if (err.isRevisionConflict || err.status === 409) {
          setConflictOccurred(true);
          setMetadataErrorMsg('Bản nháp đã thay đổi ở một phiên khác. Vui lòng tải lại.');
        } else {
          setMetadataErrorMsg(err.message || 'Lỗi khi tải ảnh thumbnail.');
        }
      } else if (err instanceof Error) {
        setMetadataErrorMsg(err.message);
      } else {
        setMetadataErrorMsg('Lỗi không xác định khi tải ảnh thumbnail.');
      }
    } finally {
      setIsUploadingThumbnail(false);
      if (thumbnailInputRef.current) {
        thumbnailInputRef.current.value = '';
      }
    }
  };

  // Remove thumbnail
  const handleRemoveThumbnail = async () => {
    if (!pack || isReadOnly) return;

    try {
      setIsUploadingThumbnail(true);
      setMetadataErrorMsg(null);

      const result = await updatePack(
        pack.id,
        { thumbnail_asset_id: null },
        etag || undefined
      );

      setPack(result.data);
      setEtag(result.etag);
      setMetadataSuccessMsg('Đã xóa thumbnail.');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setMetadataErrorMsg(err.message);
      }
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  // Callback when RoleAssetEditor assigns a role
  const handleRoleAssigned = (result: AdminPackResult) => {
    setPack(result.data);
    setEtag(result.etag);
    setMetadataSuccessMsg('Đã gán role thành công!');
    setTimeout(() => setMetadataSuccessMsg(null), 3000);
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <p className="text-sm text-muted font-medium">Đang tải thông tin bản nháp...</p>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="max-w-2xl mx-auto p-6 rounded-2xl bg-surface border border-line text-center space-y-4 my-12">
        <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-ink">Không thể tải thông tin pack</h2>
        <p className="text-sm text-muted">{pageError}</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/admin/packs"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-raised hover:bg-raised/80 text-ink border border-line transition-colors"
          >
            Quay lại danh sách
          </Link>
          <button
            type="button"
            onClick={() => void fetchPackDetail()}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand text-white hover:bg-brand/90 transition-colors"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
        <div className="space-y-1">
          <Link
            to="/admin/packs"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand transition-colors mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại danh sách packs</span>
          </Link>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {isCreateMode ? 'Tạo Pack Con Trỏ Mới' : `Chỉnh sửa: ${pack?.title || ''}`}
            </h1>

            {!isCreateMode && pack && (
              <>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    isPublished
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  {isPublished ? 'Published' : 'Draft'}
                </span>

                {pack.revision !== null && (
                  <span className="px-2 py-0.5 rounded-md bg-raised border border-line text-xs font-mono text-muted">
                    r{pack.revision}
                  </span>
                )}

                {isLegacy && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-500 border border-slate-500/20 text-xs font-semibold">
                    Legacy (Chỉ đọc)
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Header Action Buttons */}
        {!isCreateMode && pack && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void fetchPackDetail()}
              className="px-3 py-2 rounded-xl text-xs font-medium text-ink bg-surface hover:bg-raised border border-line transition-colors flex items-center gap-1.5"
              title="Tải lại bản nháp mới nhất từ server"
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted" />
              Làm mới
            </button>

            {isPublished && (
              <a
                href={`/packs/${pack.slug}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl text-xs font-medium text-brand bg-brand-soft hover:bg-brand-soft/80 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Xem trên Gallery
              </a>
            )}
          </div>
        )}
      </div>

      {/* Read-Only Warning Banners */}
      {isPublished && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <Lock className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-sm">Pack đang ở trạng thái Published (Đã xuất bản)</p>
            <p>
              Theo quy định bảo toàn dữ liệu và liên kết công khai, mọi thao tác chỉnh sửa metadata và assets bị khóa.
              Cần thực hiện <strong>Gỡ xuất bản (Unpublish)</strong> trước khi có thể chỉnh sửa lại bản nháp này.
            </p>
          </div>
        </div>
      )}

      {isLegacy && (
        <div className="p-4 rounded-2xl bg-slate-500/10 border border-slate-500/30 text-slate-700 dark:text-slate-300 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-slate-500" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-sm">Pack Legacy (Hệ thống cũ)</p>
            <p>
              Pack này được nhập từ cơ sở dữ liệu mẫu ban đầu (managed: false). Giao diện Admin Console chỉ hỗ trợ xem ở chế độ chỉ đọc.
            </p>
          </div>
        </div>
      )}

      {/* Revision Conflict Banner */}
      {conflictOccurred && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 text-xs">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            <div className="space-y-1">
              <p className="font-bold text-sm">Xung đột phiên bản (409 Revision Conflict)</p>
              <p>
                Bản nháp đã được cập nhật bởi phiên làm việc khác hoặc ETag hiện tại đã cũ.
                Vui lòng tải lại dữ liệu mới nhất để tránh ghi đè dữ liệu.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchPackDetail()}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold text-xs hover:bg-amber-700 transition-colors shrink-0"
          >
            Tải lại bản nháp
          </button>
        </div>
      )}

      {/* Feedback Messages */}
      {metadataSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{metadataSuccessMsg}</span>
        </div>
      )}
      {metadataErrorMsg && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{metadataErrorMsg}</span>
        </div>
      )}

      {/* Form Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Metadata Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-2xl bg-surface border border-line space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h2 className="text-base font-bold text-ink">Thông tin Metadata</h2>
              <span className="text-xs text-muted">
                {isCreateMode ? 'Bước 1: Điền thông tin cơ bản' : `Pack ID: #${pack?.id}`}
              </span>
            </div>

            <form onSubmit={handleSaveMetadata} className="space-y-5">
              {/* Title Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="pack-title" className="text-xs font-bold text-ink">
                    Tiêu đề pack con trỏ <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-muted">{title.length} / 180</span>
                </div>
                <input
                  id="pack-title"
                  type="text"
                  required
                  maxLength={180}
                  disabled={isReadOnly || isSavingMetadata}
                  value={title}
                  onChange={handleTitleChange}
                  placeholder="Ví dụ: Neon Cyberpunk 2026"
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-canvas border text-sm text-ink placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${
                    fieldErrors['title'] ? 'border-red-500' : 'border-line'
                  }`}
                />
                {fieldErrors['title'] && (
                  <p className="text-xs text-red-500">{fieldErrors['title']}</p>
                )}
              </div>

              {/* Slug Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="pack-slug" className="text-xs font-bold text-ink">
                    Slug URL định danh <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-muted">{slug.length} / 200</span>
                </div>
                <div className="relative">
                  <input
                    id="pack-slug"
                    type="text"
                    required
                    maxLength={200}
                    disabled={isReadOnly || isSavingMetadata}
                    value={slug}
                    onChange={handleSlugChange}
                    placeholder="neon-cyberpunk-2026"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-canvas border text-sm font-mono text-ink placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${
                      fieldErrors['slug'] ? 'border-red-500' : 'border-line'
                    }`}
                  />
                </div>
                {fieldErrors['slug'] && (
                  <p className="text-xs text-red-500">{fieldErrors['slug']}</p>
                )}
                <p className="text-[11px] text-muted">
                  Định dạng chuẩn: chữ thường a-z, số 0-9 và dấu gạch ngang. Giữ nguyên sau khi xuất bản.
                </p>
              </div>

              {/* Category & Premium Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Category Select */}
                <div className="space-y-1.5">
                  <label htmlFor="pack-category" className="text-xs font-bold text-ink">
                    Danh mục <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="pack-category"
                    value={categoryId}
                    disabled={isReadOnly || isSavingMetadata}
                    onChange={(e) => setCategoryId(Number(e.target.value))}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-canvas border text-sm text-ink transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${
                      fieldErrors['category_id'] ? 'border-red-500' : 'border-line'
                    }`}
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.slug})
                      </option>
                    ))}
                  </select>
                  {fieldErrors['category_id'] && (
                    <p className="text-xs text-red-500">{fieldErrors['category_id']}</p>
                  )}
                </div>

                {/* Is Premium Toggle */}
                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="text-xs font-bold text-ink mb-1">Loại bộ sưu tập</label>
                  <label className="flex items-center gap-3 p-2.5 rounded-xl bg-canvas border border-line cursor-pointer hover:bg-raised/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={isPremium}
                      disabled={isReadOnly || isSavingMetadata}
                      onChange={(e) => setIsPremium(e.target.checked)}
                      className="w-4 h-4 rounded text-brand focus:ring-brand border-line"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-ink flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        Gói Cao Cấp (Premium)
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Description Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="pack-desc" className="text-xs font-bold text-ink">
                    Mô tả pack
                  </label>
                  <span className="text-[11px] text-muted">{description.length} / 4000</span>
                </div>
                <textarea
                  id="pack-desc"
                  rows={4}
                  maxLength={4000}
                  disabled={isReadOnly || isSavingMetadata}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Giới thiệu phong cách, chủ đề thiết kế và bảng màu của con trỏ..."
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-canvas border text-sm text-ink placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-brand ${
                    fieldErrors['description'] ? 'border-red-500' : 'border-line'
                  }`}
                />
                {fieldErrors['description'] && (
                  <p className="text-xs text-red-500">{fieldErrors['description']}</p>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="submit"
                  disabled={isReadOnly || isSavingMetadata}
                  className="px-6 py-2.5 rounded-xl bg-brand hover:bg-brand/90 text-white font-semibold text-sm shadow-md flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isSavingMetadata ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isCreateMode ? 'Đang tạo bản nháp...' : 'Đang lưu thay đổi...'}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {isCreateMode ? 'Tạo Bản Nháp Mới' : 'Lưu Thay Đổi Metadata'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Thumbnail & Summary */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-surface border border-line space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h3 className="text-base font-bold text-ink">Thumbnail Pack</h3>
              <ImageIcon className="w-4 h-4 text-muted" />
            </div>

            {isCreateMode ? (
              <div className="p-4 rounded-xl bg-raised/50 border border-dashed border-line text-center space-y-2">
                <Info className="w-6 h-6 text-muted mx-auto" />
                <p className="text-xs text-muted">
                  Sau khi tạo bản nháp pack, bạn có thể tải ảnh thumbnail (WebP/PNG) tại đây.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Thumbnail Display Box */}
                <div className="aspect-video w-full rounded-xl bg-canvas border border-line flex items-center justify-center overflow-hidden relative group">
                  {pack?.thumbnail_url || pack?.thumbnail?.content_url ? (
                    <img
                      src={pack.thumbnail_url || pack.thumbnail?.content_url || ''}
                      alt={pack.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted">
                      <ImageIcon className="w-8 h-8 opacity-40" />
                      <span className="text-xs">Chưa gán thumbnail</span>
                    </div>
                  )}

                  {isUploadingThumbnail && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                    </div>
                  )}
                </div>

                {/* Upload / Remove Actions */}
                {!isReadOnly && (
                  <div className="space-y-2">
                    <input
                      ref={thumbnailInputRef}
                      type="file"
                      accept="image/png,image/webp"
                      onChange={handleThumbnailFileSelected}
                      className="hidden"
                    />

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isUploadingThumbnail}
                        onClick={() => thumbnailInputRef.current?.click()}
                        className="flex-1 py-2 px-3 rounded-xl bg-raised hover:bg-raised/80 text-xs font-semibold text-ink border border-line transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5 text-brand" />
                        Tải ảnh thumbnail
                      </button>

                      {(pack?.thumbnail || pack?.thumbnail_url) && (
                        <button
                          type="button"
                          disabled={isUploadingThumbnail}
                          onClick={handleRemoveThumbnail}
                          className="p-2 rounded-xl text-red-500 hover:bg-red-500/10 border border-line transition-colors"
                          title="Gỡ thumbnail"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted text-center">
                      Hỗ trợ WebP, PNG tĩnh tối đa 512×512, dung lượng tối đa 2MB.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Publish Checklist & Validation Section (Only in Edit Mode) */}
      {!isCreateMode && pack && (
        <div className="space-y-4 pt-2">
          <PublishChecklist
            pack={pack}
            etag={etag}
            isReadOnly={isReadOnly}
            onPackUpdated={(result) => {
              setPack(result.data);
              setEtag(result.etag);
            }}
            onError={(msg) => setMetadataErrorMsg(msg)}
            onRefreshRequired={() => void fetchPackDetail()}
          />
        </div>
      )}

      {/* Role Asset Editor Section (Only in Edit Mode) */}
      {!isCreateMode && pack && (
        <div className="space-y-4 pt-6 border-t border-line">
          <RoleAssetEditor
            packId={pack.id}
            roles={pack.roles}
            assets={pack.assets}
            etag={etag}
            isReadOnly={isReadOnly}
            onRoleAssigned={handleRoleAssigned}
            onError={(msg) => setMetadataErrorMsg(msg)}
          />
        </div>
      )}

      {/* Live Interactive Sandbox Preview (Only in Edit Mode) */}
      {!isCreateMode && pack && (
        <div className="space-y-4 pt-6 border-t border-line">
          <AdminPackPreview
            pack={pack}
            roles={pack.roles}
          />
        </div>
      )}
    </div>
  );
};
