/**
 * Custom Cursor Studio & Library — Admin Login Page
 * Accessible login form with generic authentication error handling and rate limit countdown.
 */

import React, { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Lock, User, AlertCircle, Loader2, Clock } from 'lucide-react';
import { login, AdminApiError } from '../../lib/adminApi.ts';
import { useAdminAuth } from '../../components/admin/AdminRoute.tsx';

export function AdminLoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading: isCheckingAuth, refreshAuth } = useAdminAuth();

  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Retrieve destination path if redirected from an AdminRoute
  const state = location.state as { from?: { pathname?: string } } | null;
  const destination = state?.from?.pathname || '/admin/packs';

  // If already authenticated, redirect to destination immediately
  useEffect(() => {
    if (!isCheckingAuth && isAuthenticated) {
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, isCheckingAuth, navigate, destination]);

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

    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await login({ username: cleanUsername, password });
      // Refresh auth state in context
      await refreshAuth();
      navigate(destination, { replace: true });
    } catch (err: unknown) {
      if (err instanceof AdminApiError) {
        if (err.isUnauthorized) {
          // Generic authentication error message (never reveal whether user exists)
          setErrorMessage('Tên đăng nhập hoặc mật khẩu không chính xác.');
        } else if (err.isRateLimited) {
          const seconds = err.retryAfter ?? 60;
          setCountdown(seconds);
          setErrorMessage(`Quá nhiều lượt thử đăng nhập thất bại. Vui lòng thử lại sau ${seconds} giây.`);
        } else if (err.isForbidden) {
          setErrorMessage('Truy cập bị từ chối do nguồn gốc request không hợp lệ.');
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
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Admin Console</h1>
          <p className="text-sm text-muted">
            Đăng nhập để quản trị và xuất bản các bộ con trỏ Windows
          </p>
        </div>

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
          {/* Username Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="admin-username"
              className="block text-xs font-bold uppercase tracking-wider text-muted"
            >
              Tên đăng nhập
            </label>
            <div className="relative rounded-xl shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <User className="w-4 h-4" />
              </div>
              <input
                id="admin-username"
                name="username"
                type="text"
                autoComplete="username"
                required
                disabled={isSubmitting || countdown !== null}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-raised border border-line text-ink placeholder:text-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:bg-surface transition-all duration-150 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="admin-password"
              className="block text-xs font-bold uppercase tracking-wider text-muted"
            >
              Mật khẩu
            </label>
            <div className="relative rounded-xl shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="admin-password"
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
            disabled={isSubmitting || countdown !== null || !username || !password}
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
              <span>Đăng nhập</span>
            )}
          </button>
        </form>

        {/* Security Footer Note */}
        <div className="pt-4 border-t border-line text-center text-xs text-muted">
          <span>Phiên đăng nhập bảo mật bằng HTTP-only cookies và CSRF tokens trong bộ nhớ.</span>
        </div>
      </div>
    </div>
  );
}

export default AdminLoginPage;
