/**
 * Custom Cursor Studio & Library — Typed Admin API Client
 * Strictly aligned with ADMIN_SPEC.md, ADMIN_EXTENSION.md, and backend schemas.
 */

import { ApiError } from './api.ts';
import type { CursorRole, ApiErrorDetail, ApiErrorResponse, FastApiValidationResponse } from '../types/api.ts';
import type {
  AdminAuthResponse,
  AdminLoginRequest,
  AdminPackSummary,
  AdminPackDetail,
  AdminPackAsset,
  AdminPackRole,
  AdminPackPage,
  AdminPackQueryParams,
  AdminCreatePackRequest,
  AdminPatchPackRequest,
  AdminUploadAssetParams,
  AdminAssignRoleRequest,
  AdminValidationReport,
  AdminValidationIssue,
  AdminPackResult,
  AdminRequestOptions,
  AdminAssetKind,
  AdminPackStatus,
} from '../types/admin.ts';

/**
 * Specialized Admin API Error with convenient error classifier getters.
 */
export class AdminApiError extends ApiError {
  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorDetail[] | undefined;
    requestId?: string | null | undefined;
    retryAfter?: number | null | undefined;
  }) {
    super(params);
    this.name = 'AdminApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isPreconditionRequired(): boolean {
    return this.status === 428;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isRevisionConflict(): boolean {
    return this.status === 409 && this.code === 'REVISION_CONFLICT';
  }

  get isPackInvalid(): boolean {
    return this.status === 422 && this.code === 'PACK_INVALID';
  }
}

/**
 * Ephemeral In-Memory CSRF Token Storage.
 * Never persisted to localStorage or sessionStorage per security guidelines.
 */
let inMemoryCsrfToken: string | null = null;

export function getCsrfToken(): string | null {
  return inMemoryCsrfToken;
}

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token && token.trim().length > 0 ? token.trim() : null;
}

export function clearCsrfToken(): void {
  inMemoryCsrfToken = null;
}

/**
 * Retrieve the Admin API base URL.
 * When VITE_API_BASE_URL is configured (e.g. /api/v1), resolves to `${VITE_API_BASE_URL}/admin`.
 * Defaults to /api/v1/admin to be routed via the Vite dev proxy to backend.
 */
export function getAdminApiBaseUrl(): string {
  const env =
    typeof import.meta !== 'undefined' && 'env' in import.meta
      ? import.meta.env
      : undefined;
  const envUrl = env?.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    const clean = envUrl.trim().replace(/\/+$/, '');
    return `${clean}/admin`;
  }
  return '/api/v1/admin';
}

/**
 * Safely construct an Admin API endpoint URL with query parameters.
 */
export function buildAdminApiUrl(
  path: string,
  searchParams?: Record<string, string | number | undefined>
): string {
  const base = getAdminApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullPath = `${base}${cleanPath}`;

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost:5173';

  const url =
    fullPath.startsWith('http://') || fullPath.startsWith('https://')
      ? new URL(fullPath)
      : new URL(fullPath, origin);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

// ============================================================================
// Runtime Validators (TypeScript Strict — No `any`)
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(val: unknown, name: string): asserts val is string {
  if (typeof val !== 'string') {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: `Expected '${name}' to be a string, got ${typeof val}`,
    });
  }
}

function assertNumber(val: unknown, name: string): asserts val is number {
  if (typeof val !== 'number' || Number.isNaN(val)) {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: `Expected '${name}' to be a number, got ${typeof val}`,
    });
  }
}

function assertBoolean(val: unknown, name: string): asserts val is boolean {
  if (typeof val !== 'boolean') {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: `Expected '${name}' to be a boolean, got ${typeof val}`,
    });
  }
}

function assertArray(val: unknown, name: string): asserts val is unknown[] {
  if (!Array.isArray(val)) {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: `Expected '${name}' to be an array, got ${typeof val}`,
    });
  }
}

export function parseAuthResponse(data: unknown): AdminAuthResponse {
  if (!isRecord(data)) {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Expected AuthResponse object.',
    });
  }

  const { admin, csrf_token, expires_at } = data;
  if (!isRecord(admin)) {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Expected admin object in AuthResponse.',
    });
  }

  assertNumber(admin['id'], 'admin.id');
  assertString(admin['username'], 'admin.username');
  assertString(csrf_token, 'csrf_token');
  assertString(expires_at, 'expires_at');

  return {
    admin: {
      id: admin['id'],
      username: admin['username'],
    },
    csrf_token,
    expires_at,
  };
}

export function parsePackAsset(data: unknown): AdminPackAsset {
  if (!isRecord(data)) {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Expected PackAsset object.',
    });
  }

  assertString(data['asset_id'], 'asset_id');
  assertString(data['kind'], 'kind');
  if (data['kind'] !== 'preview' && data['kind'] !== 'thumbnail' && data['kind'] !== 'cursor') {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: `Invalid asset kind: ${data['kind']}`,
    });
  }
  assertString(data['mime_type'], 'mime_type');
  assertNumber(data['byte_size'], 'byte_size');
  assertString(data['sha256'], 'sha256');
  assertNumber(data['width'], 'width');
  assertNumber(data['height'], 'height');

  const hotspot_x = data['hotspot_x'] === null ? null : (typeof data['hotspot_x'] === 'number' ? data['hotspot_x'] : null);
  const hotspot_y = data['hotspot_y'] === null ? null : (typeof data['hotspot_y'] === 'number' ? data['hotspot_y'] : null);
  const content_url = data['content_url'] === null ? null : (typeof data['content_url'] === 'string' ? data['content_url'] : null);

  return {
    asset_id: data['asset_id'],
    kind: data['kind'] as AdminAssetKind,
    mime_type: data['mime_type'],
    byte_size: data['byte_size'],
    sha256: data['sha256'],
    width: data['width'],
    height: data['height'],
    hotspot_x,
    hotspot_y,
    content_url,
  };
}

export function parsePackRole(data: unknown): AdminPackRole {
  if (!isRecord(data)) {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Expected PackRole object.',
    });
  }

  assertString(data['role_type'], 'role_type');
  assertNumber(data['hotspot_x'], 'hotspot_x');
  assertNumber(data['hotspot_y'], 'hotspot_y');
  assertString(data['preview_url'], 'preview_url');

  const asset_id = data['asset_id'] === null ? null : (typeof data['asset_id'] === 'string' ? data['asset_id'] : null);
  const preview_asset_id =
    data['preview_asset_id'] === null
      ? null
      : typeof data['preview_asset_id'] === 'string'
      ? data['preview_asset_id']
      : null;

  return {
    role_type: data['role_type'] as CursorRole,
    asset_id,
    preview_asset_id,
    hotspot_x: data['hotspot_x'],
    hotspot_y: data['hotspot_y'],
    preview_url: data['preview_url'],
  };
}

export function parsePackSummary(data: unknown): AdminPackSummary {
  if (!isRecord(data)) {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Expected PackSummary object.',
    });
  }

  assertNumber(data['id'], 'id');
  assertString(data['title'], 'title');
  assertString(data['slug'], 'slug');
  assertNumber(data['category_id'], 'category_id');
  assertString(data['description'], 'description');
  assertBoolean(data['is_premium'], 'is_premium');
  assertBoolean(data['is_animated'], 'is_animated');
  assertString(data['status'], 'status');
  if (data['status'] !== 'draft' && data['status'] !== 'published') {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: `Invalid pack status: ${data['status']}`,
    });
  }
  assertBoolean(data['managed'], 'managed');
  const revision = data['revision'] === null ? null : typeof data['revision'] === 'number' ? data['revision'] : null;
  assertString(data['created_at'], 'created_at');
  assertString(data['updated_at'], 'updated_at');

  return {
    id: data['id'],
    title: data['title'],
    slug: data['slug'],
    category_id: data['category_id'],
    description: data['description'],
    is_premium: data['is_premium'],
    is_animated: data['is_animated'],
    status: data['status'] as AdminPackStatus,
    managed: data['managed'],
    revision,
    created_at: data['created_at'],
    updated_at: data['updated_at'],
  };
}

export function parsePackDetail(data: unknown): AdminPackDetail {
  const summary = parsePackSummary(data);
  const record = data as Record<string, unknown>;

  const thumbnail =
    record['thumbnail'] === null || record['thumbnail'] === undefined
      ? null
      : parsePackAsset(record['thumbnail']);

  const thumbnail_url =
    record['thumbnail_url'] === null || record['thumbnail_url'] === undefined
      ? null
      : typeof record['thumbnail_url'] === 'string'
      ? record['thumbnail_url']
      : null;

  assertArray(record['roles'], 'roles');
  const roles = record['roles'].map((item) => parsePackRole(item));

  assertArray(record['assets'], 'assets');
  const assets = record['assets'].map((item) => parsePackAsset(item));

  return {
    ...summary,
    thumbnail,
    thumbnail_url,
    roles,
    assets,
  };
}

export function parsePackPage(data: unknown): AdminPackPage {
  if (!isRecord(data)) {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Expected PackPage object.',
    });
  }

  assertArray(data['items'], 'items');
  const items = data['items'].map((item) => parsePackSummary(item));

  const pagination = data['pagination'];
  if (!isRecord(pagination)) {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Expected pagination object.',
    });
  }

  assertNumber(pagination['page'], 'pagination.page');
  assertNumber(pagination['limit'], 'pagination.limit');
  assertNumber(pagination['total'], 'pagination.total');
  assertNumber(pagination['total_pages'], 'pagination.total_pages');
  assertBoolean(pagination['has_next'], 'pagination.has_next');

  return {
    items,
    pagination: {
      page: pagination['page'],
      limit: pagination['limit'],
      total: pagination['total'],
      total_pages: pagination['total_pages'],
      has_next: pagination['has_next'],
    },
  };
}

export function parseValidationReport(data: unknown): AdminValidationReport {
  if (!isRecord(data)) {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Expected ValidationReport object.',
    });
  }

  assertBoolean(data['valid'], 'valid');
  assertNumber(data['pack_id'], 'pack_id');
  assertNumber(data['revision'], 'revision');
  assertArray(data['missing_roles'], 'missing_roles');
  const missing_roles = data['missing_roles'].map((r) => {
    assertString(r, 'missing_roles item');
    return r as CursorRole;
  });

  assertArray(data['errors'], 'errors');
  const errors = data['errors'].map((item) => {
    if (!isRecord(item)) {
      throw new AdminApiError({
        status: 422,
        code: 'MALFORMED_RESPONSE',
        message: 'Invalid error issue item in report.',
      });
    }
    assertString(item['code'], 'errors.code');
    assertString(item['field'], 'errors.field');
    assertString(item['message'], 'errors.message');
    return {
      code: item['code'],
      field: item['field'],
      message: item['message'],
    } satisfies AdminValidationIssue;
  });

  assertArray(data['warnings'], 'warnings');
  const warnings = data['warnings'].map((item) => {
    if (!isRecord(item)) {
      throw new AdminApiError({
        status: 422,
        code: 'MALFORMED_RESPONSE',
        message: 'Invalid warning issue item in report.',
      });
    }
    assertString(item['code'], 'warnings.code');
    assertString(item['field'], 'warnings.field');
    assertString(item['message'], 'warnings.message');
    return {
      code: item['code'],
      field: item['field'],
      message: item['message'],
    } satisfies AdminValidationIssue;
  });

  return {
    valid: data['valid'],
    pack_id: data['pack_id'],
    revision: data['revision'],
    missing_roles,
    errors,
    warnings,
  };
}

// ============================================================================
// HTTP Request Helpers & Error Envelope Parser
// ============================================================================

function isApiErrorResponse(data: unknown): data is ApiErrorResponse {
  if (!isRecord(data) || !isRecord(data['error'])) {
    return false;
  }
  const err = data['error'];
  return typeof err['code'] === 'string' || typeof err['message'] === 'string';
}

function isFastApiValidationResponse(data: unknown): data is FastApiValidationResponse {
  if (!isRecord(data) || !('detail' in data)) {
    return false;
  }
  return Array.isArray(data['detail']) || typeof data['detail'] === 'string';
}

async function parseAdminErrorResponse(response: Response): Promise<AdminApiError> {
  const status = response.status;
  const retryAfterHeader = response.headers.get('Retry-After');
  const parsedRetryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
  const retryAfter = Number.isNaN(parsedRetryAfter) ? null : parsedRetryAfter;
  const headerRequestId = response.headers.get('X-Request-ID');

  try {
    const text = await response.text();
    if (!text || text.trim().length === 0) {
      return new AdminApiError({
        status,
        code: `HTTP_${status}`,
        message: response.statusText || `Admin request failed with HTTP status ${status}`,
        requestId: headerRequestId,
        retryAfter,
      });
    }

    const data: unknown = JSON.parse(text);

    // 1. Structured backend error envelope: { error: { code, message, details, request_id } }
    if (isApiErrorResponse(data)) {
      const err = data.error;
      return new AdminApiError({
        status,
        code: err.code || `HTTP_${status}`,
        message: err.message || response.statusText || 'An error occurred',
        details: err.details,
        requestId: err.request_id || headerRequestId,
        retryAfter,
      });
    }

    // 2. FastAPI validation error: { detail: [ { loc, msg, type } ] }
    if (isFastApiValidationResponse(data)) {
      if (Array.isArray(data.detail)) {
        const details: ApiErrorDetail[] = data.detail.map((item) => ({
          field: item.loc.slice(1).join('.'),
          reason: item.msg,
        }));
        return new AdminApiError({
          status,
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters.',
          details,
          requestId: headerRequestId,
          retryAfter,
        });
      }

      if (typeof data.detail === 'string') {
        return new AdminApiError({
          status,
          code: `HTTP_${status}`,
          message: data.detail,
          requestId: headerRequestId,
          retryAfter,
        });
      }
    }

    // 3. Unrecognized JSON error payload
    return new AdminApiError({
      status,
      code: `HTTP_${status}`,
      message: response.statusText || `Admin request failed with HTTP status ${status}`,
      requestId: headerRequestId,
      retryAfter,
    });
  } catch {
    // 4. Non-JSON body
    return new AdminApiError({
      status,
      code: `HTTP_${status}`,
      message: response.statusText || `Admin request failed with HTTP status ${status}`,
      requestId: headerRequestId,
      retryAfter,
    });
  }
}

interface RequestConfig {
  method: string;
  path: string;
  searchParams?: Record<string, string | number | undefined> | undefined;
  body?: BodyInit | undefined;
  headers?: Record<string, string> | undefined;
  options?: AdminRequestOptions | undefined;
  isLogin?: boolean | undefined;
  ifMatch?: string | undefined;
}

/**
 * Common fetch executor for all Admin API calls.
 * - Always sends `credentials: 'include'`
 * - Attaches in-memory `X-CSRF-Token` for mutations (except login)
 * - Attaches `If-Match` when precondition is provided
 * - Passes `AbortSignal`
 * - Does NOT perform automatic retry on writes
 */
async function executeAdminRequest(config: RequestConfig): Promise<Response> {
  const url = buildAdminApiUrl(config.path, config.searchParams);
  const headers: Record<string, string> = { ...config.headers };

  // Attach CSRF Token for mutations after login
  const isMutation = config.method !== 'GET' && config.method !== 'HEAD';
  if (isMutation && !config.isLogin) {
    const csrfToken = config.options?.csrfToken ?? inMemoryCsrfToken;
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  // Attach If-Match header if provided
  const ifMatch = config.ifMatch ?? config.options?.ifMatch;
  if (ifMatch && ifMatch.trim().length > 0) {
    headers['If-Match'] = ifMatch.trim();
  }

  const init: RequestInit = {
    method: config.method,
    headers,
    credentials: 'include',
  };

  if (config.body !== undefined) {
    init.body = config.body;
  }

  if (config.options?.signal) {
    init.signal = config.options.signal;
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new AdminApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message,
    });
  }

  if (!response.ok) {
    throw await parseAdminErrorResponse(response);
  }

  return response;
}

// ============================================================================
// Admin API Client Implementation (A01 - A10)
// ============================================================================

/**
 * 1. POST /api/v1/admin/auth/login
 * Performs Admin authentication. Sets HTTP-only session cookie and saves CSRF token in memory.
 */
export async function login(
  credentials: AdminLoginRequest,
  options?: AdminRequestOptions
): Promise<AdminAuthResponse> {
  const response = await executeAdminRequest({
    method: 'POST',
    path: '/auth/login',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(credentials),
    options,
    isLogin: true,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Login returned malformed JSON response.',
    });
  }

  const parsed = parseAuthResponse(json);
  setCsrfToken(parsed.csrf_token);
  return parsed;
}

/**
 * 2. POST /api/v1/admin/auth/logout
 * Revokes active Admin session on server, removes cookie, and clears in-memory CSRF token.
 * Expects 204 No Content.
 */
export async function logout(options?: AdminRequestOptions): Promise<void> {
  try {
    await executeAdminRequest({
      method: 'POST',
      path: '/auth/logout',
      options,
    });
  } finally {
    clearCsrfToken();
  }
}

/**
 * 3. GET /api/v1/admin/auth/me
 * Retrieves current authenticated Admin user and refreshes in-memory CSRF token.
 */
export async function getMe(options?: AdminRequestOptions): Promise<AdminAuthResponse> {
  const response = await executeAdminRequest({
    method: 'GET',
    path: '/auth/me',
    headers: {
      Accept: 'application/json',
    },
    options,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'getMe returned malformed JSON response.',
    });
  }

  const parsed = parseAuthResponse(json);
  setCsrfToken(parsed.csrf_token);
  return parsed;
}

/**
 * 4. GET /api/v1/admin/packs
 * Retrieves a paginated list of packs including drafts for Admin management.
 */
export async function getPacks(
  params?: AdminPackQueryParams,
  options?: AdminRequestOptions
): Promise<AdminPackPage> {
  const searchParams: Record<string, string | number | undefined> = {
    status: params?.status,
    q: params?.q,
    page: params?.page,
    limit: params?.limit,
  };

  const response = await executeAdminRequest({
    method: 'GET',
    path: '/packs',
    searchParams,
    headers: {
      Accept: 'application/json',
    },
    options,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'getPacks returned malformed JSON response.',
    });
  }

  return parsePackPage(json);
}

/**
 * 5. POST /api/v1/admin/packs
 * Creates a new draft cursor pack.
 * Returns PackDetail along with response ETag and Location headers.
 */
export async function createPack(
  data: AdminCreatePackRequest,
  options?: AdminRequestOptions
): Promise<AdminPackResult> {
  const response = await executeAdminRequest({
    method: 'POST',
    path: '/packs',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(data),
    options,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'createPack returned malformed JSON response.',
    });
  }

  return {
    data: parsePackDetail(json),
    etag: response.headers.get('ETag'),
    location: response.headers.get('Location'),
  };
}

/**
 * 6. GET /api/v1/admin/packs/{id}
 * Retrieves full editable details for a pack by its database ID.
 */
export async function getPack(
  id: number | string,
  options?: AdminRequestOptions
): Promise<AdminPackResult> {
  const encodedId = encodeURIComponent(String(id));
  const response = await executeAdminRequest({
    method: 'GET',
    path: `/packs/${encodedId}`,
    headers: {
      Accept: 'application/json',
    },
    options,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'getPack returned malformed JSON response.',
    });
  }

  return {
    data: parsePackDetail(json),
    etag: response.headers.get('ETag'),
  };
}

/**
 * 7. PATCH /api/v1/admin/packs/{id}
 * Updates pack metadata or thumbnail binding. Requires If-Match precondition header.
 */
export async function updatePack(
  id: number | string,
  data: AdminPatchPackRequest,
  ifMatch?: string,
  options?: AdminRequestOptions
): Promise<AdminPackResult> {
  const encodedId = encodeURIComponent(String(id));
  const response = await executeAdminRequest({
    method: 'PATCH',
    path: `/packs/${encodedId}`,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(data),
    ifMatch,
    options,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'updatePack returned malformed JSON response.',
    });
  }

  return {
    data: parsePackDetail(json),
    etag: response.headers.get('ETag'),
  };
}

/**
 * 8. POST /api/v1/admin/packs/{id}/assets
 * Uploads an asset (PNG/WebP preview or CUR cursor) to a pack. Requires If-Match.
 * Uses multipart/form-data without manual Content-Type header.
 */
export async function uploadAsset(
  id: number | string,
  params: AdminUploadAssetParams,
  ifMatch?: string,
  options?: AdminRequestOptions
): Promise<AdminPackAsset> {
  const encodedId = encodeURIComponent(String(id));
  const formData = new FormData();
  formData.append('kind', params.kind);
  formData.append('file', params.file);

  const response = await executeAdminRequest({
    method: 'POST',
    path: `/packs/${encodedId}/assets`,
    headers: {
      Accept: 'application/json',
    },
    body: formData,
    ifMatch,
    options,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'uploadAsset returned malformed JSON response.',
    });
  }

  return parsePackAsset(json);
}

/**
 * 9. GET /api/v1/admin/packs/{id}/assets/{asset_id}/content
 * Retrieves binary authenticated image content (preview or thumbnail) as a Blob.
 */
export async function getAssetContent(
  id: number | string,
  assetId: string,
  options?: AdminRequestOptions
): Promise<Blob> {
  const encodedPackId = encodeURIComponent(String(id));
  const encodedAssetId = encodeURIComponent(assetId);

  const response = await executeAdminRequest({
    method: 'GET',
    path: `/packs/${encodedPackId}/assets/${encodedAssetId}/content`,
    headers: {
      Accept: 'image/png, image/webp',
    },
    options,
  });

  return await response.blob();
}

/**
 * 10. PUT /api/v1/admin/packs/{id}/roles/{role}
 * Assigns cursor and preview assets along with hotspot coordinates to a canonical role. Requires If-Match.
 */
export async function assignRole(
  id: number | string,
  role: CursorRole,
  data: AdminAssignRoleRequest,
  ifMatch?: string,
  options?: AdminRequestOptions
): Promise<AdminPackResult> {
  const encodedId = encodeURIComponent(String(id));
  const encodedRole = encodeURIComponent(role);

  const response = await executeAdminRequest({
    method: 'PUT',
    path: `/packs/${encodedId}/roles/${encodedRole}`,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(data),
    ifMatch,
    options,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'assignRole returned malformed JSON response.',
    });
  }

  return {
    data: parsePackDetail(json),
    etag: response.headers.get('ETag'),
  };
}

/**
 * 11. POST /api/v1/admin/packs/{id}/validate
 * Validates whether the draft pack satisfies all criteria to be published. Requires If-Match.
 */
export async function validatePack(
  id: number | string,
  ifMatch?: string,
  options?: AdminRequestOptions
): Promise<AdminValidationReport> {
  const encodedId = encodeURIComponent(String(id));
  const response = await executeAdminRequest({
    method: 'POST',
    path: `/packs/${encodedId}/validate`,
    headers: {
      Accept: 'application/json',
    },
    ifMatch,
    options,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'validatePack returned malformed JSON response.',
    });
  }

  return parseValidationReport(json);
}

/**
 * 12. POST /api/v1/admin/packs/{id}/publish
 * Publishes an Admin-managed pack to public Gallery. Requires If-Match.
 */
export async function publishPack(
  id: number | string,
  ifMatch?: string,
  options?: AdminRequestOptions
): Promise<AdminPackResult> {
  const encodedId = encodeURIComponent(String(id));
  const response = await executeAdminRequest({
    method: 'POST',
    path: `/packs/${encodedId}/publish`,
    headers: {
      Accept: 'application/json',
    },
    ifMatch,
    options,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'publishPack returned malformed JSON response.',
    });
  }

  return {
    data: parsePackDetail(json),
    etag: response.headers.get('ETag'),
  };
}

/**
 * 13. POST /api/v1/admin/packs/{id}/unpublish
 * Reverts a published pack back to draft status. Requires If-Match.
 */
export async function unpublishPack(
  id: number | string,
  ifMatch?: string,
  options?: AdminRequestOptions
): Promise<AdminPackResult> {
  const encodedId = encodeURIComponent(String(id));
  const response = await executeAdminRequest({
    method: 'POST',
    path: `/packs/${encodedId}/unpublish`,
    headers: {
      Accept: 'application/json',
    },
    ifMatch,
    options,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'unpublishPack returned malformed JSON response.',
    });
  }

  return {
    data: parsePackDetail(json),
    etag: response.headers.get('ETag'),
  };
}

/**
 * Grouped Admin API Client Object
 */
export const adminApi = {
  login,
  logout,
  getMe,
  getPacks,
  createPack,
  getPack,
  updatePack,
  uploadAsset,
  getAssetContent,
  assignRole,
  validatePack,
  publishPack,
  unpublishPack,
  getCsrfToken,
  setCsrfToken,
  clearCsrfToken,
  getAdminApiBaseUrl,
  buildAdminApiUrl,
};

export default adminApi;
