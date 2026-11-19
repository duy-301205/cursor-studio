/**
 * Custom Cursor Studio & Library — User Registration Page (/register)
 * Allows new users to create an account with email and password (15-128 chars).
 * Redirects to /login upon successful registration (contract: 201 does not set session).
 */

import React, { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  UserPlus,
  Lock,
  Mail,
  AlertCircle,
  Loader2,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { registerUser, UserApiError } from '../../lib/userApi.ts';
import { useUserAuth } from '../../components/UserAuthProvider.tsx';

export function RegisterPage(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading: isCheckingAuth } = useUserAuth();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // If already authenticated, redirect to home
  useEffect(() => {
    if (!isCheckingAuth && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isCheckingAuth, navigate]);

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

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ địa chỉ email và mật khẩu.');
      return;
    }

    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMessage('Địa chỉ email không đúng định dạng.');
      return;
    }

    // Enforce password requirements (8-128 chars)
    if (password.length < 8 || password.length > 128) {
      setErrorMessage('Mật khẩu bảo mật phải có độ dài từ 8 đến 128 ký tự.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await registerUser({ email: cleanEmail, password });
      // Redirect to /login with success message and pre-filled email
      const state = location.state as { from?: unknown } | null;
      navigate('/login', {
        state: {
          registeredEmail: cleanEmail,
          message: 'Đăng ký tài khoản thành công! Vui lòng đăng nhập bằng mật khẩu vừa tạo.',
          from: state?.from,
        },
        replace: true,
      });
    } catch (err: unknown) {
      if (err instanceof UserApiError) {
        if (err.isEmailUnavailable || err.status === 409) {
          setErrorMessage('Địa chỉ email này đã được sử dụng. Vui lòng đăng nhập hoặc dùng email khác.');
        } else if (err.isValidationError || err.status === 422) {
          setErrorMessage('Email không hợp lệ hoặc mật khẩu chưa đáp ứng yêu cầu (từ 8 đến 128 ký tự).');
        } else if (err.isRateLimited) {
          const seconds = err.retryAfter ?? 60;
          setCountdown(seconds);
          setErrorMessage(`Quá nhiều lượt đăng ký từ mạng của bạn. Vui lòng thử lại sau ${seconds} giây.`);
        } else if (err.isForbidden) {
          setErrorMessage('Yêu cầu bị từ chối do nguồn gốc request không hợp lệ.');
        } else if (err.status === 404) {
          setErrorMessage('Tính năng đăng ký tài khoản hiện chưa khả dụng trên máy chủ.');
        } else {
          setErrorMessage(err.message || 'Đăng ký không thành công. Vui lòng thử lại.');
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
            <UserPlus className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Tạo Tài Khoản</h1>
          <p className="text-sm text-muted">
            Đăng ký để tải trọn bộ con trỏ Windows, tùy biến trong Studio và tạo bản phối chia sẻ
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
                  Thời gian chờ: <span className="font-mono font-bold">{countdown}s</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Email Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-email"
              className="block text-xs font-bold uppercase tracking-wider text-muted"
            >
              Địa chỉ Email
            </label>
            <div className="relative rounded-xl shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="register-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={isSubmitting || countdown !== null}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-raised border border-line text-ink placeholder:text-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:bg-surface transition-all duration-150 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="register-password"
                className="block text-xs font-bold uppercase tracking-wider text-muted"
              >
                Mật khẩu
              </label>
              <span className="text-[11px] text-muted">Tối thiểu 8 ký tự</span>
            </div>
            <div className="relative rounded-xl shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="register-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                disabled={isSubmitting || countdown !== null}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-raised border border-line text-ink placeholder:text-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:bg-surface transition-all duration-150 disabled:opacity-50"
              />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted pt-0.5">
              <CheckCircle2
                className={`w-3.5 h-3.5 ${
                  password.length >= 8 ? 'text-emerald-500' : 'text-muted'
                }`}
              />
              <span>Yêu cầu từ 8 đến 128 ký tự (Argon2id hashing)</span>
            </div>
          </div>

          {/* Confirm Password Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-confirm-password"
              className="block text-xs font-bold uppercase tracking-wider text-muted"
            >
              Xác nhận mật khẩu
            </label>
            <div className="relative rounded-xl shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="register-confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                disabled={isSubmitting || countdown !== null}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-raised border border-line text-ink placeholder:text-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-focus focus:bg-surface transition-all duration-150 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={
              isSubmitting ||
              countdown !== null ||
              !email ||
              password.length < 8 ||
              password !== confirmPassword
            }
            className="w-full mt-2 py-3 px-4 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold shadow-card transition-all duration-150 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang tạo tài khoản...</span>
              </>
            ) : countdown !== null ? (
              <span>Thử lại sau ({countdown}s)</span>
            ) : (
              <>
                <span>Đăng ký</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Navigation Switch to Login */}
        <div className="pt-2 text-center text-xs text-muted space-y-2">
          <p>
            Đã có tài khoản?{' '}
            <Link
              to="/login"
              className="font-bold text-brand hover:underline"
            >
              Đăng nhập ngay
            </Link>
          </p>

          <div className="pt-3 border-t border-line text-[11px] text-muted flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-brand" />
            <span>Đăng ký chỉ cấp quyền Người dùng (User). Tài khoản Admin do CLI cấp.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
