/**
 * Custom Cursor Studio & Library — Typed User Authentication API Client
 * Strictly aligned with USER_AUTH_TASKS.md and app/api/v1/user_auth.py.
 */

import type {
  UserView,
  RegistrationResponse,
  UserAuthResponse,
  UserRegisterRequest,
  UserLoginRequest,
  UserRequestOptions,
} from '../types/userAuth.ts';
import type { ApiErrorDetail, ApiErrorResponse, FastApiValidationResponse } from '../types/api.ts';

/**
 * In-memory CSRF token store for User sessions.
 * Never persisted to localStorage or sessionStorage.
 */
let userCsrfToken: string | null = null;

export function getUserCsrfToken(): string | null {
  return userCsrfToken;
}

export function setUserCsrfToken(token: string | null): void {
  userCsrfToken = token;
}

export function clearUserCsrfToken(): void {
  userCsrfToken = null;
}

/**
 * Get base API URL for User Auth endpoints.
 * Resolves to /api/v1 through Vite same-origin dev proxy.
 */
export function getUserApiBaseUrl(): string {
  const env =
    typeof import.meta !== 'undefined' && 'env' in import.meta
      ? (import.meta as { env?: Record<string, string> }).env
      : undefined;
  const envUrl = env?.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '/api/v1';
}

/**
 * User API Error class
 */
export class UserApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[] | undefined;
  readonly requestId: string | null | undefined;
  readonly retryAfter: number | null | undefined;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorDetail[] | undefined;
    requestId?: string | null | undefined;
    retryAfter?: number | null | undefined;
  }) {
    super(params.message);
    this.name = 'UserApiError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId;
    this.retryAfter = params.retryAfter;
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.code === 'AUTH_REQUIRED' || this.code === 'INVALID_CREDENTIALS';
  }

  get isEmailUnavailable(): boolean {
    return this.status === 409 || this.code === 'EMAIL_UNAVAILABLE';
  }

  get isRateLimited(): boolean {
    return this.status === 429 || this.code === 'RATE_LIMITED';
  }

  get isValidationError(): boolean {
    return this.status === 422 || this.code === 'VALIDATION_ERROR';
  }

  get isForbidden(): boolean {
    return this.status === 403 || this.code === 'CSRF_FAILED' || this.code === 'ORIGIN_DENIED';
  }

  get isNotFound(): boolean {
    return this.status === 404 || this.code === 'NOT_FOUND';
  }
}

function isApiErrorResponse(json: unknown): json is ApiErrorResponse {
  if (typeof json !== 'object' || json === null) return false;
  const error = (json as Record<string, unknown>)['error'];
  if (typeof error !== 'object' || error === null) return false;
  const e = error as Record<string, unknown>;
  return typeof e['code'] === 'string' && typeof e['message'] === 'string';
}

function isFastApiValidationResponse(json: unknown): json is FastApiValidationResponse {
  if (typeof json !== 'object' || json === null) return false;
  const detail = (json as Record<string, unknown>)['detail'];
  return Array.isArray(detail);
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  if (!header) return null;
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds) && seconds > 0) return seconds;
  const date = new Date(header);
  if (!isNaN(date.getTime())) {
    const diff = Math.ceil((date.getTime() - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }
  return null;
}

async function parseUserError(response: Response): Promise<UserApiError> {
  const status = response.status;
  const retryAfter = parseRetryAfter(response);
  const requestId = response.headers.get('X-Request-ID');

  let code = `HTTP_${status}`;
  let message = `Request failed with status ${status}`;
  let details: ApiErrorDetail[] | undefined = undefined;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const json: unknown = await response.json();
      if (isApiErrorResponse(json)) {
        code = json.error.code;
        message = json.error.message;
        details = json.error.details;
      } else if (isFastApiValidationResponse(json)) {
        code = 'VALIDATION_ERROR';
        message = 'Request validation failed.';
        if (Array.isArray(json.detail)) {
          details = json.detail.map((d) => ({
            field: Array.isArray(d.loc) ? d.loc.slice(1).join('.') : String(d.loc),
            reason: d.msg,
          }));
        } else if (typeof json.detail === 'string') {
          message = json.detail;
        }
      }
    } catch {
      // JSON parse error, keep fallback
    }
  }

  return new UserApiError({
    status,
    code,
    message,
    details,
    requestId,
    retryAfter,
  });
}

function parseUserView(data: unknown): UserView {
  if (typeof data !== 'object' || data === null) {
    throw new UserApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Invalid UserView data structure.',
    });
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj['id'] !== 'number' || typeof obj['email'] !== 'string') {
    throw new UserApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Missing or invalid fields in UserView.',
    });
  }
  return {
    id: obj['id'],
    email: obj['email'],
  };
}

function parseRegistrationResponse(data: unknown): RegistrationResponse {
  if (typeof data !== 'object' || data === null) {
    throw new UserApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Invalid RegistrationResponse.',
    });
  }
  const obj = data as Record<string, unknown>;
  return {
    user: parseUserView(obj['user']),
  };
}

function parseUserAuthResponse(data: unknown): UserAuthResponse {
  if (typeof data !== 'object' || data === null) {
    throw new UserApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Invalid UserAuthResponse.',
    });
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj['csrf_token'] !== 'string' || typeof obj['expires_at'] !== 'string') {
    throw new UserApiError({
      status: 422,
      code: 'MALFORMED_RESPONSE',
      message: 'Missing csrf_token or expires_at in UserAuthResponse.',
    });
  }
  return {
    user: parseUserView(obj['user']),
    csrf_token: obj['csrf_token'],
    expires_at: obj['expires_at'],
  };
}

/**
 * 1. POST /api/v1/auth/register
 * Registers a new public User account.
 * Contract: returns 201 with RegistrationResponse. Does NOT issue session cookie.
 */
export async function registerUser(
  data: UserRegisterRequest,
  options?: UserRequestOptions
): Promise<RegistrationResponse> {
  const url = `${getUserApiBaseUrl()}/auth/register`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const init: RequestInit = {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(data),
  };
  if (options?.signal) {
    init.signal = options.signal;
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    throw await parseUserError(response);
  }

  const json: unknown = await response.json();
  return parseRegistrationResponse(json);
}

/**
 * 2. POST /api/v1/auth/login
 * Authenticates a User account with email and password.
 * Sets __Secure-ccs_user / ccs_user_dev HttpOnly cookie.
 * Saves CSRF token in memory.
 */
export async function loginUser(
  data: UserLoginRequest,
  options?: UserRequestOptions
): Promise<UserAuthResponse> {
  const url = `${getUserApiBaseUrl()}/auth/login`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const init: RequestInit = {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(data),
  };
  if (options?.signal) {
    init.signal = options.signal;
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    throw await parseUserError(response);
  }

  const json: unknown = await response.json();
  const auth = parseUserAuthResponse(json);
  setUserCsrfToken(auth.csrf_token);
  return auth;
}

/**
 * 3. GET /api/v1/auth/me
 * Retrieves current active User session identity and refreshes in-memory CSRF token.
 */
export async function getMeUser(options?: UserRequestOptions): Promise<UserAuthResponse> {
  const url = `${getUserApiBaseUrl()}/auth/me`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const init: RequestInit = {
    method: 'GET',
    headers,
    credentials: 'include',
  };
  if (options?.signal) {
    init.signal = options.signal;
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    throw await parseUserError(response);
  }

  const json: unknown = await response.json();
  const auth = parseUserAuthResponse(json);
  setUserCsrfToken(auth.csrf_token);
  return auth;
}

/**
 * 4. POST /api/v1/auth/logout
 * Terminates user session on server (204 No Content) and clears in-memory CSRF token.
 */
export async function logoutUser(options?: UserRequestOptions): Promise<void> {
  const url = `${getUserApiBaseUrl()}/auth/logout`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const token = options?.csrfToken ?? getUserCsrfToken();
  if (token) {
    headers['X-CSRF-Token'] = token;
  }

  const init: RequestInit = {
    method: 'POST',
    headers,
    credentials: 'include',
  };
  if (options?.signal) {
    init.signal = options.signal;
  }

  try {
    const response = await fetch(url, init);

    if (!response.ok && response.status !== 204) {
      throw await parseUserError(response);
    }
  } finally {
    clearUserCsrfToken();
  }
}

/**
 * Validates and sanitizes internal redirect URLs.
 * Rejects external URLs, protocol-relative URLs (//...), backslashes, control characters,
 * and restricts /admin/* paths for regular users.
 */
export function getSafeRedirectUrl(
  target: string | null | undefined,
  fallback: string = '/'
): string {
  if (!target) return fallback;
  const trimmed = target.trim();

  // Must start with exactly one '/' and not contain backslashes
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return fallback;
  }

  // Reject /admin paths for regular users
  if (trimmed === '/admin' || trimmed.startsWith('/admin/')) {
    return fallback;
  }

  // Check URL origin integrity
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') {
      return fallback;
    }
    // Return relative path with pathname and search/hash if valid
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
