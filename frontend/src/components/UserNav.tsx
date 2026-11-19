/**
 * Custom Cursor Studio & Library — User Account Navigation Component (Task U06)
 * Renders account controls in desktop header and mobile drawer.
 * Displays login/register actions for guests, and profile menu + logout for authenticated users.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LogIn,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Layers,
  Sparkles,
  Loader2,
  Compass,
} from 'lucide-react';
import { useUserAuth } from './UserAuthProvider.tsx';
import { useAdminAuth } from './admin/AdminRoute.tsx';

export interface UserNavProps {
  isMobile?: boolean | undefined;
  onNavigate?: (() => void) | undefined;
}

export function UserNav({ isMobile = false, onNavigate }: UserNavProps): React.ReactElement {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: isUserLoading, logout } = useUserAuth();
  const { admin, isAuthenticated: isAdmin, isLoading: isAdminLoading } = useAdminAuth();

  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true);
    try {
      await logout();
      setDropdownOpen(false);
      onNavigate?.();
      navigate('/');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isLoading = isUserLoading || isAdminLoading;

  // -------------------------------------------------------------
  // Mobile Drawer Representation
  // -------------------------------------------------------------
  if (isMobile) {
    if (isLoading) {
      return (
        <div className="pt-4 border-t border-line flex items-center justify-center py-2 text-xs text-muted">
          <Loader2 className="w-4 h-4 animate-spin text-brand mr-2" />
          <span>Đang kiểm tra phiên...</span>
        </div>
      );
    }

    if (isAuthenticated && user) {
      const initial = user.email.charAt(0).toUpperCase();
      return (
        <div className="pt-4 mt-2 border-t border-line space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-raised border border-line">
            <div className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-ink truncate" title={user.email}>
                {user.email}
              </div>
              <div className="text-xs text-muted font-medium">
                Tài khoản Người dùng (#{user.id})
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className="w-full py-2.5 px-4 rounded-xl bg-danger/10 hover:bg-danger/20 text-danger text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isLoggingOut ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            <span>Đăng xuất</span>
          </button>
        </div>
      );
    }

    if (isAdmin && admin) {
      return (
        <div className="pt-4 mt-2 border-t border-line space-y-3">
          <Link
            to="/admin/packs"
            onClick={onNavigate}
            className="flex items-center gap-3 p-3 rounded-2xl bg-brand-soft border border-brand/30 text-ink"
          >
            <div className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-brand">{admin.username}</div>
              <div className="text-xs text-muted">Quản trị viên (Admin Console)</div>
            </div>
          </Link>
        </div>
      );
    }

    // Guest in Mobile Drawer
    return (
      <div className="pt-4 mt-2 border-t border-line grid grid-cols-2 gap-2">
        <Link
          to="/login"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-raised hover:bg-surface border border-line text-ink text-sm font-semibold transition-colors"
        >
          <LogIn className="w-4 h-4 text-muted" />
          <span>Đăng nhập</span>
        </Link>
        <Link
          to="/register"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold shadow-sm transition-all"
        >
          <span>Đăng ký</span>
        </Link>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Desktop Header Representation
  // -------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="w-9 h-9 rounded-xl bg-raised border border-line flex items-center justify-center animate-pulse">
        <Loader2 className="w-4 h-4 animate-spin text-muted" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    const initial = user.email.charAt(0).toUpperCase();
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          aria-expanded={dropdownOpen}
          aria-label="User account menu"
          className="flex items-center gap-2 p-1.5 pr-2.5 rounded-xl bg-raised hover:bg-surface border border-line text-ink transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus shadow-sm"
        >
          <div className="w-7 h-7 rounded-lg bg-brand text-white flex items-center justify-center font-bold text-xs shadow-sm">
            {initial}
          </div>
          <span className="text-xs font-semibold max-w-[130px] truncate hidden lg:inline">
            {user.email}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-muted transition-transform duration-150 ${
              dropdownOpen ? 'rotate-180 text-ink' : ''
            }`}
          />
        </button>

        {dropdownOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-64 rounded-2xl bg-surface border border-line shadow-float p-2 text-ink z-50 animate-fadeIn"
          >
            {/* Account Info Header */}
            <div className="px-3 py-2.5 rounded-xl bg-raised border border-line/60 mb-1 space-y-0.5">
              <div className="text-xs font-bold text-ink truncate" title={user.email}>
                {user.email}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>Thành viên</span>
                <span className="font-mono">ID: #{user.id}</span>
              </div>
            </div>

            {/* Quick Links */}
            <div className="space-y-0.5 py-1">
              <Link
                to="/mix"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-ink hover:bg-raised transition-colors"
              >
                <Layers className="w-4 h-4 text-brand" />
                <span>Bản phối Mix &amp; Match</span>
              </Link>
              <Link
                to="/studio"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-ink hover:bg-raised transition-colors"
              >
                <Sparkles className="w-4 h-4 text-brand" />
                <span>Photo Studio con trỏ</span>
              </Link>
              <Link
                to="/packs"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-ink hover:bg-raised transition-colors"
              >
                <Compass className="w-4 h-4 text-brand" />
                <span>Khám phá Gallery</span>
              </Link>
            </div>

            <div className="border-t border-line my-1" />

            {/* Logout Action */}
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
            >
              {isLoggingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              <span>Đăng xuất</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  if (isAdmin && admin) {
    return (
      <Link
        to="/admin/packs"
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-soft hover:bg-brand-soft/80 border border-brand/30 text-brand text-xs font-bold transition-colors shadow-sm"
        title="Truy cập Admin Console"
      >
        <ShieldCheck className="w-4 h-4" />
        <span className="hidden sm:inline">{admin.username}</span>
      </Link>
    );
  }

  // Desktop Guest Actions: Đăng nhập & Đăng ký
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Link
        to="/login"
        className="px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-ink hover:bg-raised transition-colors"
      >
        Đăng nhập
      </Link>
      <Link
        to="/register"
        className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-brand hover:bg-brand-hover text-white shadow-sm transition-all active:scale-95"
      >
        Đăng ký
      </Link>
    </div>
  );
}

export default UserNav;
