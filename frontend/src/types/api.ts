/**
 * Custom Cursor Studio & Library — Frontend API Types & DTOs
 * Strictly aligned with ARCHITECTURE.md (REST API contract) and backend schemas.
 */

/**
 * The 17 Windows cursor roles per CR-20261120-01 and ARCHITECTURE.md.
 * Ordered according to Windows Registry slots / Mouse Properties scheme.
 */
export type CursorRole =
  | 'pointer'
  | 'help'
  | 'working'
  | 'busy'
  | 'precision'
  | 'text'
  | 'handwriting'
  | 'unavailable'
  | 'resize_vertical'
  | 'resize_horizontal'
  | 'resize_diagonal_nwse'
  | 'resize_diagonal_nesw'
  | 'move'
  | 'alternate'
  | 'link'
  | 'location'
  | 'person';

export const CURSOR_ROLES: readonly CursorRole[] = [
  'pointer',
  'help',
  'working',
  'busy',
  'precision',
  'text',
  'handwriting',
  'unavailable',
  'resize_vertical',
  'resize_horizontal',
  'resize_diagonal_nwse',
  'resize_diagonal_nesw',
  'move',
  'alternate',
  'link',
  'location',
  'person',
] as const;

/**
 * The 8 legacy product roles supported by Mix & Match and Sandbox per contract v1.
 */
export const MIX_CURSOR_ROLES = [
  'pointer',
  'link',
  'text',
  'busy',
  'working',
  'precision',
  'unavailable',
  'move',
] as const;

export type MixRole = (typeof MIX_CURSOR_ROLES)[number];

export function isMixRole(role: string): role is MixRole {
  return (MIX_CURSOR_ROLES as readonly string[]).includes(role);
}

/**
 * Category Reference DTO
 */
export interface CategoryRef {
  id: number;
  name: string;
  slug: string;
}

/**
 * Category Entry DTO (GET /api/v1/categories)
 */
export interface CategoryEntry extends CategoryRef {
  sort_order: number;
  pack_count: number;
}

/**
 * Individual Cursor Role Asset DTO
 */
export interface CursorAsset {
  role_type: CursorRole;
  preview_png_url: string;
  cursor_file_url: string;
  hotspot_x: number;
  hotspot_y: number;
}

/**
 * Pack Cursor Item DTO with Database ID
 */
export interface PackCursor extends CursorAsset {
  id: number;
}

/**
 * Pack Summary Base DTO
 */
export interface PackSummary {
  id: number;
  category: CategoryRef;
  title: string;
  slug: string;
  description: string;
  thumbnail_url: string;
  is_animated: boolean;
  is_premium: boolean;
  download_count: number;
  created_at: string;
}

/**
 * Pack Card DTO used in Gallery listings (GET /api/v1/packs)
 */
export interface PackCard extends PackSummary {
  pointer: CursorAsset;
}

/**
 * Pack Detail DTO with all 8 cursor items (GET /api/v1/packs/{slug})
 */
export interface PackDetail extends PackSummary {
  updated_at: string;
  cursor_items: PackCursor[];
}

/**
 * Pagination Metadata DTO
 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
}

/**
 * Paginated Cursor Pack Page DTO (GET /api/v1/packs)
 */
export interface PackPage {
  items: PackCard[];
  pagination: Pagination;
}

/**
 * Sort options for the Catalog Query
 */
export type PackSort = 'popular' | 'newest';

/**
 * Query parameters for GET /api/v1/packs
 */
export interface CatalogQueryParams {
  category?: string | undefined;
  sort?: PackSort | undefined;
  q?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

/**
 * Canvas / Cursor geometry size options
 */
export type CursorSize = 32 | 48;

/**
 * Studio Convert Multipart Parameters (POST /api/v1/studio/convert)
 */
export interface ConvertCursorParams {
  file: Blob | File;
  size: CursorSize;
  hotspot_x: number;
  hotspot_y: number;
}

/**
 * Downloaded Binary Result (Blob + Extracted Filename)
 */
export interface DownloadResult {
  blob: Blob;
  filename: string;
}

/**
 * Share Source reference in Mix & Match config
 */
export interface ShareSource {
  pack_id: number;
  role_type: CursorRole;
}

/**
 * Mix & Match Configuration Schema (v1)
 */
export interface ShareConfig {
  version: 1;
  roles: Partial<Record<CursorRole, ShareSource>>;
}

/**
 * Request payload to create a shareable mix preset (POST /api/v1/studio/share)
 */
export interface ShareRequest {
  title: string;
  config: ShareConfig;
}

/**
 * Response payload upon successful share creation (POST /api/v1/studio/share)
 */
export interface ShareCreated {
  share_code: string;
  share_url: string;
  expires_at: string;
}

/**
 * Resolved cursor item returned in a shared preset view
 */
export interface ResolvedItem {
  target_role: CursorRole;
  pack_id: number;
  pack_title: string;
  role_type: CursorRole;
  preview_png_url: string;
  hotspot_x: number;
  hotspot_y: number;
}

/**
 * Response payload when resolving a shared preset (GET /api/v1/studio/share/{code})
 */
export interface ShareView {
  share_code: string;
  title: string;
  config: ShareConfig;
  resolved_items: ResolvedItem[];
  expires_at: string;
}

/**
 * Structured API Error Details
 */
export interface ApiErrorDetail {
  field: string;
  reason: string;
}

/**
 * Standard Catalog / Studio Error Response
 */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[] | undefined;
    request_id: string;
  };
}

/**
 * FastAPI Default Request Validation Error format
 */
export interface FastApiValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface FastApiValidationResponse {
  detail: FastApiValidationError[] | string;
}
