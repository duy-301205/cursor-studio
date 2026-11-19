/**
 * Custom Cursor Studio & Library — User Authentication DTOs
 * Aligned with USER_AUTH_TASKS.md and backend schemas in app/api/v1/user_auth.py.
 */

export interface UserView {
  id: number;
  email: string;
}

export interface RegistrationResponse {
  user: UserView;
}

export interface UserAuthResponse {
  user: UserView;
  csrf_token: string;
  expires_at: string;
}

export interface UserRegisterRequest {
  email: string;
  password: string;
}

export interface UserLoginRequest {
  email: string;
  password: string;
}

export interface UserRequestOptions {
  signal?: AbortSignal | undefined;
  csrfToken?: string | undefined;
}
