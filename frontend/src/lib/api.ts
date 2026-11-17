/**
 * Custom Cursor Studio & Library — Typed REST Client
 * Implements typed fetch wrappers for all 7 catalog and studio endpoints.
 */

import type {
  CategoryEntry,
  PackPage,
  PackDetail,
  CatalogQueryParams,
  ConvertCursorParams,
  DownloadResult,
  ShareRequest,
  ShareCreated,
  ShareView,
  ApiErrorDetail,
  ApiErrorResponse,
  FastApiValidationResponse,
} from '../types/api';

/**
 * Standardized API Error class for frontend error handling.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly ApiErrorDetail[];
  readonly requestId: string | null;
  readonly retryAfter: number | null;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorDetail[] | undefined;
    requestId?: string | null | undefined;
    retryAfter?: number | null | undefined;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details ?? [];
    this.requestId = params.requestId ?? null;
    this.retryAfter = params.retryAfter ?? null;
  }
}

/**
 * Options for API requests, supporting AbortSignal for cancellation.
 */
export interface RequestOptions {
  signal?: AbortSignal | undefined;
}

/**
 * Retrieve the base API URL from Vite environment variables.
 */
export function getApiBaseUrl(): string {
  const env =
    typeof import.meta !== 'undefined' && 'env' in import.meta
      ? import.meta.env
      : undefined;
  const envUrl = env?.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://localhost:8000/api/v1';
}

/**
 * Extract attachment filename from Content-Disposition header.
 */
export function parseContentDisposition(header: string | null, fallback: string): string {
  if (!header) {
    return fallback;
  }

  // Check RFC 5987 / 6266 filename* (UTF-8)
  const utf8Match = /filename\*=UTF-8''([^;\r\n"']+)/i.exec(header);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      // Fall through to regular filename match
    }
  }

  // Check regular filename="..."
  const filenameMatch = /filename=['"]?([^;\r\n"']+)['"]?/i.exec(header);
  if (filenameMatch && filenameMatch[1]) {
    return filenameMatch[1].trim();
  }

  return fallback;
}

/**
 * Safely construct an API endpoint URL with query parameters.
 */
export function buildApiUrl(
  path: string,
  searchParams?: Record<string, string | number | undefined>
): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${cleanPath}`);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

/**
 * Helper to build RequestInit conforming to exactOptionalPropertyTypes.
 */
function createRequestInit(
  method: string,
  headers?: Record<string, string>,
  body?: BodyInit,
  options?: RequestOptions
): RequestInit {
  const init: RequestInit = { method };
  if (headers) {
    init.headers = headers;
  }
  if (body) {
    init.body = body;
  }
  if (options?.signal) {
    init.signal = options.signal;
  }
  return init;
}

/**
 * Parse structured or standard error bodies from an HTTP response.
 */
async function parseErrorResponse(response: Response): Promise<ApiError> {
  const status = response.status;
  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;

  try {
    const text = await response.text();
    if (!text || text.trim().length === 0) {
      return new ApiError({
        status,
        code: `HTTP_${status}`,
        message: response.statusText || `Request failed with HTTP status ${status}`,
        retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
      });
    }

    const data: unknown = JSON.parse(text);

    // 1. Structured backend error: { error: { code, message, details, request_id } }
    if (typeof data === 'object' && data !== null && 'error' in data) {
      const errResponse = data as ApiErrorResponse;
      const err = errResponse.error;
      return new ApiError({
        status,
        code: err.code || `HTTP_${status}`,
        message: err.message || response.statusText || 'An error occurred',
        details: err.details,
        requestId: err.request_id,
        retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
      });
    }

    // 2. FastAPI validation error: { detail: [ { loc, msg, type } ] }
    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const fastApiData = data as FastApiValidationResponse;
      if (Array.isArray(fastApiData.detail)) {
        const details: ApiErrorDetail[] = fastApiData.detail.map((item) => ({
          field: item.loc.slice(1).join('.'),
          reason: item.msg,
        }));
        return new ApiError({
          status,
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters.',
          details,
          retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
        });
      }

      if (typeof fastApiData.detail === 'string') {
        return new ApiError({
          status,
          code: `HTTP_${status}`,
          message: fastApiData.detail,
          retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
        });
      }
    }

    // 3. Unrecognized JSON body
    return new ApiError({
      status,
      code: `HTTP_${status}`,
      message: response.statusText || `Request failed with HTTP status ${status}`,
      retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
    });
  } catch {
    // 4. Non-JSON body (e.g. plain text or HTML gateway error)
    return new ApiError({
      status,
      code: `HTTP_${status}`,
      message: response.statusText || `Request failed with HTTP status ${status}`,
      retryAfter: Number.isNaN(retryAfter) ? null : retryAfter,
    });
  }
}

/**
 * 1. GET /api/v1/categories
 * Retrieves all published categories with their respective pack counts.
 */
export async function getCategories(options?: RequestOptions): Promise<CategoryEntry[]> {
  const url = buildApiUrl('/categories');
  const init = createRequestInit('GET', { Accept: 'application/json' }, undefined, options);
  const response = await fetch(url, init);

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return (await response.json()) as CategoryEntry[];
}

/**
 * 2. GET /api/v1/packs
 * Retrieves a paginated list of published cursor packs with optional filter, sort, and search.
 */
export async function getPacks(
  params?: CatalogQueryParams,
  options?: RequestOptions
): Promise<PackPage> {
  const queryRecord: Record<string, string | number | undefined> = {
    category: params?.category,
    sort: params?.sort,
    q: params?.q,
    page: params?.page,
    limit: params?.limit,
  };

  const url = buildApiUrl('/packs', queryRecord);
  const init = createRequestInit('GET', { Accept: 'application/json' }, undefined, options);
  const response = await fetch(url, init);

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return (await response.json()) as PackPage;
}

/**
 * 3. GET /api/v1/packs/{slug}
 * Retrieves full details for a published pack by its URL slug, including all 8 cursor items.
 */
export async function getPackDetail(slug: string, options?: RequestOptions): Promise<PackDetail> {
  const encodedSlug = encodeURIComponent(slug);
  const url = buildApiUrl(`/packs/${encodedSlug}`);
  const init = createRequestInit('GET', { Accept: 'application/json' }, undefined, options);
  const response = await fetch(url, init);

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return (await response.json()) as PackDetail;
}

/**
 * 4. GET /api/v1/packs/{id}/download
 * Downloads the 15-slot quick-install ZIP package for a published pack.
 */
export async function downloadPackZip(id: number, options?: RequestOptions): Promise<DownloadResult> {
  const encodedId = encodeURIComponent(String(id));
  const url = buildApiUrl(`/packs/${encodedId}/download`);
  const init = createRequestInit('GET', undefined, undefined, options);
  const response = await fetch(url, init);

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  const blob = await response.blob();
  const filename = parseContentDisposition(
    response.headers.get('Content-Disposition'),
    `pack-${id}-windows.zip`
  );

  return { blob, filename };
}

/**
 * 5. POST /api/v1/studio/convert
 * Uploads an image (PNG/JPEG/WebP <= 2MB) with hotspot and size geometry to generate a binary .cur file.
 */
export async function convertCursor(
  params: ConvertCursorParams,
  options?: RequestOptions
): Promise<DownloadResult> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('size', String(params.size));
  formData.append('hotspot_x', String(params.hotspot_x));
  formData.append('hotspot_y', String(params.hotspot_y));

  const url = buildApiUrl('/studio/convert');
  // Note: Do NOT set 'Content-Type' header so fetch automatically includes the boundary parameter.
  const init = createRequestInit('POST', undefined, formData, options);
  const response = await fetch(url, init);

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  const blob = await response.blob();
  const filename = parseContentDisposition(
    response.headers.get('Content-Disposition'),
    'custom-cursor.cur'
  );

  return { blob, filename };
}

/**
 * 6. POST /api/v1/studio/share
 * Creates a time-limited shareable code for a personalized 8-role mix configuration.
 */
export async function createShare(
  payload: ShareRequest,
  options?: RequestOptions
): Promise<ShareCreated> {
  const url = buildApiUrl('/studio/share');
  const init = createRequestInit(
    'POST',
    {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    JSON.stringify(payload),
    options
  );
  const response = await fetch(url, init);

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return (await response.json()) as ShareCreated;
}

/**
 * 7. GET /api/v1/studio/share/{code}
 * Resolves a shared mix preset by its 8-12 character code.
 */
export async function getShare(code: string, options?: RequestOptions): Promise<ShareView> {
  const encodedCode = encodeURIComponent(code);
  const url = buildApiUrl(`/studio/share/${encodedCode}`);
  const init = createRequestInit('GET', { Accept: 'application/json' }, undefined, options);
  const response = await fetch(url, init);

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return (await response.json()) as ShareView;
}

/**
 * Grouped API Client Object
 */
export const apiClient = {
  getCategories,
  getPacks,
  getPackDetail,
  downloadPackZip,
  convertCursor,
  createShare,
  getShare,
};

export default apiClient;
