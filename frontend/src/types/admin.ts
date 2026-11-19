/**
 * Custom Cursor Studio & Library — Admin API Types & DTOs
 * Strictly aligned with ADMIN_SPEC.md and backend admin schemas.
 */

import type { CursorRole, ApiErrorDetail } from './api.ts';

/**
 * Admin User Identity
 */
export interface AdminIdentity {
  id: number;
  username: string;
}

/**
 * Response returned from POST /api/v1/admin/auth/login and GET /api/v1/admin/auth/me
 */
export interface AdminAuthResponse {
  admin: AdminIdentity;
  csrf_token: string;
  expires_at: string;
}

/**
 * Payload for POST /api/v1/admin/auth/login
 */
export interface AdminLoginRequest {
  username: string;
  password: string;
}

/**
 * Asset kinds supported by the Admin asset registry
 */
export type AdminAssetKind = 'preview' | 'thumbnail' | 'cursor';

export const ADMIN_ASSET_KINDS: readonly AdminAssetKind[] = [
  'preview',
  'thumbnail',
  'cursor',
] as const;

/**
 * Admin Pack Asset DTO
 */
export interface AdminPackAsset {
  asset_id: string;
  kind: AdminAssetKind;
  mime_type: string;
  byte_size: number;
  sha256: string;
  width: number;
  height: number;
  hotspot_x: number | null;
  hotspot_y: number | null;
  content_url: string | null;
}

/**
 * Admin Pack Role Assignment DTO
 */
export interface AdminPackRole {
  role_type: CursorRole;
  asset_id: string | null;
  preview_asset_id: string | null;
  hotspot_x: number;
  hotspot_y: number;
  preview_url: string;
}

/**
 * Pack Status in Admin
 */
export type AdminPackStatus = 'draft' | 'published';

/**
 * Pack Summary DTO in Admin pack listings (GET /api/v1/admin/packs)
 */
export interface AdminPackSummary {
  id: number;
  title: string;
  slug: string;
  category_id: number;
  description: string;
  is_premium: boolean;
  is_animated: boolean;
  status: AdminPackStatus;
  managed: boolean;
  revision: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Pack Detail DTO in Admin (GET /api/v1/admin/packs/{id})
 */
export interface AdminPackDetail extends AdminPackSummary {
  thumbnail: AdminPackAsset | null;
  thumbnail_url: string | null;
  roles: AdminPackRole[];
  assets: AdminPackAsset[];
}

/**
 * Pagination metadata for Admin pack listings
 */
export interface AdminPackPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
}

/**
 * Paginated Admin Pack List response (GET /api/v1/admin/packs)
 */
export interface AdminPackPage {
  items: AdminPackSummary[];
  pagination: AdminPackPagination;
}

/**
 * Query parameters for GET /api/v1/admin/packs
 */
export interface AdminPackQueryParams {
  status?: AdminPackStatus | undefined;
  q?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

/**
 * Payload to create a new draft pack (POST /api/v1/admin/packs)
 */
export interface AdminCreatePackRequest {
  title: string;
  slug: string;
  category_id: number;
  description: string;
  is_premium?: boolean | undefined;
  is_animated?: false | undefined;
}

/**
 * Payload to patch draft pack metadata (PATCH /api/v1/admin/packs/{id})
 */
export interface AdminPatchPackRequest {
  title?: string | undefined;
  slug?: string | undefined;
  category_id?: number | undefined;
  description?: string | undefined;
  is_premium?: boolean | undefined;
  is_animated?: false | undefined;
  thumbnail_asset_id?: string | null | undefined;
}

/**
 * Parameters for uploading an asset to a pack (POST /api/v1/admin/packs/{id}/assets)
 */
export interface AdminUploadAssetParams {
  file: Blob | File;
  kind: AdminAssetKind;
}

/**
 * Payload to assign a role to a pack (PUT /api/v1/admin/packs/{id}/roles/{role})
 */
export interface AdminAssignRoleRequest {
  asset_id: string;
  preview_asset_id: string;
  hotspot_x: number;
  hotspot_y: number;
}

/**
 * Individual validation issue in pack validation report
 */
export interface AdminValidationIssue {
  code: string;
  field: string;
  message: string;
}

/**
 * Report returned from POST /api/v1/admin/packs/{id}/validate
 */
export interface AdminValidationReport {
  valid: boolean;
  pack_id: number;
  revision: number;
  missing_roles: CursorRole[];
  errors: AdminValidationIssue[];
  warnings: AdminValidationIssue[];
}

/**
 * Mutation result with updated PackDetail and response headers (ETag, Location)
 */
export interface AdminPackResult {
  data: AdminPackDetail;
  etag: string | null;
  location?: string | null | undefined;
}

/**
 * Request options for Admin API calls
 */
export interface AdminRequestOptions {
  signal?: AbortSignal | undefined;
  csrfToken?: string | undefined;
  ifMatch?: string | undefined;
}

/**
 * Parameters for POST /api/v1/admin/tools/convert (Task U04/U07)
 */
export interface AdminConvertCursorParams {
  file: Blob | File;
  size: 32 | 48;
  hotspot_x: number;
  hotspot_y: number;
}

/**
 * Result returned by POST /api/v1/admin/tools/convert
 */
export interface AdminConvertCursorResult {
  blob: Blob;
  filename: string;
}

export type { ApiErrorDetail };
