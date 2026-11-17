/**
 * Unit & Integration Tests for Typed API Client & Contracts (Task T17)
 * Runs natively with Node.js test runner: node --test --experimental-strip-types
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  buildApiUrl,
  parseContentDisposition,
  getCategories,
  getPacks,
  getPackDetail,
  downloadPackZip,
  convertCursor,
  createShare,
  getShare,
} from '../lib/api.ts';
import type {
  CategoryEntry,
  PackPage,
  PackDetail,
  ShareCreated,
  ShareView,
  ShareRequest,
} from '../types/api.ts';

test('1. buildApiUrl properly constructs endpoints and serializes query params', () => {
  // Simple path without query
  const url1 = buildApiUrl('/categories');
  assert.equal(url1, 'http://localhost:8000/api/v1/categories');

  // Path with query parameters (ignoring undefined / empty strings)
  const url2 = buildApiUrl('/packs', {
    category: 'cute-kawaii',
    sort: 'popular',
    q: 'star cursor',
    page: 2,
    limit: 12,
    unused: undefined,
  });
  const parsed2 = new URL(url2);
  assert.equal(parsed2.pathname, '/api/v1/packs');
  assert.equal(parsed2.searchParams.get('category'), 'cute-kawaii');
  assert.equal(parsed2.searchParams.get('sort'), 'popular');
  assert.equal(parsed2.searchParams.get('q'), 'star cursor');
  assert.equal(parsed2.searchParams.get('page'), '2');
  assert.equal(parsed2.searchParams.get('limit'), '12');
  assert.equal(parsed2.searchParams.has('unused'), false);
});

test('2. parseContentDisposition extracts filenames accurately', () => {
  // Missing header returns fallback
  assert.equal(parseContentDisposition(null, 'fallback.zip'), 'fallback.zip');

  // Regular header with quotes
  const h1 = 'attachment; filename="crystal-white-windows.zip"';
  assert.equal(parseContentDisposition(h1, 'fallback.zip'), 'crystal-white-windows.zip');

  // Regular header without quotes
  const h2 = 'attachment; filename=custom-cursor.cur';
  assert.equal(parseContentDisposition(h2, 'fallback.zip'), 'custom-cursor.cur');

  // RFC 5987 / 6266 encoded filename*
  const h3 = "attachment; filename*=UTF-8''my%20cursor%20pack.zip";
  assert.equal(parseContentDisposition(h3, 'fallback.zip'), 'my cursor pack.zip');
});

test('3. getCategories fetches categories with proper headers and parses response', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const mockCategories: CategoryEntry[] = [
      { id: 1, name: 'Minimal', slug: 'minimal', sort_order: 10, pack_count: 2 },
      { id: 2, name: 'Cute & Kawaii', slug: 'cute-kawaii', sort_order: 20, pack_count: 1 },
    ];

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:8000/api/v1/categories');
      assert.equal(init?.method, 'GET');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['Accept'], 'application/json');

      return new Response(JSON.stringify(mockCategories), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await getCategories();
    assert.deepEqual(result, mockCategories);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('4. getPacks passes query parameters and returns paginated result', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const mockPage: PackPage = {
      items: [
        {
          id: 12,
          category: { id: 1, name: 'Minimal', slug: 'minimal' },
          title: 'Crystal White',
          slug: 'crystal-white',
          description: 'Clean white cursor set',
          thumbnail_url: 'https://cdn.example.com/thumb.webp',
          is_animated: false,
          is_premium: false,
          download_count: 1532,
          created_at: '2026-11-17T03:00:00Z',
          pointer: {
            role_type: 'pointer',
            preview_png_url: 'https://cdn.example.com/pointer.png',
            cursor_file_url: 'https://cdn.example.com/pointer.cur',
            hotspot_x: 0,
            hotspot_y: 0,
          },
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
      assert.equal(url.pathname, '/api/v1/packs');
      assert.equal(url.searchParams.get('category'), 'minimal');
      assert.equal(url.searchParams.get('sort'), 'popular');
      assert.equal(init?.method, 'GET');

      return new Response(JSON.stringify(mockPage), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await getPacks({ category: 'minimal', sort: 'popular' });
    assert.deepEqual(result, mockPage);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('5. getPackDetail encodes slug and handles 404 error correctly', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const mockDetail: PackDetail = {
      id: 12,
      category: { id: 1, name: 'Minimal', slug: 'minimal' },
      title: 'Crystal White',
      slug: 'crystal-white',
      description: 'Clean white cursor set',
      thumbnail_url: 'https://cdn.example.com/thumb.webp',
      is_animated: false,
      is_premium: false,
      download_count: 1532,
      created_at: '2026-11-17T03:00:00Z',
      updated_at: '2026-11-17T03:00:00Z',
      cursor_items: [
        {
          id: 101,
          role_type: 'pointer',
          preview_png_url: 'https://cdn.example.com/pointer.png',
          cursor_file_url: 'https://cdn.example.com/pointer.cur',
          hotspot_x: 0,
          hotspot_y: 0,
        },
      ],
    };

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/api/v1/packs/crystal%20white');

      return new Response(JSON.stringify(mockDetail), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await getPackDetail('crystal white');
    assert.deepEqual(result, mockDetail);

    // Test 404 error handling
    globalThis.fetch = async () => {
      const errorBody = {
        error: {
          code: 'PACK_NOT_FOUND',
          message: 'Cursor pack not found.',
          details: [],
          request_id: 'req_test123',
        },
      };
      return new Response(JSON.stringify(errorBody), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await assert.rejects(
      async () => {
        await getPackDetail('non-existent');
      },
      (err: unknown) => {
        assert(err instanceof ApiError);
        assert.equal(err.status, 404);
        assert.equal(err.code, 'PACK_NOT_FOUND');
        assert.equal(err.requestId, 'req_test123');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('6. downloadPackZip downloads binary ZIP and extracts filename', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const mockBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK..

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:8000/api/v1/packs/12/download');
      assert.equal(init?.method, 'GET');

      return new Response(mockBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="crystal-white-windows.zip"',
        },
      });
    };

    const download = await downloadPackZip(12);
    assert.equal(download.filename, 'crystal-white-windows.zip');
    assert.equal(download.blob.size, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('7. convertCursor sends multipart FormData without manual Content-Type and returns .cur Blob', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const dummyPng = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    const mockCurBytes = new Uint8Array([0x00, 0x00, 0x02, 0x00]); // Windows CUR magic

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:8000/api/v1/studio/convert');
      assert.equal(init?.method, 'POST');
      assert(init?.body instanceof FormData);

      const formData = init.body as FormData;
      assert.equal(formData.get('size'), '32');
      assert.equal(formData.get('hotspot_x'), '4');
      assert.equal(formData.get('hotspot_y'), '4');

      return new Response(mockCurBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="custom-cursor.cur"',
        },
      });
    };

    const result = await convertCursor({
      file: dummyPng,
      size: 32,
      hotspot_x: 4,
      hotspot_y: 4,
    });

    assert.equal(result.filename, 'custom-cursor.cur');
    assert.equal(result.blob.size, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('8. createShare sends JSON payload and receives 201 Created share metadata', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const requestPayload: ShareRequest = {
      title: 'My soft glow setup',
      config: {
        version: 1,
        roles: {
          pointer: { pack_id: 12, role_type: 'pointer' },
          link: { pack_id: 29, role_type: 'link' },
        },
      },
    };

    const mockCreated: ShareCreated = {
      share_code: 'a7Kp92QzB4',
      share_url: 'http://localhost:5173/mix/a7Kp92QzB4',
      expires_at: '2027-02-15T03:00:00Z',
    };

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://localhost:8000/api/v1/studio/share');
      assert.equal(init?.method, 'POST');
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers['Content-Type'], 'application/json');
      assert.equal(init?.body, JSON.stringify(requestPayload));

      return new Response(JSON.stringify(mockCreated), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const created = await createShare(requestPayload);
    assert.deepEqual(created, mockCreated);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('9. getShare resolves share preset and handles 410 expired preset', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const mockView: ShareView = {
      share_code: 'a7Kp92QzB4',
      title: 'My soft glow setup',
      config: {
        version: 1,
        roles: {
          pointer: { pack_id: 12, role_type: 'pointer' },
        },
      },
      resolved_items: [
        {
          target_role: 'pointer',
          pack_id: 12,
          pack_title: 'Crystal White',
          role_type: 'pointer',
          preview_png_url: 'https://cdn.example.com/pointer.png',
          hotspot_x: 0,
          hotspot_y: 0,
        },
      ],
      expires_at: '2027-02-15T03:00:00Z',
    };

    globalThis.fetch = async (input) => {
      assert.equal(String(input), 'http://localhost:8000/api/v1/studio/share/a7Kp92QzB4');
      return new Response(JSON.stringify(mockView), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const view = await getShare('a7Kp92QzB4');
    assert.deepEqual(view, mockView);

    // 410 Expired check
    globalThis.fetch = async () => {
      const errorBody = {
        error: {
          code: 'SHARE_EXPIRED',
          message: 'The share link has expired.',
          details: [],
          request_id: 'req_exp410',
        },
      };
      return new Response(JSON.stringify(errorBody), {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await assert.rejects(
      async () => {
        await getShare('expiredCode');
      },
      (err: unknown) => {
        assert(err instanceof ApiError);
        assert.equal(err.status, 410);
        assert.equal(err.code, 'SHARE_EXPIRED');
        assert.equal(err.requestId, 'req_exp410');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('10. Error parser handles FastAPI 422 validation and Rate Limit 429 correctly', async () => {
  const originalFetch = globalThis.fetch;
  try {
    // 422 Validation Error
    globalThis.fetch = async () => {
      const fastApi422 = {
        detail: [
          {
            loc: ['body', 'config', 'roles'],
            msg: 'Field required',
            type: 'value_error.missing',
          },
        ],
      };
      return new Response(JSON.stringify(fastApi422), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await assert.rejects(
      async () => {
        await createShare({ title: '', config: { version: 1, roles: {} } });
      },
      (err: unknown) => {
        assert(err instanceof ApiError);
        assert.equal(err.status, 422);
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.equal(err.details.length, 1);
        assert.equal(err.details[0]?.field, 'config.roles');
        assert.equal(err.details[0]?.reason, 'Field required');
        return true;
      }
    );

    // 429 Rate Limited with Retry-After header
    globalThis.fetch = async () => {
      const rateLimitBody = {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests.',
          details: [],
          request_id: 'req_rate_limit',
        },
      };
      return new Response(JSON.stringify(rateLimitBody), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
      });
    };

    await assert.rejects(
      async () => {
        await getCategories();
      },
      (err: unknown) => {
        assert(err instanceof ApiError);
        assert.equal(err.status, 429);
        assert.equal(err.code, 'RATE_LIMITED');
        assert.equal(err.retryAfter, 60);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('11. AbortSignal aborts request gracefully', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const controller = new AbortController();
    controller.abort();

    globalThis.fetch = async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException('The user aborted a request.', 'AbortError');
      }
      return new Response('{}');
    };

    await assert.rejects(
      async () => {
        await getCategories({ signal: controller.signal });
      },
      (err: unknown) => {
        assert(err instanceof Error);
        assert.equal(err.name, 'AbortError');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
