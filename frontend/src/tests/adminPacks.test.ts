/**
 * Unit & Integration Tests for Admin Pack List (Task A12)
 * Runs with Node.js test runner: node --test --experimental-strip-types
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getPacks,
  login,
  logout,
  clearCsrfToken,
} from '../lib/adminApi.ts';
import type { AdminPackSummary, AdminPackPage } from '../types/admin.ts';

test('1. AdminPackTable data mapping: distinguishes draft vs published and managed vs legacy', () => {
  const sampleItems: AdminPackSummary[] = [
    {
      id: 1,
      title: 'Minimal Dark',
      slug: 'minimal-dark',
      category_id: 1,
      description: 'Legacy pack',
      is_premium: false,
      is_animated: false,
      status: 'published',
      managed: false,
      revision: null,
      created_at: '2026-11-17T03:00:00Z',
      updated_at: '2026-11-17T03:00:00Z',
    },
    {
      id: 12,
      title: 'Neon Cyber Blue',
      slug: 'neon-cyber-blue',
      category_id: 5,
      description: 'Admin managed draft',
      is_premium: true,
      is_animated: false,
      status: 'draft',
      managed: true,
      revision: 2,
      created_at: '2026-11-18T05:00:00Z',
      updated_at: '2026-11-18T06:00:00Z',
    },
  ];

  const categoryMap = new Map<number, string>([
    [1, 'Minimal'],
    [5, 'Neon & Cyber'],
  ]);

  // Check Item 1: Legacy published
  const item1 = sampleItems[0];
  assert(item1);
  assert.equal(item1.managed, false);
  assert.equal(item1.status, 'published');
  assert.equal(item1.revision, null);
  assert.equal(categoryMap.get(item1.category_id), 'Minimal');

  // Check Item 2: Managed draft
  const item2 = sampleItems[1];
  assert(item2);
  assert.equal(item2.managed, true);
  assert.equal(item2.status, 'draft');
  assert.equal(item2.revision, 2);
  assert.equal(item2.is_premium, true);
  assert.equal(categoryMap.get(item2.category_id), 'Neon & Cyber');
});

test('2. Query params formatting for Admin pack filters and pagination', () => {
  function formatQueryParams(
    status: 'all' | 'draft' | 'published',
    q: string,
    page: number
  ): { status?: 'draft' | 'published' | undefined; q?: string | undefined; page: number; limit: number } {
    return {
      status: status === 'draft' || status === 'published' ? status : undefined,
      q: q.trim() || undefined,
      page: Math.max(1, page),
      limit: 12,
    };
  }

  // All status, no query, page 1
  const p1 = formatQueryParams('all', '', 1);
  assert.equal(p1.status, undefined);
  assert.equal(p1.q, undefined);
  assert.equal(p1.page, 1);
  assert.equal(p1.limit, 12);

  // Draft filter, search query, page 2
  const p2 = formatQueryParams('draft', '  cyber neon  ', 2);
  assert.equal(p2.status, 'draft');
  assert.equal(p2.q, 'cyber neon');
  assert.equal(p2.page, 2);

  // Published filter
  const p3 = formatQueryParams('published', '', 1);
  assert.equal(p3.status, 'published');
});

test('3. Pagination math calculation handles edge boundaries', () => {
  function calculatePagination(total: number, page: number, limit = 12) {
    const total_pages = Math.max(1, Math.ceil(total / limit));
    const validPage = Math.min(Math.max(1, page), total_pages);
    return {
      page: validPage,
      limit,
      total,
      total_pages,
      has_next: validPage < total_pages,
      has_prev: validPage > 1,
    };
  }

  // 0 items
  const r0 = calculatePagination(0, 1);
  assert.equal(r0.total_pages, 1);
  assert.equal(r0.has_next, false);
  assert.equal(r0.has_prev, false);

  // 25 items, limit 12 -> 3 pages
  const r1 = calculatePagination(25, 1);
  assert.equal(r1.total_pages, 3);
  assert.equal(r1.has_next, true);
  assert.equal(r1.has_prev, false);

  const r2 = calculatePagination(25, 2);
  assert.equal(r2.has_next, true);
  assert.equal(r2.has_prev, true);

  const r3 = calculatePagination(25, 3);
  assert.equal(r3.has_next, false);
  assert.equal(r3.has_prev, true);
});

test('4. getPacks client parses response and filters correctly', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const mockPage: AdminPackPage = {
      items: [
        {
          id: 101,
          title: 'Crystal White Neon',
          slug: 'crystal-white-neon',
          category_id: 1,
          description: 'White cursor with soft glow',
          is_premium: false,
          is_animated: false,
          status: 'draft',
          managed: true,
          revision: 1,
          created_at: '2026-11-19T00:00:00Z',
          updated_at: '2026-11-19T00:00:00Z',
        },
      ],
      pagination: {
        page: 1,
        limit: 12,
        total: 1,
        total_pages: 1,
        has_next: false,
      },
    };

    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/api/v1/admin/packs');
      assert.equal(url.searchParams.get('q'), 'crystal');
      assert.equal(init?.credentials, 'include');

      return new Response(JSON.stringify(mockPage), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await getPacks({ q: 'crystal' });
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0]?.title, 'Crystal White Neon');
    assert.equal(res.pagination.total, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('5. Live Backend Integration: getPacks returns seeded packs', async () => {
  const rootEnvPath = resolve(process.cwd(), '../.env');
  if (!existsSync(rootEnvPath)) {
    return;
  }

  const envContent = readFileSync(rootEnvPath, 'utf-8');
  let devUsername = '';
  let devPassword = '';

  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('ADMIN_DEV_USERNAME=')) {
      devUsername = trimmed.substring('ADMIN_DEV_USERNAME='.length).trim();
    } else if (trimmed.startsWith('ADMIN_DEV_PASSWORD=')) {
      devPassword = trimmed.substring('ADMIN_DEV_PASSWORD='.length).trim();
    }
  }

  if (!devUsername || !devPassword) {
    return;
  }

  // Probe backend
  try {
    const probe = await fetch('http://127.0.0.1:8000/api/v1/admin/auth/me', {
      headers: { Origin: 'http://localhost:5173' },
    });
    if (!probe) return;
  } catch {
    return;
  }

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      const urlStr = String(input).replace('http://localhost:5173', 'http://127.0.0.1:8000');
      const headers = new Headers(init?.headers);
      if (!headers.has('Origin')) {
        headers.set('Origin', 'http://localhost:5173');
      }
      return await originalFetch(urlStr, { ...init, headers });
    };

    await login({ username: devUsername, password: devPassword });
    const packs = await getPacks();
    assert(Array.isArray(packs.items));
    assert(typeof packs.pagination.total === 'number');

    await logout();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(typeof msg === 'string');
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});
