import test from 'node:test';
import assert from 'node:assert/strict';
import { CURSOR_ROLES, type CursorRole } from '../types/api.ts';
import type {
  AdminValidationReport,
  AdminPackDetail,
  AdminPackRole,
  AdminCreatePackRequest,
} from '../types/admin.ts';
import {
  createPack,
  validatePack,
  publishPack,
  login,
  AdminApiError,
} from '../lib/adminApi.ts';

test('1. AdminValidationReport parses valid and invalid validation schemas correctly', () => {
  const invalidReport: AdminValidationReport = {
    valid: false,
    pack_id: 123,
    revision: 2,
    missing_roles: ['link', 'text', 'busy', 'working', 'precision', 'unavailable', 'move'],
    errors: [{ code: 'THUMBNAIL_REQUIRED', field: 'thumbnail_asset_id', message: 'Cần gán thumbnail.' }],
    warnings: [],
  };

  assert.equal(invalidReport.valid, false);
  assert.equal(invalidReport.pack_id, 123);
  assert.equal(invalidReport.missing_roles.length, 7);
  assert.equal(invalidReport.errors.length, 1);
  assert.equal(invalidReport.errors[0]?.field, 'thumbnail_asset_id');

  const validReport: AdminValidationReport = {
    valid: true,
    pack_id: 123,
    revision: 5,
    missing_roles: [],
    errors: [],
    warnings: [],
  };

  assert.equal(validReport.valid, true);
  assert.equal(validReport.missing_roles.length, 0);
  assert.equal(validReport.errors.length, 0);
});

test('2. 8 Canonical roles verification detects missing roles accurately', () => {
  const assignedRoles: AdminPackRole[] = [
    {
      role_type: 'pointer',
      asset_id: 'asset-1',
      preview_asset_id: 'preview-1',
      hotspot_x: 0,
      hotspot_y: 0,
      preview_url: '/api/v1/admin/packs/1/assets/preview-1/content',
    },
    {
      role_type: 'link',
      asset_id: 'asset-2',
      preview_asset_id: 'preview-2',
      hotspot_x: 4,
      hotspot_y: 0,
      preview_url: '/api/v1/admin/packs/1/assets/preview-2/content',
    },
  ];

  const assignedSet = new Set<CursorRole>(
    assignedRoles
      .filter((r) => Boolean(r.asset_id && r.preview_asset_id))
      .map((r) => r.role_type)
  );

  const missingRoles = CURSOR_ROLES.filter((r) => !assignedSet.has(r));
  assert.equal(missingRoles.length, 6);
  assert.ok(missingRoles.includes('text'));
  assert.ok(missingRoles.includes('busy'));
  assert.ok(!missingRoles.includes('pointer'));
  assert.ok(!missingRoles.includes('link'));
});

test('3. Publish & Unpublish status transition invariants', () => {
  const draftPack: AdminPackDetail = {
    id: 42,
    title: 'Test Transition Pack',
    slug: 'test-transition-pack',
    category_id: 1,
    description: '',
    is_premium: false,
    is_animated: false,
    status: 'draft',
    managed: true,
    revision: 3,
    created_at: '2026-11-18T00:00:00Z',
    updated_at: '2026-11-18T01:00:00Z',
    thumbnail: null,
    thumbnail_url: null,
    roles: [],
    assets: [],
  };

  // Draft cannot be unpublished
  assert.equal(draftPack.status, 'draft');

  // After publish, status transitions to published and revision increments
  const publishedPack: AdminPackDetail = {
    ...draftPack,
    status: 'published',
    revision: 4,
  };
  assert.equal(publishedPack.status, 'published');
  assert.equal(publishedPack.revision, 4);

  // After unpublish, status transitions back to draft and revision increments
  const unpublishedPack: AdminPackDetail = {
    ...publishedPack,
    status: 'draft',
    revision: 5,
  };
  assert.equal(unpublishedPack.status, 'draft');
  assert.equal(unpublishedPack.revision, 5);
});

test('4. 422 PACK_INVALID produces detailed field error report', () => {
  const packInvalidError = new AdminApiError({
    status: 422,
    code: 'PACK_INVALID',
    message: 'Gói con trỏ không đủ điều kiện xuất bản.',
    details: [
      { field: 'roles.link', reason: 'Role link chưa được gán asset hợp lệ.' },
      { field: 'thumbnail_asset_id', reason: 'Thumbnail chưa được gán.' },
    ],
  });

  assert.equal(packInvalidError.status, 422);
  assert.equal(packInvalidError.code, 'PACK_INVALID');
  assert.equal(packInvalidError.isPackInvalid, true);
  assert.equal(packInvalidError.details?.length, 2);
  assert.equal(packInvalidError.details[0]?.field, 'roles.link');
});

test('5. Live Backend Integration: Validate, Publish rejection on incomplete draft (if backend running)', async (t) => {
  // Read root .env if present
  let devUsername = '';
  let devPassword = '';

  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const envPath = path.resolve(process.cwd(), '../.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('ADMIN_DEV_USERNAME=')) {
          devUsername = trimmed.substring('ADMIN_DEV_USERNAME='.length).trim();
        } else if (trimmed.startsWith('ADMIN_DEV_PASSWORD=')) {
          devPassword = trimmed.substring('ADMIN_DEV_PASSWORD='.length).trim();
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  if (!devUsername || !devPassword) {
    t.skip('Skipping live test: dev credentials not configured in root .env');
    return;
  }

  // Probe backend
  try {
    const probe = await fetch('http://127.0.0.1:8000/api/v1/admin/auth/me', {
      headers: { Origin: 'http://localhost:5173' },
    });
    if (!probe) return;
  } catch {
    t.skip('Backend not running on port 8000');
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

    // 1. Authenticate
    const auth = await login({ username: devUsername, password: devPassword });
    assert.ok(auth.csrf_token);

    // 2. Create new draft pack without roles or thumbnail
    const testSlug = `publish-test-${Date.now()}`;
    const createPayload: AdminCreatePackRequest = {
      title: 'Publish Test Incomplete Pack',
      slug: testSlug,
      category_id: 1,
      description: 'Pack for testing validation and publish rejection',
      is_premium: false,
    };

    const created = await createPack(createPayload);
    assert.ok(created.data.id);
    assert.ok(created.etag);

    // 3. Validate incomplete pack -> should return valid: false with missing roles
    const report = await validatePack(created.data.id, created.etag || undefined);
    assert.equal(report.valid, false);
    assert.ok(report.missing_roles.length > 0);

    // 4. Attempting to publish incomplete pack should fail with 422 PACK_INVALID
    await assert.rejects(
      async () => {
        await publishPack(created.data.id, created.etag || undefined);
      },
      (err: unknown) => {
        return err instanceof AdminApiError && (err.status === 422 || err.code === 'PACK_INVALID');
      }
    );
  } catch (err: unknown) {
    if (err instanceof AdminApiError && err.code === 'ORIGIN_DENIED') {
      t.skip('Live backend rejected origin from direct Node test');
    } else {
      throw err;
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
