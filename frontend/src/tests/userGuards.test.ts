/**
 * Custom Cursor Studio & Library — Task U07 Tests
 * Route/action guards, Admin tools convert decoupling, and safe return redirects.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { adminConvertCursor, setCsrfToken, clearCsrfToken } from '../lib/adminApi.ts';
import { setUserCsrfToken, clearUserCsrfToken, getSafeRedirectUrl } from '../lib/userApi.ts';
import { convertCursor } from '../lib/api.ts';

// 1. adminConvertCursor mocked unit test
test('1. adminConvertCursor sends multipart FormData with Admin credentials and CSRF header', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const dummyPng = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    const mockCurBytes = new Uint8Array([0x00, 0x00, 0x02, 0x00]); // Windows CUR magic

    setCsrfToken('test-admin-csrf-999');

    let interceptedUrl = '';
    let interceptedMethod = '';
    let interceptedCredentials = '';
    let interceptedCsrf = '';
    let interceptedFormData: unknown = null;

    globalThis.fetch = async (input, init) => {
      interceptedUrl = String(input);
      interceptedMethod = init?.method ?? '';
      interceptedCredentials = init?.credentials ?? '';
      interceptedCsrf = (init?.headers as Record<string, string>)?.[
        'X-CSRF-Token'
      ] ?? '';

      if (init?.body instanceof FormData) {
        interceptedFormData = init.body;
      }

      return new Response(mockCurBytes, {
        status: 200,
        headers: {
          'Content-Type': 'image/x-icon',
          'Content-Disposition': 'attachment; filename="admin-role-pointer.cur"',
        },
      });
    };

    const result = await adminConvertCursor({
      file: dummyPng,
      size: 32,
      hotspot_x: 6,
      hotspot_y: 8,
    });

    assert.match(interceptedUrl, /\/api\/v1\/admin\/tools\/convert$/);
    assert.equal(interceptedMethod, 'POST');
    assert.equal(interceptedCredentials, 'include');
    assert.equal(interceptedCsrf, 'test-admin-csrf-999');
    assert(interceptedFormData instanceof FormData);
    assert.equal(interceptedFormData.get('size'), '32');
    assert.equal(interceptedFormData.get('hotspot_x'), '6');
    assert.equal(interceptedFormData.get('hotspot_y'), '8');

    assert.equal(result.filename, 'admin-role-pointer.cur');
    assert.equal(result.blob.size, 4);
  } finally {
    clearCsrfToken();
    globalThis.fetch = originalFetch;
  }
});

// 2. User API mutation CSRF and credentials integration in api.ts
test('2. Public api.ts mutations automatically include credentials and in-memory User CSRF', async () => {
  const originalFetch = globalThis.fetch;
  try {
    setUserCsrfToken('user-csrf-token-abc');

    const dummyPng = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    let capturedCredentials = '';
    let capturedCsrf = '';

    globalThis.fetch = async (_input, init) => {
      capturedCredentials = init?.credentials ?? '';
      capturedCsrf = (init?.headers as Record<string, string>)?.[
        'X-CSRF-Token'
      ] ?? '';

      return new Response(new Uint8Array([0x00, 0x00, 0x02, 0x00]), {
        status: 200,
        headers: {
          'Content-Type': 'image/x-icon',
          'Content-Disposition': 'attachment; filename="studio.cur"',
        },
      });
    };

    await convertCursor({
      file: dummyPng,
      size: 48,
      hotspot_x: 10,
      hotspot_y: 12,
    });

    assert.equal(capturedCredentials, 'include');
    assert.equal(capturedCsrf, 'user-csrf-token-abc');
  } finally {
    clearUserCsrfToken();
    globalThis.fetch = originalFetch;
  }
});

// 3. Action and Route guard returnUrl sanitization
test('3. Guarded targets produce safe sanitized returnUrl values and reject forbidden paths', () => {
  // Safe targets
  assert.equal(getSafeRedirectUrl('/studio', '/'), '/studio');
  assert.equal(getSafeRedirectUrl('/mix', '/'), '/mix');
  assert.equal(getSafeRedirectUrl('/mix/a7Kp92QzB4', '/'), '/mix/a7Kp92QzB4');
  assert.equal(getSafeRedirectUrl('/packs/cyberpunk-neon-glow', '/'), '/packs/cyberpunk-neon-glow');

  // Forbidden targets (admin routes or external URLs rejected)
  assert.equal(getSafeRedirectUrl('/admin/packs', '/'), '/');
  assert.equal(getSafeRedirectUrl('https://evil.com/phish', '/'), '/');
  assert.equal(getSafeRedirectUrl('//malicious.com', '/'), '/');
  assert.equal(getSafeRedirectUrl('/\\evil.com', '/'), '/');
});

// 4. Live Backend Integration Test: Admin login -> adminConvertCursor returns valid CUR binary
test('4. Live Backend Integration: Admin session can convert CUR via /admin/tools/convert', async () => {
  const rootEnvPath = resolve(process.cwd(), '../.env');
  if (!existsSync(rootEnvPath)) {
    return; // Skip if no root .env
  }

  const envContent = readFileSync(rootEnvPath, 'utf-8');
  let devUsername = '';
  let devPassword = '';

  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('ADMIN_DEV_USERNAME=')) {
      devUsername = trimmed.slice('ADMIN_DEV_USERNAME='.length).trim();
    } else if (trimmed.startsWith('ADMIN_DEV_PASSWORD=')) {
      devPassword = trimmed.slice('ADMIN_DEV_PASSWORD='.length).trim();
    }
  }

  if (!devUsername || !devPassword) {
    return; // Skip if credentials missing
  }

  // Helper to make live loopback requests preserving Host and Origin
  function nodeHttpRequest(
    options: http.RequestOptions,
    postData?: Buffer | string
  ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
    return new Promise((resolvePromise, rejectPromise) => {
      const req = http.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolvePromise({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      });
      req.on('error', rejectPromise);
      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  // 1. Admin login to get session cookie and CSRF token
  const loginBody = JSON.stringify({ username: devUsername, password: devPassword });
  const loginRes = await nodeHttpRequest(
    {
      hostname: '127.0.0.1',
      port: 8000,
      path: '/api/v1/admin/auth/login',
      method: 'POST',
      headers: {
        Host: 'localhost:5173',
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginBody),
      },
    },
    loginBody
  );

  assert.equal(loginRes.status, 200, 'Admin login must succeed');
  const loginJson = JSON.parse(loginRes.body.toString('utf-8'));
  const adminCsrf = loginJson.csrf_token;
  assert(typeof adminCsrf === 'string' && adminCsrf.length > 0);

  // Extract session cookie
  const setCookies = loginRes.headers['set-cookie'] || [];
  const adminCookie = setCookies
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');

  // 2. Call /api/v1/admin/tools/convert with multipart form
  // Create a minimal 1x1 transparent PNG:
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, // RGBA
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND chunk
    0x42, 0x60, 0x82,
  ]);

  const boundary = '----WebKitFormBoundaryAdminConvertTest' + Date.now();
  const crlf = '\r\n';
  const parts: Buffer[] = [];

  parts.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="size"${crlf}${crlf}32${crlf}`));
  parts.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="hotspot_x"${crlf}${crlf}0${crlf}`));
  parts.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="hotspot_y"${crlf}${crlf}0${crlf}`));
  parts.push(Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="test.png"${crlf}Content-Type: image/png${crlf}${crlf}`));
  parts.push(pngHeader);
  parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`));

  const multipartBody = Buffer.concat(parts);

  const convertRes = await nodeHttpRequest(
    {
      hostname: '127.0.0.1',
      port: 8000,
      path: '/api/v1/admin/tools/convert',
      method: 'POST',
      headers: {
        Host: 'localhost:5173',
        Origin: 'http://localhost:5173',
        Cookie: adminCookie,
        'X-CSRF-Token': adminCsrf,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': multipartBody.length,
      },
    },
    multipartBody
  );

  assert.equal(convertRes.status, 200, 'Admin convert must succeed with HTTP 200');
  const contentType = convertRes.headers['content-type'] || '';
  assert.ok(
    contentType.includes('image/x-icon') || contentType.includes('application/octet-stream'),
    `Content-Type must be image/x-icon or application/octet-stream, got ${contentType}`
  );
  const curBytes = convertRes.body;
  assert(curBytes.length >= 22, 'CUR file must have at least 22 bytes header');
  // Check Windows CUR magic: byte 0=0, byte 1=0, byte 2=2, byte 3=0
  assert.equal(curBytes[0], 0);
  assert.equal(curBytes[1], 0);
  assert.equal(curBytes[2], 2);
  assert.equal(curBytes[3], 0);

  // 3. Admin logout
  await nodeHttpRequest({
    hostname: '127.0.0.1',
    port: 8000,
    path: '/api/v1/admin/auth/logout',
    method: 'POST',
    headers: {
      Host: 'localhost:5173',
      Origin: 'http://localhost:5173',
      Cookie: adminCookie,
      'X-CSRF-Token': adminCsrf,
      'Content-Length': 0,
    },
  });
});
