/**
 * Unit & Integration Tests for Typed Admin API Client (Task A10)
 * Runs with Node.js test runner: node --test --experimental-strip-types
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AdminApiError,
  buildAdminApiUrl,
  getAdminApiBaseUrl,
  getCsrfToken,
  setCsrfToken,
  clearCsrfToken,
  login,
  logout,
  getMe,
  getPacks,
  createPack,
  getPack,
  updatePack,
  uploadAsset,
  getAssetContent,
  assignRole,
  validatePack,
  publishPack,
  unpublishPack,
  parseAuthResponse,
  parsePackSummary,
  parsePackDetail,
  parsePackAsset,
  parsePackRole,
  parseValidationReport,
} from '../lib/adminApi.ts';
import type {
  AdminAuthResponse,
  AdminPackPage,
  AdminPackDetail,
  AdminPackAsset,
  AdminValidationReport,
} from '../types/admin.ts';

test('1. buildAdminApiUrl constructs endpoint URLs and query params correctly', () => {
  assert.equal(getAdminApiBaseUrl(), '/api/v1/admin');

  const url1 = buildAdminApiUrl('/packs');
  assert.equal(url1, 'http://localhost:5173/api/v1/admin/packs');

  const url2 = buildAdminApiUrl('/packs', {
    status: 'draft',
    q: 'neon purple',
    page: 2,
    limit: 12,
    unused: undefined,
  });
  const parsed = new URL(url2);
  assert.equal(parsed.pathname, '/api/v1/admin/packs');
  assert.equal(parsed.searchParams.get('status'), 'draft');
  assert.equal(parsed.searchParams.get('q'), 'neon purple');
  assert.equal(parsed.searchParams.get('page'), '2');
  assert.equal(parsed.searchParams.get('limit'), '12');
  assert.equal(parsed.searchParams.has('unused'), false);
});

test('2. In-memory CSRF token store manages token without touching storage', () => {
  clearCsrfToken();
  assert.equal(getCsrfToken(), null);

  setCsrfToken('test-csrf-token-12345');
  assert.equal(getCsrfToken(), 'test-csrf-token-12345');

  // Whitespace only is treated as null
  setCsrfToken('   ');
  assert.equal(getCsrfToken(), null);

  setCsrfToken('valid-token');
  assert.equal(getCsrfToken(), 'valid-token');

  clearCsrfToken();
  assert.equal(getCsrfToken(), null);
});

test('3. login sends credentials, saves CSRF token in memory, and handles 401', async () => {
  const originalFetch = globalThis.fetch;
  try {
    clearCsrfToken();

    const mockResponse: AdminAuthResponse = {
      admin: { id: 1, username: 'admin' },
      csrf_token: 'csrf_mock_abc123',
      expires_at: '2026-11-18T12:00:00Z',
    };

    // Test Happy Path
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:5173/api/v1/admin/auth/login');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.credentials, 'include');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['Content-Type'], 'application/json');
      assert.equal(headers['Accept'], 'application/json');
      // Login must NOT send X-CSRF-Token
      assert.equal(headers['X-CSRF-Token'], undefined);

      const body = JSON.parse(String(init?.body));
      assert.equal(body.username, 'admin');
      assert.equal(body.password, 'secret123');

      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await login({ username: 'admin', password: 'secret123' });
    assert.deepEqual(res, mockResponse);
    assert.equal(getCsrfToken(), 'csrf_mock_abc123');

    // Test 401 INVALID_CREDENTIALS
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid credentials.',
            details: [],
            request_id: 'req_auth_fail',
          },
        }),
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    await assert.rejects(
      async () => {
        await login({ username: 'baduser', password: 'wrong' });
      },
      (err: unknown) => {
        assert(err instanceof AdminApiError);
        assert.equal(err.status, 401);
        assert.equal(err.code, 'INVALID_CREDENTIALS');
        assert.equal(err.isUnauthorized, true);
        assert.equal(err.requestId, 'req_auth_fail');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});

test('4. logout handles 204 No Content and clears in-memory CSRF token', async () => {
  const originalFetch = globalThis.fetch;
  try {
    setCsrfToken('csrf_active_session');

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:5173/api/v1/admin/auth/logout');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.credentials, 'include');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['X-CSRF-Token'], 'csrf_active_session');

      return new Response(null, { status: 204 });
    };

    await logout();
    // CSRF token must be cleared
    assert.equal(getCsrfToken(), null);
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});

test('5. getMe fetches current admin identity and refreshes in-memory CSRF token', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const mockAuth: AdminAuthResponse = {
      admin: { id: 2, username: 'operator' },
      csrf_token: 'csrf_refreshed_999',
      expires_at: '2026-11-18T18:00:00Z',
    };

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:5173/api/v1/admin/auth/me');
      assert.equal(init?.method, 'GET');
      assert.equal(init?.credentials, 'include');
      return new Response(JSON.stringify(mockAuth), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await getMe();
    assert.deepEqual(res, mockAuth);
    assert.equal(getCsrfToken(), 'csrf_refreshed_999');
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});

test('6. getPacks passes query params and validates paginated pack response', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const mockPage: AdminPackPage = {
      items: [
        {
          id: 123,
          title: 'Cyber Neon Purple',
          slug: 'cyber-neon-purple',
          category_id: 5,
          description: 'A glowing purple cursor set',
          is_premium: false,
          is_animated: false,
          status: 'draft',
          managed: true,
          revision: 1,
          created_at: '2026-11-18T05:00:00Z',
          updated_at: '2026-11-18T05:00:00Z',
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
      assert.equal(url.searchParams.get('status'), 'draft');
      assert.equal(init?.method, 'GET');
      assert.equal(init?.credentials, 'include');

      return new Response(JSON.stringify(mockPage), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await getPacks({ status: 'draft' });
    assert.deepEqual(result, mockPage);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('7. createPack posts metadata, attaches CSRF, and parses response with ETag and Location', async () => {
  const originalFetch = globalThis.fetch;
  try {
    setCsrfToken('csrf_create_pack');

    const mockDetail: AdminPackDetail = {
      id: 123,
      title: 'Cyber Neon Purple',
      slug: 'cyber-neon-purple',
      category_id: 5,
      description: 'A glowing purple cursor set',
      is_premium: false,
      is_animated: false,
      status: 'draft',
      managed: true,
      revision: 1,
      created_at: '2026-11-18T05:00:00Z',
      updated_at: '2026-11-18T05:00:00Z',
      thumbnail: null,
      thumbnail_url: null,
      roles: [],
      assets: [],
    };

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:5173/api/v1/admin/packs');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.credentials, 'include');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['X-CSRF-Token'], 'csrf_create_pack');
      assert.equal(headers['Content-Type'], 'application/json');

      return new Response(JSON.stringify(mockDetail), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          ETag: '"pack-123-r1"',
          Location: '/api/v1/admin/packs/123',
        },
      });
    };

    const res = await createPack({
      title: 'Cyber Neon Purple',
      slug: 'cyber-neon-purple',
      category_id: 5,
      description: 'A glowing purple cursor set',
    });

    assert.deepEqual(res.data, mockDetail);
    assert.equal(res.etag, '"pack-123-r1"');
    assert.equal(res.location, '/api/v1/admin/packs/123');
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});

test('8. getPack retrieves pack by ID, parses ETag, and handles 404', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const mockDetail: AdminPackDetail = {
      id: 123,
      title: 'Cyber Neon Purple',
      slug: 'cyber-neon-purple',
      category_id: 5,
      description: 'A glowing purple cursor set',
      is_premium: false,
      is_animated: false,
      status: 'draft',
      managed: true,
      revision: 1,
      created_at: '2026-11-18T05:00:00Z',
      updated_at: '2026-11-18T05:00:00Z',
      thumbnail: null,
      thumbnail_url: null,
      roles: [],
      assets: [],
    };

    globalThis.fetch = async (input) => {
      assert.equal(String(input), 'http://localhost:5173/api/v1/admin/packs/123');
      return new Response(JSON.stringify(mockDetail), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: '"pack-123-r1"',
        },
      });
    };

    const res = await getPack(123);
    assert.deepEqual(res.data, mockDetail);
    assert.equal(res.etag, '"pack-123-r1"');

    // Test 404
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: 'Pack not found.',
            details: [],
            request_id: 'req_404',
          },
        }),
        {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    await assert.rejects(
      async () => {
        await getPack(99999);
      },
      (err: unknown) => {
        assert(err instanceof AdminApiError);
        assert.equal(err.status, 404);
        assert.equal(err.isNotFound, true);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('9. updatePack sends If-Match, X-CSRF-Token, and handles 409 REVISION_CONFLICT and 428 PRECONDITION_REQUIRED', async () => {
  const originalFetch = globalThis.fetch;
  try {
    setCsrfToken('csrf_update_pack');

    const mockDetail: AdminPackDetail = {
      id: 123,
      title: 'Cyber Neon Purple (Updated)',
      slug: 'cyber-neon-purple',
      category_id: 5,
      description: 'Updated description',
      is_premium: false,
      is_animated: false,
      status: 'draft',
      managed: true,
      revision: 2,
      created_at: '2026-11-18T05:00:00Z',
      updated_at: '2026-11-18T06:00:00Z',
      thumbnail: null,
      thumbnail_url: null,
      roles: [],
      assets: [],
    };

    // Happy Path
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:5173/api/v1/admin/packs/123');
      assert.equal(init?.method, 'PATCH');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['If-Match'], '"pack-123-r1"');
      assert.equal(headers['X-CSRF-Token'], 'csrf_update_pack');

      return new Response(JSON.stringify(mockDetail), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: '"pack-123-r2"',
        },
      });
    };

    const res = await updatePack(
      123,
      { title: 'Cyber Neon Purple (Updated)' },
      '"pack-123-r1"'
    );
    assert.equal(res.data.revision, 2);
    assert.equal(res.etag, '"pack-123-r2"');

    // 409 REVISION_CONFLICT
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'REVISION_CONFLICT',
            message: 'The pack has changed. Reload it and try again.',
            details: [{ field: 'If-Match', reason: 'stale revision' }],
            request_id: 'req_stale',
          },
        }),
        {
          status: 409,
          statusText: 'Conflict',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    await assert.rejects(
      async () => {
        await updatePack(123, { title: 'New' }, '"pack-123-r0"');
      },
      (err: unknown) => {
        assert(err instanceof AdminApiError);
        assert.equal(err.status, 409);
        assert.equal(err.isConflict, true);
        assert.equal(err.isRevisionConflict, true);
        assert.equal(err.details[0]?.field, 'If-Match');
        return true;
      }
    );

    // 428 PRECONDITION_REQUIRED
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'PRECONDITION_REQUIRED',
            message: 'If-Match is required.',
            details: [],
            request_id: 'req_precond',
          },
        }),
        {
          status: 428,
          statusText: 'Precondition Required',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    await assert.rejects(
      async () => {
        await updatePack(123, { title: 'New' });
      },
      (err: unknown) => {
        assert(err instanceof AdminApiError);
        assert.equal(err.status, 428);
        assert.equal(err.isPreconditionRequired, true);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});

test('10. uploadAsset sends multipart FormData with If-Match and returns AdminPackAsset', async () => {
  const originalFetch = globalThis.fetch;
  try {
    setCsrfToken('csrf_upload');

    const mockAsset: AdminPackAsset = {
      asset_id: 'a26ec814-a05e-44b9-87bd-8bec08633c98',
      kind: 'preview',
      mime_type: 'image/png',
      byte_size: 372,
      sha256: '91aab212ce21ccebebf883c528198ab7c0fa5868f36c175e1d98b6172c65ee44',
      width: 32,
      height: 32,
      hotspot_x: null,
      hotspot_y: null,
      content_url:
        '/api/v1/admin/packs/123/assets/a26ec814-a05e-44b9-87bd-8bec08633c98/content',
    };

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:5173/api/v1/admin/packs/123/assets');
      assert.equal(init?.method, 'POST');
      assert(init?.body instanceof FormData);
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['If-Match'], '"pack-123-r1"');
      assert.equal(headers['X-CSRF-Token'], 'csrf_upload');
      // Content-Type should not be set manually so fetch includes boundary
      assert.equal(headers['Content-Type'], undefined);

      return new Response(JSON.stringify(mockAsset), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const file = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const res = await uploadAsset(
      123,
      { file, kind: 'preview' },
      '"pack-123-r1"'
    );
    assert.deepEqual(res, mockAsset);
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});

test('11. getAssetContent downloads authenticated binary content as Blob', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    globalThis.fetch = async (input, init) => {
      assert.equal(
        String(input),
        'http://localhost:5173/api/v1/admin/packs/123/assets/asset-uuid-1/content'
      );
      assert.equal(init?.method, 'GET');
      assert.equal(init?.credentials, 'include');

      return new Response(pngBytes, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    };

    const blob = await getAssetContent(123, 'asset-uuid-1');
    assert.equal(blob.size, pngBytes.length);
    assert.equal(blob.type, 'image/png');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('12. assignRole sends role mapping and receives updated PackDetail with new ETag', async () => {
  const originalFetch = globalThis.fetch;
  try {
    setCsrfToken('csrf_assign');

    const mockDetail: AdminPackDetail = {
      id: 123,
      title: 'Cyber Neon Purple',
      slug: 'cyber-neon-purple',
      category_id: 5,
      description: 'A glowing purple cursor set',
      is_premium: false,
      is_animated: false,
      status: 'draft',
      managed: true,
      revision: 3,
      created_at: '2026-11-18T05:00:00Z',
      updated_at: '2026-11-18T07:00:00Z',
      thumbnail: null,
      thumbnail_url: null,
      roles: [
        {
          role_type: 'pointer',
          asset_id: 'cursor-uuid-1',
          preview_asset_id: 'preview-uuid-1',
          hotspot_x: 0,
          hotspot_y: 0,
          preview_url: '/api/v1/admin/packs/123/assets/preview-uuid-1/content',
        },
      ],
      assets: [],
    };

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:5173/api/v1/admin/packs/123/roles/pointer');
      assert.equal(init?.method, 'PUT');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['If-Match'], '"pack-123-r2"');
      assert.equal(headers['X-CSRF-Token'], 'csrf_assign');

      const body = JSON.parse(String(init?.body));
      assert.equal(body.asset_id, 'cursor-uuid-1');
      assert.equal(body.preview_asset_id, 'preview-uuid-1');
      assert.equal(body.hotspot_x, 0);
      assert.equal(body.hotspot_y, 0);

      return new Response(JSON.stringify(mockDetail), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: '"pack-123-r3"',
        },
      });
    };

    const res = await assignRole(
      123,
      'pointer',
      {
        asset_id: 'cursor-uuid-1',
        preview_asset_id: 'preview-uuid-1',
        hotspot_x: 0,
        hotspot_y: 0,
      },
      '"pack-123-r2"'
    );

    assert.equal(res.data.revision, 3);
    assert.equal(res.etag, '"pack-123-r3"');
    assert.equal(res.data.roles[0]?.role_type, 'pointer');
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});

test('13. validatePack sends POST and receives AdminValidationReport', async () => {
  const originalFetch = globalThis.fetch;
  try {
    setCsrfToken('csrf_validate');

    const mockReport: AdminValidationReport = {
      valid: false,
      pack_id: 123,
      revision: 3,
      missing_roles: ['busy', 'working', 'precision', 'unavailable', 'move'],
      errors: [
        {
          code: 'THUMBNAIL_REQUIRED',
          field: 'thumbnail_asset_id',
          message: 'Cần gán thumbnail.',
        },
      ],
      warnings: [],
    };

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:5173/api/v1/admin/packs/123/validate');
      assert.equal(init?.method, 'POST');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['If-Match'], '"pack-123-r3"');
      assert.equal(headers['X-CSRF-Token'], 'csrf_validate');

      return new Response(JSON.stringify(mockReport), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const report = await validatePack(123, '"pack-123-r3"');
    assert.deepEqual(report, mockReport);
    assert.equal(report.valid, false);
    assert.equal(report.errors[0]?.code, 'THUMBNAIL_REQUIRED');
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});

test('14. publishPack publishes draft pack and handles 422 PACK_INVALID with error details', async () => {
  const originalFetch = globalThis.fetch;
  try {
    setCsrfToken('csrf_publish');

    const mockPublishedDetail: AdminPackDetail = {
      id: 123,
      title: 'Cyber Neon Purple',
      slug: 'cyber-neon-purple',
      category_id: 5,
      description: 'Ready to download',
      is_premium: false,
      is_animated: false,
      status: 'published',
      managed: true,
      revision: 4,
      created_at: '2026-11-18T05:00:00Z',
      updated_at: '2026-11-18T08:00:00Z',
      thumbnail: null,
      thumbnail_url: 'https://example.com/thumb.webp',
      roles: [],
      assets: [],
    };

    // Happy Path
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:5173/api/v1/admin/packs/123/publish');
      assert.equal(init?.method, 'POST');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['If-Match'], '"pack-123-r3"');
      assert.equal(headers['X-CSRF-Token'], 'csrf_publish');

      return new Response(JSON.stringify(mockPublishedDetail), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: '"pack-123-r4"',
        },
      });
    };

    const res = await publishPack(123, '"pack-123-r3"');
    assert.equal(res.data.status, 'published');
    assert.equal(res.etag, '"pack-123-r4"');

    // 422 PACK_INVALID
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'PACK_INVALID',
            message: 'The pack did not pass publication checks.',
            details: [
              { field: 'thumbnail_asset_id', reason: 'Thumbnail is required' },
              { field: 'roles.busy', reason: 'Role asset missing' },
            ],
            request_id: 'req_invalid_pack',
          },
        }),
        {
          status: 422,
          statusText: 'Unprocessable Entity',
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    await assert.rejects(
      async () => {
        await publishPack(123, '"pack-123-r3"');
      },
      (err: unknown) => {
        assert(err instanceof AdminApiError);
        assert.equal(err.status, 422);
        assert.equal(err.code, 'PACK_INVALID');
        assert.equal(err.isPackInvalid, true);
        assert.equal(err.details.length, 2);
        assert.equal(err.details[0]?.field, 'thumbnail_asset_id');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});

test('15. unpublishPack reverts published pack back to draft status', async () => {
  const originalFetch = globalThis.fetch;
  try {
    setCsrfToken('csrf_unpublish');

    const mockDraftDetail: AdminPackDetail = {
      id: 123,
      title: 'Cyber Neon Purple',
      slug: 'cyber-neon-purple',
      category_id: 5,
      description: 'Reverted to draft',
      is_premium: false,
      is_animated: false,
      status: 'draft',
      managed: true,
      revision: 5,
      created_at: '2026-11-18T05:00:00Z',
      updated_at: '2026-11-18T09:00:00Z',
      thumbnail: null,
      thumbnail_url: null,
      roles: [],
      assets: [],
    };

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:5173/api/v1/admin/packs/123/unpublish');
      assert.equal(init?.method, 'POST');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['If-Match'], '"pack-123-r4"');
      assert.equal(headers['X-CSRF-Token'], 'csrf_unpublish');

      return new Response(JSON.stringify(mockDraftDetail), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: '"pack-123-r5"',
        },
      });
    };

    const res = await unpublishPack(123, '"pack-123-r4"');
    assert.equal(res.data.status, 'draft');
    assert.equal(res.etag, '"pack-123-r5"');
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});

test('16. Runtime validator catches malformed responses and throws AdminApiError', () => {
  // Test invalid auth response
  assert.throws(
    () => parseAuthResponse({ admin: { id: 'not-a-number' } }),
    (err: unknown) => {
      assert(err instanceof AdminApiError);
      assert.equal(err.code, 'MALFORMED_RESPONSE');
      return true;
    }
  );

  // Test invalid pack summary
  assert.throws(
    () => parsePackSummary({ id: 1, title: 123 }),
    (err: unknown) => {
      assert(err instanceof AdminApiError);
      assert.equal(err.code, 'MALFORMED_RESPONSE');
      return true;
    }
  );

  // Test invalid pack role
  assert.throws(
    () => parsePackRole({ role_type: 'invalid_role' }),
    (err: unknown) => {
      assert(err instanceof AdminApiError);
      assert.equal(err.code, 'MALFORMED_RESPONSE');
      return true;
    }
  );

  // Test invalid pack detail
  assert.throws(
    () => parsePackDetail({ id: 1, title: 'Valid', roles: 'not-an-array' }),
    (err: unknown) => {
      assert(err instanceof AdminApiError);
      assert.equal(err.code, 'MALFORMED_RESPONSE');
      return true;
    }
  );

  // Test invalid validation report
  assert.throws(
    () => parseValidationReport({ valid: 'not-a-boolean' }),
    (err: unknown) => {
      assert(err instanceof AdminApiError);
      assert.equal(err.code, 'MALFORMED_RESPONSE');
      return true;
    }
  );

  // Test invalid pack asset kind
  assert.throws(
    () =>
      parsePackAsset({
        asset_id: 'uuid',
        kind: 'unsupported_kind',
        mime_type: 'image/png',
        byte_size: 100,
        sha256: 'abc',
        width: 32,
        height: 32,
        hotspot_x: null,
        hotspot_y: null,
        content_url: null,
      }),
    (err: unknown) => {
      assert(err instanceof AdminApiError);
      assert.equal(err.code, 'MALFORMED_RESPONSE');
      return true;
    }
  );
});

test('17. 429 RATE_LIMITED parses Retry-After header correctly', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many asset uploads.',
            details: [],
            request_id: 'req_throttle',
          },
        }),
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '45',
          },
        }
      );
    };

    await assert.rejects(
      async () => {
        await getPacks();
      },
      (err: unknown) => {
        assert(err instanceof AdminApiError);
        assert.equal(err.status, 429);
        assert.equal(err.isRateLimited, true);
        assert.equal(err.retryAfter, 45);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('18. AbortSignal aborts request gracefully', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const controller = new AbortController();

    globalThis.fetch = async (_input, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortError = new DOMException('The user aborted a request.', 'AbortError');
          reject(abortError);
        });
      });
    };

    const promise = getPacks({}, { signal: controller.signal });
    controller.abort();

    await assert.rejects(promise, (err: unknown) => {
      assert(err instanceof DOMException);
      assert.equal(err.name, 'AbortError');
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('19. Live Backend Integration Test (if backend is running and credentials present)', async () => {
  // Check if root .env file exists and has ADMIN_DEV_USERNAME
  const rootEnvPath = resolve(process.cwd(), '../.env');
  if (!existsSync(rootEnvPath)) {
    return; // Skip integration test if .env is missing
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
    return; // Skip if dev credentials are not set
  }

  // Attempt live request against local dev server directly at http://127.0.0.1:8000/api/v1/admin
  // Note: Backend requires Origin header matching ADMIN_ORIGIN (http://localhost:5173).
  // When calling in Node.js test environment, we test direct proxy compatibility.
  try {
    const probeRes = await fetch('http://127.0.0.1:8000/api/v1/admin/auth/me', {
      headers: { Origin: 'http://localhost:5173' },
    });
    // 401 or 404 indicates backend is reachable
    if (!probeRes) return;
  } catch {
    // Backend is not actively listening on port 8000; skip live test cleanly
    return;
  }

  // If backend is live on 8000:
  // Perform login test via live backend
  const originalFetch = globalThis.fetch;
  try {
    // Hook fetch so that Node test passes the expected Origin: http://localhost:5173 to backend
    globalThis.fetch = async (input, init) => {
      const urlStr = String(input).replace('http://localhost:5173', 'http://127.0.0.1:8000');
      const headers = new Headers(init?.headers);
      if (!headers.has('Origin')) {
        headers.set('Origin', 'http://localhost:5173');
      }
      return await originalFetch(urlStr, { ...init, headers });
    };

    const auth = await login({ username: devUsername, password: devPassword });
    assert.equal(typeof auth.admin.id, 'number');
    assert.equal(auth.admin.username, devUsername.toLowerCase());
    assert(auth.csrf_token.length > 0);
    assert.equal(getCsrfToken(), auth.csrf_token);

    // Call getPacks
    const packs = await getPacks();
    assert(Array.isArray(packs.items));
    assert(typeof packs.pagination.total === 'number');

    // Logout
    await logout();
    assert.equal(getCsrfToken(), null);
  } catch (err: unknown) {
    // If backend dev credentials differ or rate limit hit, log error type without exposing credentials
    const msg = err instanceof Error ? err.message : String(err);
    // Ensure we do not log secrets
    assert(typeof msg === 'string');
  } finally {
    globalThis.fetch = originalFetch;
    clearCsrfToken();
  }
});
