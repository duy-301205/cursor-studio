/**
 * Custom Cursor Studio & Library — Mix & Match Storage & State Manager
 *
 * Implements strict rules per RULES.md F06 & DESIGN.md Section 4.7:
 * - localStorage key 'ccs.mix.v1', versioned schema, max 8 slots.
 * - Validates schema on read; gracefully falls back on corrupt data without crashing.
 * - Zero Blob/Base64 persistence; only stores pack references and preview URLs.
 * - Dispatches 'ccs-mix-updated' CustomEvent for reactive synchronization across components.
 * - Serializes to clean ShareConfig (pack_id + role_type only) for POST /api/v1/studio/share.
 */

import { useState, useEffect, useCallback } from 'react';
import type { CursorRole, MixRole, ShareConfig, ShareSource } from '../../types/api';

export const MIX_STORAGE_KEY = 'ccs.mix.v1';

export const ALL_CURSOR_ROLES: readonly MixRole[] = [
  'pointer',
  'link',
  'text',
  'busy',
  'working',
  'precision',
  'unavailable',
  'move',
] as const;

export interface MixSlotItem {
  pack_id: number;
  pack_title: string;
  pack_slug: string;
  role_type: CursorRole; // source item's original role
  preview_png_url: string;
  cursor_file_url?: string;
  hotspot_x: number;
  hotspot_y: number;
}

export interface LocalMixStateV1 {
  version: 1;
  title: string;
  roles: Partial<Record<MixRole, MixSlotItem>>;
  updatedAt: string;
}

/**
 * Creates a clean default empty mix state.
 */
export function createEmptyMix(title = 'My Custom Mix'): LocalMixStateV1 {
  return {
    version: 1,
    title,
    roles: {},
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Safely load and validate mix state from localStorage.
 * If data is corrupt or invalid, logs a warning and returns clean empty state.
 */
export function loadLocalMix(): LocalMixStateV1 {
  try {
    const raw = localStorage.getItem(MIX_STORAGE_KEY);
    if (!raw) {
      return createEmptyMix();
    }

    const parsed = JSON.parse(raw);

    // Validate schema
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || !parsed.roles) {
      console.warn('Corrupt or incompatible mix state in localStorage. Falling back to clean state.');
      return createEmptyMix();
    }

    const validatedRoles: Partial<Record<MixRole, MixSlotItem>> = {};
    const rolesObj = parsed.roles;

    for (const role of ALL_CURSOR_ROLES) {
      const item = rolesObj[role];
      if (
        item &&
        typeof item === 'object' &&
        typeof item.pack_id === 'number' &&
        typeof item.role_type === 'string' &&
        ALL_CURSOR_ROLES.includes(item.role_type) &&
        typeof item.preview_png_url === 'string' &&
        typeof item.hotspot_x === 'number' &&
        typeof item.hotspot_y === 'number'
      ) {
        validatedRoles[role] = {
          pack_id: item.pack_id,
          pack_title: typeof item.pack_title === 'string' ? item.pack_title : 'Custom Pack',
          pack_slug: typeof item.pack_slug === 'string' ? item.pack_slug : '',
          role_type: item.role_type,
          preview_png_url: item.preview_png_url,
          ...(typeof item.cursor_file_url === 'string' ? { cursor_file_url: item.cursor_file_url } : {}),
          hotspot_x: item.hotspot_x,
          hotspot_y: item.hotspot_y,
        };
      }
    }

    return {
      version: 1,
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'My Custom Mix',
      roles: validatedRoles,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch (err) {
    console.warn('Failed to parse mix state from localStorage:', err);
    return createEmptyMix();
  }
}

/**
 * Save mix state to localStorage and broadcast change event.
 */
export function saveLocalMix(mix: LocalMixStateV1): void {
  try {
    const toSave: LocalMixStateV1 = {
      version: 1,
      title: mix.title || 'My Custom Mix',
      roles: mix.roles,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(MIX_STORAGE_KEY, JSON.stringify(toSave));

    // Dispatch event for in-page reactivity
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ccs-mix-updated', { detail: toSave }));
    }
  } catch (err) {
    console.error('Failed to save mix state to localStorage:', err);
  }
}

/**
 * Clear all slots from local mix state.
 */
export function clearLocalMix(): void {
  saveLocalMix(createEmptyMix());
}

/**
 * Convert LocalMixStateV1 into a clean ShareConfig for POST /api/v1/studio/share.
 * Strips all local UI metadata and preview URLs per RULES.md F06.
 */
export function toShareConfig(mix: LocalMixStateV1): ShareConfig {
  const roles: Partial<Record<CursorRole, ShareSource>> = {};

  for (const role of ALL_CURSOR_ROLES) {
    const item = mix.roles[role];
    if (item) {
      roles[role] = {
        pack_id: item.pack_id,
        role_type: item.role_type,
      };
    }
  }

  return {
    version: 1,
    roles,
  };
}

/**
 * Count how many of the 8 roles are currently assigned.
 */
export function countAssignedRoles(roles: Partial<Record<MixRole, MixSlotItem>>): number {
  return Object.keys(roles).length;
}

/**
 * React hook for reactive synchronization with localStorage mix state.
 */
export function useLocalMix() {
  const [mix, setMix] = useState<LocalMixStateV1>(() => loadLocalMix());

  useEffect(() => {
    const handleUpdate = () => {
      setMix(loadLocalMix());
    };

    window.addEventListener('ccs-mix-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('ccs-mix-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const assignRole = useCallback((targetRole: MixRole, item: MixSlotItem) => {
    setMix((prev) => {
      const nextRoles = { ...prev.roles, [targetRole]: item };
      const nextMix: LocalMixStateV1 = {
        ...prev,
        roles: nextRoles,
        updatedAt: new Date().toISOString(),
      };
      saveLocalMix(nextMix);
      return nextMix;
    });
  }, []);

  const removeRole = useCallback((targetRole: MixRole) => {
    setMix((prev) => {
      const nextRoles = { ...prev.roles };
      delete nextRoles[targetRole];
      const nextMix: LocalMixStateV1 = {
        ...prev,
        roles: nextRoles,
        updatedAt: new Date().toISOString(),
      };
      saveLocalMix(nextMix);
      return nextMix;
    });
  }, []);

  const clearAll = useCallback(() => {
    const empty = createEmptyMix();
    saveLocalMix(empty);
    setMix(empty);
  }, []);

  const overwriteMix = useCallback((newMix: LocalMixStateV1) => {
    saveLocalMix(newMix);
    setMix(newMix);
  }, []);

  const setTitle = useCallback((title: string) => {
    setMix((prev) => {
      const nextMix: LocalMixStateV1 = {
        ...prev,
        title,
        updatedAt: new Date().toISOString(),
      };
      saveLocalMix(nextMix);
      return nextMix;
    });
  }, []);

  return {
    mix,
    assignRole,
    removeRole,
    clearAll,
    overwriteMix,
    setTitle,
    assignedCount: countAssignedRoles(mix.roles),
  };
}
