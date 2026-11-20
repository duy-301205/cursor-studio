import React, { useMemo, useState } from 'react';
import { Sparkles, Eye, Info, Crosshair } from 'lucide-react';
import type { CursorAsset, CursorRole } from '../../types/api.ts';
import { CURSOR_ROLES } from '../../types/api.ts';
import type { AdminPackDetail, AdminPackRole } from '../../types/admin.ts';
import { InteractiveSandbox } from '../InteractiveSandbox.tsx';

export interface AdminPackPreviewProps {
  pack: AdminPackDetail;
  roles: AdminPackRole[];
  className?: string | undefined;
}

export const AdminPackPreview: React.FC<AdminPackPreviewProps> = ({
  pack,
  roles,
  className = '',
}) => {
  const [inspectedRole, setInspectedRole] = useState<CursorRole | null>(null);

  // Map AdminPackRole[] to CursorAsset map expected by InteractiveSandbox
  const rolePreviews = useMemo(() => {
    const map: Partial<Record<CursorRole, CursorAsset>> = {};
    for (const r of roles) {
      if (r.preview_url) {
        map[r.role_type] = {
          role_type: r.role_type,
          cursor_file_url: '',
          preview_png_url: r.preview_url,
          hotspot_x: r.hotspot_x,
          hotspot_y: r.hotspot_y,
        };
      }
    }
    return map;
  }, [roles]);

  const sandboxAssignedCount = useMemo(() => {
    return CURSOR_ROLES.filter((r) => Boolean(rolePreviews[r])).length;
  }, [rolePreviews]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 1. Preview Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-surface border border-line">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-brand-soft text-brand">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink text-base">
              Interactive Windows Sandbox Preview — {pack.title || pack.slug}
            </h3>
            <p className="text-xs text-muted">
              Mô phỏng trải nghiệm con trỏ tương tác thực tế trên đủ 17 vùng vị trí Windows.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">
            {sandboxAssignedCount} / 17 Roles sẵn sàng trải nghiệm
          </span>
        </div>
      </div>

      {/* 2. Embedded Sandbox with independent theme */}
      <div className="relative">
        <InteractiveSandbox
          rolePreviews={rolePreviews}
          isAdmin={true}
          onRoleInspect={(role) => setInspectedRole(role)}
        />
      </div>

      {/* Role Inspection Info Banner */}
      {inspectedRole && (
        <div className="p-3.5 rounded-xl bg-surface border border-line flex items-center justify-between text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-ink">
            <Sparkles className="w-4 h-4 text-brand" />
            <span>
              Đang kiểm tra role: <strong className="font-mono">{inspectedRole}</strong>
            </span>
          </div>
          {rolePreviews[inspectedRole] ? (
            <div className="flex items-center gap-1.5 text-muted font-mono text-[11px]">
              <Crosshair className="w-3.5 h-3.5 text-brand" />
              <span>
                Hotspot: ({rolePreviews[inspectedRole]?.hotspot_x}, {rolePreviews[inspectedRole]?.hotspot_y})
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Info className="w-3.5 h-3.5" />
              <span>Role chưa được gán asset (sử dụng con trỏ mặc định hệ thống)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
