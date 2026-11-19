/**
 * Custom Cursor Studio & Library — User Route Guard (Task U07)
 * Protects User features (Studio, Mix composer), prevents content flashing,
 * and preserves the target URL for safe post-login redirection.
 */

import React, { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useUserAuth } from './UserAuthProvider.tsx';

export interface UserRouteProps {
  children: ReactNode;
}

/**
 * Route guard component for User-protected views.
 * Ensures protected content is NEVER flashed while session verification is in progress.
 * If unauthenticated, safely redirects to /login with the target URL preserved in returnUrl.
 */
export function UserRoute({ children }: UserRouteProps): React.ReactElement {
  const { isAuthenticated, isLoading } = useUserAuth();
  const location = useLocation();

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
        <p className="text-sm font-medium text-muted">Đang kiểm tra phiên đăng nhập...</p>
      </div>
    );
  }

  // 2. Unauthenticated: Redirect to login with current internal URL preserved
  if (!isAuthenticated) {
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  // 3. Authenticated: Render children view
  return <>{children}</>;
}

export default UserRoute;
