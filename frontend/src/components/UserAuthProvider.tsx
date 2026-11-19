/**
 * Custom Cursor Studio & Library — User Authentication Provider & Hook
 * Manages active user session state across the public interface.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { getMeUser, logoutUser, UserApiError } from '../lib/userApi.ts';
import type { UserView } from '../types/userAuth.ts';

export interface UserAuthContextValue {
  user: UserView | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: UserApiError | null;
  refreshAuth: () => Promise<UserView | null>;
  logout: () => Promise<void>;
}

const UserAuthContext = createContext<UserAuthContextValue | null>(null);

export function useUserAuth(): UserAuthContextValue {
  const context = useContext(UserAuthContext);
  if (!context) {
    throw new Error('useUserAuth must be used within a UserAuthProvider');
  }
  return context;
}

export interface UserAuthProviderProps {
  children: ReactNode;
}

export function UserAuthProvider({ children }: UserAuthProviderProps): React.ReactElement {
  const [user, setUser] = useState<UserView | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<UserApiError | null>(null);

  const refreshAuth = useCallback(async (): Promise<UserView | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getMeUser();
      setUser(res.user);
      return res.user;
    } catch (err: unknown) {
      if (err instanceof UserApiError) {
        // 401 or 404 (if user auth not enabled) is normal unauthenticated state
        if (!err.isUnauthorized && !err.isNotFound) {
          setError(err);
        }
      }
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await logoutUser();
    } catch {
      // Regardless of network errors, clear local state
    } finally {
      setUser(null);
      setError(null);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const res = await getMeUser();
        if (mounted) {
          setUser(res.user);
          setError(null);
        }
      } catch (err: unknown) {
        if (mounted) {
          setUser(null);
          if (err instanceof UserApiError && !err.isUnauthorized && !err.isNotFound) {
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

  const value: UserAuthContextValue = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    error,
    refreshAuth,
    logout,
  };

  return <UserAuthContext.Provider value={value}>{children}</UserAuthContext.Provider>;
}
