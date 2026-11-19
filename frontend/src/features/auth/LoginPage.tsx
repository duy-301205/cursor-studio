/**
 * Custom Cursor Studio & Library — Shared Login Page (/login)
 * Supports both User (email) and Admin (username) authentication in a unified form.
 * Dispatches to the single appropriate API based on identifier syntax.
 * Directs Admin to /admin/packs and User to safe internal destination or Gallery.
 */

import React, { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom';
import {
  Sparkles,
  Lock,
  User,
  AlertCircle,
  Loader2,
  Clock,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { loginUser, getSafeRedirectUrl, UserApiError } from '../../lib/userApi.ts';
import { login as loginAdmin, AdminApiError } from '../../lib/adminApi.ts';
import { useUserAuth } from '../../components/UserAuthProvider.tsx';
import { useAdminAuth } from '../../components/admin/AdminRoute.tsx';

export function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const {
    isAuthenticated: isUserAuth,
    isLoading: isCheckingUser,
    refreshAuth: refreshUserAuth,
  } = useUserAuth();

  const {
    isAuthenticated: isAdminAuth,
    isLoading: isCheckingAdmin,
    refreshAuth: refreshAdminAuth,
  } = useAdminAuth();

  const [identifier, setIdentifier] = useState<string>(() => {
    const state = location.state as { registeredEmail?: string } | null;
    return state?.registeredEmail || '';
  });
  const [password, setPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(() => {
    const state = location.state as { message?: string } | null;
    return state?.message || null;
  });
  const [countdown, setCountdown] = useState<number | null>(null);

  // Compute target destination from location state or search params
  const state = location.state as { from?: { pathname?: string } | string } | null;
  const rawTarget =
    (typeof state?.from === 'string' ? state.from : state?.from?.pathname) ||
    searchParams.get('redirect') ||
    searchParams.get('return_to') ||
    '/';
  const safeUserDestination = getSafeRedirectUrl(rawTarget, '/');

  // If already authenticated as user or admin, redirect accordingly
  useEffect(() => {
    if (!isCheckingAdmin && isAdminAuth) {
      navigate('/admin/packs', { replace: true });
      return;
    }
    if (!isCheckingUser && isUserAuth) {
      navigate(safeUserDestination, { replace: true });
    }
  }, [isAdminAuth, isUserAuth, isCheckingAdmin, isCheckingUser, navigate, safeUserDestination]);

  // Live countdown timer for 429 Rate Limit
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          setErrorMessage(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (isSubmitting || countdown !== null) return;

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ thông tin đăng nhập và mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Determine identity type: email -> User API, non-email -> Admin API
    const isUserEmail = cleanIdentifier.includes('@');

    try {
      if (isUserEmail) {
        // 1. Authenticate as User via POST /api/v1/auth/login
        await loginUser({ email: cleanIdentifier, password });
        await refreshUserAuth();
        navigate(safeUserDestination, { replace: true });
      } else {
        // 2. Authenticate as Admin via POST /api/v1/admin/auth/login
        await loginAdmin({ username: cleanIdentifier, password });
        await refreshAdminAuth();
        navigate('/admin/packs', { replace: true });
      }
    } catch (err: unknown) {
      if (err instanceof UserApiError || err instanceof AdminApiError) {
        if (err.isUnauthorized) {
          // Strict generic message per security invariants (never leaks existence)
          setErrorMessage('Thông tin đăng nhập hoặc mật khẩu không chính xác.');
        } else if (err.isRateLimited) {
          const seconds = err.retryAfter ?? 60;
          setCountdown(seconds);
          setErrorMessage(
            `Quá nhiều lượt thử đăng nhập thất bại. Vui lòng thử lại sau ${seconds} giây.`
          );
        } else if (err.isForbidden) {
          setErrorMessage('Truy cập bị từ chối do nguồn gốc request không hợp lệ.');
        } else if (err.status === 404) {
          setErrorMessage('Dịch vụ xác thực hiện chưa khả dụng trên máy chủ.');
        } else {
          setErrorMessage(err.message || 'Đăng nhập không thành công. Vui lòng thử lại.');
        }
      } else {
        setErrorMessage('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4 sm:px-6">
      <div className="bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-card space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-brand text-white flex items-center justify-center shadow-md">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Đăng Nhập</h1>
          <p className="text-sm text-muted">
            Đăng nhập bằng tài khoản <strong>Người dùng</strong> (email) hoặc{' '}
            <strong>Quản trị viên</strong> (username)
          </p>
        </div>

        {/* Success Announcement Banner */}
        {successMessage && (
          <div
            role="status"
            className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-sm flex items-start gap-3 animate-fadeIn"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="font-medium">{successMessage}</span>
          </div>
        )}

        {/* Error Announcement Banner */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            className="p-4 rounded-2xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-start gap-3 animate-fadeIn"
          >
            {countdown !== null ? (
              <Clock className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="font-semibold">{errorMessage}</span>
              {countdown !== null && (
                <div className="text-xs mt-1 text-danger/80">
                  Thời gian chờ còn lại: <span className="font-mono font-bold">{countdown}s</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Identifier Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="auth-identifier"
              className="block text-xs font-bold uppercase tracking-wider text-muted"
            >
              Email hoặc Tên đăng nhập
            </label>
            <div className="relative rounded-xl shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <User className="w-4 h-4" />
              </div>
              <input
                id="auth-identifier"
                name="identifier"
                type="text"
                autoComplete="username email"
                required
                disabled={isSubmitting || countdown !== null}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="user@example.com hoặc admin"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-raised border border-line text-ink placeholder:text-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:bg-surface transition-all duration-150 disabled:opacity-50"
              />
            </div>
            <p className="text-[11px] text-muted">
              Nhập email để đăng nhập tài khoản Người dùng, hoặc username để vào Quản trị viên.
            </p>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="auth-password"
              className="block text-xs font-bold uppercase tracking-wider text-muted"
            >
              Mật khẩu
            </label>
            <div className="relative rounded-xl shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={isSubmitting || countdown !== null}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-raised border border-line text-ink placeholder:text-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:bg-surface transition-all duration-150 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || countdown !== null || !identifier || !password}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold shadow-card transition-all duration-150 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xác thực...</span>
              </>
            ) : countdown !== null ? (
              <span>Thử lại sau ({countdown}s)</span>
            ) : (
              <>
                <span>Đăng nhập</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Navigation Switch to Register */}
        <div className="pt-2 text-center text-xs text-muted space-y-2">
          <p>
            Chưa có tài khoản Người dùng?{' '}
            <Link
              to="/register"
              state={{ from: rawTarget }}
              className="font-bold text-brand hover:underline"
            >
              Đăng ký ngay
            </Link>
          </p>

          <div className="pt-3 border-t border-line flex items-center justify-center gap-1.5 text-[11px] text-muted">
            <ShieldCheck className="w-3.5 h-3.5 text-brand" />
            <span>
              Quản trị viên cũng có thể sử dụng{' '}
              <Link to="/admin/login" className="hover:text-brand underline">
                Cổng Admin riêng
              </Link>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
