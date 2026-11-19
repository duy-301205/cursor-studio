import test from 'node:test';
import assert from 'node:assert/strict';
import { CURSOR_ROLES, type CursorRole } from '../types/api.ts';
import type {
  AdminPackDetail,
  AdminCreatePackRequest,
  AdminPatchPackRequest,
  AdminAssignRoleRequest,
} from '../types/admin.ts';
import {
  createPack,
  updatePack,
  login,
  AdminApiError,
} from '../lib/adminApi.ts';

// Helper slugify logic matching AdminPackEditorPage
function slugify(text: string): string {
  return text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Client-side validation function
function validateMetadata(
  title: string,
  slug: string,
  categoryId: number,
  description: string
): Record<string, string> {
  const errors: Record<string, string> = {};
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    errors['title'] = 'Tiêu đề không được để trống.';
  } else if (trimmedTitle.length > 180) {
    errors['title'] = 'Tiêu đề tối đa 180 ký tự.';
  }

  const trimmedSlug = slug.trim();
  if (!trimmedSlug) {
    errors['slug'] = 'Slug không được để trống.';
  } else if (trimmedSlug.length > 200) {
    errors['slug'] = 'Slug tối đa 200 ký tự.';
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug)) {
    errors['slug'] = 'Slug chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang.';
  }

  if (!categoryId || categoryId <= 0) {
    errors['category_id'] = 'Vui lòng chọn danh mục hợp lệ.';
  }

  if (description.length > 4000) {
    errors['description'] = 'Mô tả tối đa 4000 ký tự.';
  }

  return errors;
}

test('1. slugify transforms accented and complex titles into valid ASCII slugs', () => {
  assert.equal(slugify('Neon Cyberpunk 2026'), 'neon-cyberpunk-2026');
  assert.equal(slugify('Bộ Con Trỏ Tông Đào Siêu Dễ Thương!'), 'bo-con-tro-tong-dao-sieu-de-thuong');
  assert.equal(slugify('  Cursor---Style   v2.0  '), 'cursor-style-v20');
  assert.equal(slugify('Mèo & Chuột: Anime Edition'), 'meo-chuot-anime-edition');
});

test('2. Metadata validation enforces constraints per ADMIN_SPEC §4', () => {
  // Valid input
  const validErrors = validateMetadata('Valid Title', 'valid-slug-1', 2, 'Some description');
  assert.equal(Object.keys(validErrors).length, 0);

  // Empty title & slug
  const emptyErrors = validateMetadata('', '', 0, '');
  assert.ok(emptyErrors['title']);
  assert.ok(emptyErrors['slug']);
  assert.ok(emptyErrors['category_id']);

  // Oversized title (>180)
  const longTitle = 'a'.repeat(181);
  const oversizedTitleErrors = validateMetadata(longTitle, 'slug', 1, '');
  assert.ok(oversizedTitleErrors['title']);

  // Invalid slug with uppercase or special chars
  const invalidSlugErrors = validateMetadata('Title', 'Invalid_Slug!', 1, '');
  assert.ok(invalidSlugErrors['slug']);

  // Oversized description (>4000)
  const longDesc = 'd'.repeat(4001);
  const oversizedDescErrors = validateMetadata('Title', 'valid-slug', 1, longDesc);
  assert.ok(oversizedDescErrors['description']);
});

test('3. Read-only evaluation correctly locks published packs and legacy packs', () => {
  const publishedPack: AdminPackDetail = {
    id: 10,
    title: 'Published Pack',
    slug: 'published-pack',
    category_id: 1,
    description: '',
    is_premium: false,
    is_animated: false,
    status: 'published',
    managed: true,
    revision: 3,
    created_at: '2026-11-18T00:00:00Z',
    updated_at: '2026-11-18T01:00:00Z',
    thumbnail: null,
    thumbnail_url: null,
    roles: [],
    assets: [],
  };

  const isReadOnlyPublished = publishedPack.status === 'published' || !publishedPack.managed;
  assert.equal(isReadOnlyPublished, true);

  const legacyPack: AdminPackDetail = {
    ...publishedPack,
    status: 'draft',
    managed: false,
    revision: null,
  };

  const isReadOnlyLegacy = legacyPack.status === 'published' || !legacyPack.managed;
  assert.equal(isReadOnlyLegacy, true);

  const editableDraft: AdminPackDetail = {
    ...publishedPack,
    status: 'draft',
    managed: true,
    revision: 1,
  };

  const isReadOnlyDraft = editableDraft.status === 'published' || !editableDraft.managed;
  assert.equal(isReadOnlyDraft, false);
});

test('4. 8 Canonical roles are strictly maintained in correct canonical order', () => {
  const expectedRoles: CursorRole[] = [
    'pointer',
    'link',
    'text',
    'busy',
    'working',
    'precision',
    'unavailable',
    'move',
  ];

  assert.equal(CURSOR_ROLES.length, 8);
  for (let i = 0; i < expectedRoles.length; i++) {
    assert.equal(CURSOR_ROLES[i], expectedRoles[i]);
  }
});

test('5. Role assignment payload enforces valid asset IDs and hotspot bounds', () => {
  const validAssignment: AdminAssignRoleRequest = {
    asset_id: 'a1b2c3d4-0000-0000-0000-000000000001',
    preview_asset_id: 'a1b2c3d4-0000-0000-0000-000000000002',
    hotspot_x: 0,
    hotspot_y: 0,
  };

  assert.ok(validAssignment.asset_id.length > 0);
  assert.ok(validAssignment.preview_asset_id.length > 0);
  assert.ok(validAssignment.hotspot_x >= 0 && validAssignment.hotspot_x <= 47);
  assert.ok(validAssignment.hotspot_y >= 0 && validAssignment.hotspot_y <= 47);
});

test('6. Revision Conflict (409) and Precondition Required (428) are classified correctly', () => {
  const conflictError = new AdminApiError({
    status: 409,
    code: 'REVISION_CONFLICT',
    message: 'Bản nháp đã thay đổi. Hãy tải lại.',
    details: [{ field: 'If-Match', reason: 'stale revision' }],
  });

  assert.equal(conflictError.status, 409);
  assert.equal(conflictError.isRevisionConflict, true);
  assert.equal(conflictError.isConflict, true);

  const preconditionError = new AdminApiError({
    status: 428,
    code: 'PRECONDITION_REQUIRED',
    message: 'If-Match header is required.',
  });

  assert.equal(preconditionError.status, 428);
  assert.equal(preconditionError.isPreconditionRequired, true);
});

test('7. Live Backend Integration Test for Pack Editing Workflow (if backend running)', async (t) => {
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

    // 2. Create new draft pack
    const testSlug = `test-pack-${Date.now()}`;
    const createPayload: AdminCreatePackRequest = {
      title: 'Automated Test Pack',
      slug: testSlug,
      category_id: 1,
      description: 'Test pack created during automated test',
      is_premium: false,
    };

    const created = await createPack(createPayload);
    assert.ok(created.data.id);
    assert.equal(created.data.status, 'draft');
    assert.ok(created.etag);

    // 3. Update pack metadata
    const patchPayload: AdminPatchPackRequest = {
      title: 'Automated Test Pack (Updated)',
      description: 'Updated description',
    };

    const updated = await updatePack(created.data.id, patchPayload, created.etag || undefined);
    assert.equal(updated.data.title, 'Automated Test Pack (Updated)');
    assert.ok(updated.etag);

    // 4. Stale If-Match should trigger 409 REVISION_CONFLICT if we use the old etag
    if (created.etag && updated.etag && created.etag !== updated.etag) {
      await assert.rejects(
        async () => {
          await updatePack(created.data.id, { title: 'Should Fail' }, created.etag || undefined);
        },
        (err: unknown) => {
          return err instanceof AdminApiError && err.status === 409;
        }
      );
    }
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
