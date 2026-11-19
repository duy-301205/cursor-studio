/**
 * Custom Cursor Studio & Library — Admin Route Guard & Auth Context
 * Protects admin routes, prevents content flashing, and verifies session on reload.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, LogOut, Loader2, User } from 'lucide-react';
import { getMe, logout as apiLogout, AdminApiError } from '../../lib/adminApi.ts';
import type { AdminIdentity } from '../../types/admin.ts';

export interface AdminAuthContextValue {
  admin: AdminIdentity | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: AdminApiError | null;
  refreshAuth: () => Promise<AdminIdentity | null>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

/**
 * Hook to access the Admin Auth context
 */
export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}

export interface AdminAuthProviderProps {
  children: ReactNode;
}

/**
 * Admin Auth Provider — fetches GET /auth/me on mount and manages session state.
 */
export function AdminAuthProvider({ children }: AdminAuthProviderProps): React.ReactElement {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<AdminApiError | null>(null);

  const refreshAuth = useCallback(async (): Promise<AdminIdentity | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getMe();
      setAdmin(res.admin);
      return res.admin;
    } catch (err: unknown) {
      if (err instanceof AdminApiError) {
        setError(err);
      } else {
        setError(
          new AdminApiError({
            status: 0,
            code: 'AUTH_CHECK_FAILED',
            message: err instanceof Error ? err.message : 'Failed to verify session',
          })
        );
      }
      setAdmin(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const res = await getMe();
        if (mounted) {
          setAdmin(res.admin);
          setError(null);
        }
      } catch (err: unknown) {
        if (mounted) {
          setAdmin(null);
          if (err instanceof AdminApiError) {
            setError(err);
          }
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = useCallback(async (): Promise<void> => {
    try {
      await apiLogout();
    } catch {
      // Even if server revocation fails, clear client session state
    } finally {
      setAdmin(null);
      setError(null);
    }
  }, []);

  const value: AdminAuthContextValue = {
    admin,
    isLoading,
    isAuthenticated: admin !== null,
    error,
    refreshAuth,
    logout: handleLogout,
  };

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export interface AdminRouteProps {
  children: ReactNode;
}

/**
 * Route guard component for Admin-protected views.
 * Ensures protected content is NEVER flashed while session verification is in progress.
 */
export function AdminRoute({ children }: AdminRouteProps): React.ReactElement {
  const { admin, isLoading, isAuthenticated, logout } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const onLogoutClick = async (): Promise<void> => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/admin/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  // 1. Loading state: Never render children or redirect prematurely
  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-[50vh] flex flex-col items-center justify-center space-y-4 py-16"
      >
        <div className="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center animate-pulse">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-sm font-medium text-muted">Xác thực phiên quản trị viên...</p>
      </div>
    );
  }

  // 2. Unauthenticated: Redirect to login with previous location preserved
  if (!isAuthenticated || !admin) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  // 3. Authenticated: Render protected admin layout with admin topbar
  return (
    <div className="space-y-6">
      {/* Admin Subheader Bar */}
      <div className="bg-surface border border-line rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-brand">Admin Console</span>
              <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <User className="w-4 h-4 text-muted" />
              <span className="font-mono">{admin.username}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            type="button"
            onClick={onLogoutClick}
            disabled={isLoggingOut}
            aria-label="Đăng xuất khỏi phiên quản trị"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-line hover:border-danger/40 hover:bg-danger/10 text-muted hover:text-danger text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
          >
            {isLoggingOut ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>

      {/* Protected content */}
      <div>{children}</div>
    </div>
  );
}

export default AdminRoute;
