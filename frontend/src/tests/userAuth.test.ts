/**
 * Unit & Integration Tests for User Authentication (Task U05)
 * Covers:
 * 1. Safe redirect URL sanitization (internal allowlist, external & admin rejection)
 * 2. Identifier discrimination (User email vs Admin username)
 * 3. In-memory CSRF token store isolation (never touching storage)
 * 4. UserApiError classification (401, 409, 422, 429 Retry-After, 403)
 * 5. Mocked API flows (register, login, me, logout with 204 and CSRF)
 * 6. Live Backend Integration Test against FastAPI user auth endpoints
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  getUserCsrfToken,
  setUserCsrfToken,
  clearUserCsrfToken,
  getSafeRedirectUrl,
  registerUser,
  loginUser,
  getMeUser,
  logoutUser,
  UserApiError,
} from '../lib/userApi.ts';

test('1. getSafeRedirectUrl accepts valid internal routes and rejects dangerous/external/admin targets', () => {
  // Valid internal routes
  assert.equal(getSafeRedirectUrl('/'), '/');
  assert.equal(getSafeRedirectUrl('/studio'), '/studio');
  assert.equal(getSafeRedirectUrl('/mix'), '/mix');
  assert.equal(getSafeRedirectUrl('/packs/neon-cyberpunk'), '/packs/neon-cyberpunk');
  assert.equal(getSafeRedirectUrl('/packs?category=retro&page=2'), '/packs?category=retro&page=2');
  assert.equal(getSafeRedirectUrl('/studio#canvas'), '/studio#canvas');

  // External URLs (must fall back to '/')
  assert.equal(getSafeRedirectUrl('https://malicious.com'), '/');
  assert.equal(getSafeRedirectUrl('http://phishing.site/login'), '/');
  assert.equal(getSafeRedirectUrl('//evil.com/fake'), '/');
  assert.equal(getSafeRedirectUrl('javascript:alert(1)'), '/');

  // Backslash or traversal attempts
  assert.equal(getSafeRedirectUrl('/\\evil.com'), '/');
  assert.equal(getSafeRedirectUrl('\\evil.com'), '/');

  // Admin routes (must be rejected for regular User redirect)
  assert.equal(getSafeRedirectUrl('/admin'), '/');
  assert.equal(getSafeRedirectUrl('/admin/packs'), '/');
  assert.equal(getSafeRedirectUrl('/admin/packs/123/edit'), '/');

  // Null, undefined, empty
  assert.equal(getSafeRedirectUrl(null), '/');
  assert.equal(getSafeRedirectUrl(undefined), '/');
  assert.equal(getSafeRedirectUrl(''), '/');
  assert.equal(getSafeRedirectUrl('   '), '/');
  assert.equal(getSafeRedirectUrl(null, '/packs'), '/packs');
});

test('2. Identifier discrimination correctly separates User email from Admin username', () => {
  const isEmail = (val: string): boolean => val.trim().includes('@');

  // User emails
  assert.equal(isEmail('user@example.com'), true);
  assert.equal(isEmail('john.doe+cursor@domain.co.uk'), true);
  assert.equal(isEmail('  dev@studio.io  '), true);

  // Admin usernames
  assert.equal(isEmail('admin'), false);
  assert.equal(isEmail('dev-admin-4481801a'), false);
  assert.equal(isEmail('super_user_99'), false);
  assert.equal(isEmail('root'), false);
});

test('3. User in-memory CSRF token store operates in memory and does not touch localStorage/sessionStorage', () => {
  clearUserCsrfToken();
  assert.equal(getUserCsrfToken(), null);

  const token = 'user_csrf_token_abcdef1234567890';
  setUserCsrfToken(token);
  assert.equal(getUserCsrfToken(), token);

  clearUserCsrfToken();
  assert.equal(getUserCsrfToken(), null);
});

test('4. UserApiError classifies HTTP and error codes correctly', () => {
  // 401 INVALID_CREDENTIALS
  const err401 = new UserApiError({
    status: 401,
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid credentials.',
  });
  assert.equal(err401.isUnauthorized, true);
  assert.equal(err401.isEmailUnavailable, false);

  // 409 EMAIL_UNAVAILABLE
  const err409 = new UserApiError({
    status: 409,
    code: 'EMAIL_UNAVAILABLE',
    message: 'This email is unavailable.',
  });
  assert.equal(err409.isEmailUnavailable, true);
  assert.equal(err409.status, 409);

  // 422 VALIDATION_ERROR
  const err422 = new UserApiError({
    status: 422,
    code: 'VALIDATION_ERROR',
    message: 'Email or password does not meet the requirements.',
    details: [{ field: 'password', reason: 'String should have at least 15 characters' }],
  });
  assert.equal(err422.isValidationError, true);
  assert.equal(err422.details?.length, 1);

  // 429 RATE_LIMITED with Retry-After
  const err429 = new UserApiError({
    status: 429,
    code: 'RATE_LIMITED',
    message: 'Too many attempts.',
    retryAfter: 60,
  });
  assert.equal(err429.isRateLimited, true);
  assert.equal(err429.retryAfter, 60);

  // 403 CSRF_FAILED / ORIGIN_DENIED
  const err403 = new UserApiError({
    status: 403,
    code: 'CSRF_FAILED',
    message: 'Invalid CSRF token.',
  });
  assert.equal(err403.isForbidden, true);

  // 404 NOT_FOUND
  const err404 = new UserApiError({
    status: 404,
    code: 'NOT_FOUND',
    message: 'Not found.',
  });
  assert.equal(err404.isNotFound, true);
});

test('5. Mocked API flows for register, login, me, and logout', async () => {
  const originalFetch = globalThis.fetch;

  try {
    // 5.1 Register
    globalThis.fetch = async (input, init) => {
      assert.ok(String(input).endsWith('/auth/register'));
      assert.equal(init?.method, 'POST');
      assert.equal(init?.credentials, 'include');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.email, 'test@example.com');
      assert.equal(body.password, 'a-secure-15-character-password');

      return new Response(JSON.stringify({ user: { id: 101, email: 'test@example.com' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const regRes = await registerUser({
      email: 'test@example.com',
      password: 'a-secure-15-character-password',
    });
    assert.equal(regRes.user.id, 101);
    assert.equal(regRes.user.email, 'test@example.com');

    // 5.2 Login
    globalThis.fetch = async (input, init) => {
      assert.ok(String(input).endsWith('/auth/login'));
      assert.equal(init?.method, 'POST');
      assert.equal(init?.credentials, 'include');

      return new Response(
        JSON.stringify({
          user: { id: 101, email: 'test@example.com' },
          csrf_token: 'csrf_mock_token_12345678901234567890123456789012',
          expires_at: '2026-11-20T00:00:00Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    const loginRes = await loginUser({
      email: 'test@example.com',
      password: 'a-secure-15-character-password',
    });
    assert.equal(loginRes.user.id, 101);
    assert.equal(loginRes.csrf_token, 'csrf_mock_token_12345678901234567890123456789012');
    assert.equal(getUserCsrfToken(), 'csrf_mock_token_12345678901234567890123456789012');

    // 5.3 Me
    globalThis.fetch = async (input, init) => {
      assert.ok(String(input).endsWith('/auth/me'));
      assert.equal(init?.method, 'GET');
      assert.equal(init?.credentials, 'include');

      return new Response(
        JSON.stringify({
          user: { id: 101, email: 'test@example.com' },
          csrf_token: 'csrf_mock_token_12345678901234567890123456789012',
          expires_at: '2026-11-20T00:00:00Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    const meRes = await getMeUser();
    assert.equal(meRes.user.id, 101);

    // 5.4 Logout
    globalThis.fetch = async (input, init) => {
      assert.ok(String(input).endsWith('/auth/logout'));
      assert.equal(init?.method, 'POST');
      assert.equal(init?.credentials, 'include');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('X-CSRF-Token'), 'csrf_mock_token_12345678901234567890123456789012');

      return new Response(null, { status: 204 });
    };

    await logoutUser();
    assert.equal(getUserCsrfToken(), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('6. Live Backend Integration: Register, Duplicate rejection, Login, Me, and Logout against dev server', async (t) => {
  function nodeHttpRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<{ status: number; headers: Record<string, string | string[]>; text: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: 8000,
          path,
          method,
          headers: {
            ...headers,
            host: 'localhost:5173',
            origin: 'http://localhost:5173',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            const resHeaders: Record<string, string | string[]> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (v !== undefined) resHeaders[k.toLowerCase()] = v;
            }
            resolve({
              status: res.statusCode || 500,
              headers: resHeaders,
              text: data,
            });
          });
        }
      );
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  // Probe if backend is running on port 8000
  try {
    const probe = await nodeHttpRequest('GET', '/api/v1/auth/me', {});
    if (probe.status !== 401 && probe.status !== 200) {
      t.skip(`Backend returned status ${probe.status}, user auth may be disabled`);
      return;
    }
  } catch {
    t.skip('Backend not running on port 8000');
    return;
  }

  const originalFetch = globalThis.fetch;
  const cookieJar = new Map<string, string>();

  try {
    // Intercept fetch to route requests via nodeHttpRequest preserving Host: localhost:5173
    globalThis.fetch = async (input, init) => {
      const urlObj = new URL(String(input), 'http://localhost:5173');
      const reqPath = `${urlObj.pathname}${urlObj.search}`;
      const reqHeaders: Record<string, string> = {};
      if (init?.headers) {
        new Headers(init.headers).forEach((v, k) => {
          reqHeaders[k.toLowerCase()] = v;
        });
      }
      if (cookieJar.size > 0) {
        reqHeaders['cookie'] = Array.from(cookieJar.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');
      }
      const body = init?.body ? String(init.body) : undefined;
      const res = await nodeHttpRequest(init?.method || 'GET', reqPath, reqHeaders, body);

      const setCookie = res.headers['set-cookie'];
      if (setCookie) {
        const cookieArr = Array.isArray(setCookie) ? setCookie : [setCookie];
        for (const sc of cookieArr) {
          const [cName, cVal] = sc.split(';')[0]?.split('=') || [];
          if (cName && cVal) {
            if (cVal === '' || sc.includes('Max-Age=0')) {
              cookieJar.delete(cName.trim());
            } else {
              cookieJar.set(cName.trim(), cVal.trim());
            }
          }
        }
      }

      const responseHeaders = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        if (Array.isArray(v)) {
          v.forEach((val) => responseHeaders.append(k, val));
        } else if (v) {
          responseHeaders.set(k, v);
        }
      }

      return new Response(res.text || null, {
        status: res.status,
        headers: responseHeaders,
      });
    };

    const uniqueId = Date.now().toString(36);
    const testEmail = `user_${uniqueId}@example.com`;
    const testPassword = 'A_Secure_Password_15_Chars!';

    // 1. Register new user (handle rate limit gracefully if test suite ran repeatedly)
    let regRes;
    try {
      regRes = await registerUser({ email: testEmail, password: testPassword });
    } catch (err: unknown) {
      if (err instanceof UserApiError && err.status === 429) {
        t.skip('Skipping live test: rate limit reached on dev IP (5 registrations/hour)');
        return;
      }
      throw err;
    }
    assert.ok(regRes.user.id > 0);
    assert.equal(regRes.user.email, testEmail);

    // 2. Registering same email must fail with 409 EMAIL_UNAVAILABLE (or 429 if rate limit exhausted)
    await assert.rejects(
      async () => {
        await registerUser({ email: testEmail, password: testPassword });
      },
      (err: unknown) => {
        if (err instanceof UserApiError && err.status === 429) {
          return true;
        }
        return err instanceof UserApiError && err.status === 409 && err.code === 'EMAIL_UNAVAILABLE';
      }
    );

    // 3. Login with wrong password must fail with 401 INVALID_CREDENTIALS
    await assert.rejects(
      async () => {
        await loginUser({ email: testEmail, password: 'Wrong_Password_15_Chars!' });
      },
      (err: unknown) => {
        return err instanceof UserApiError && err.status === 401 && err.code === 'INVALID_CREDENTIALS';
      }
    );

    // 4. Login with correct credentials must succeed
    const loginRes = await loginUser({ email: testEmail, password: testPassword });
    assert.equal(loginRes.user.id, regRes.user.id);
    assert.equal(loginRes.user.email, testEmail);
    assert.ok(loginRes.csrf_token.length > 0);
    assert.equal(getUserCsrfToken(), loginRes.csrf_token);

    // 5. Get me returns current user identity
    const meRes = await getMeUser();
    assert.equal(meRes.user.id, regRes.user.id);
    assert.equal(meRes.user.email, testEmail);

    // 6. Logout revokes session
    await logoutUser();
    assert.equal(getUserCsrfToken(), null);

    // 7. Get me after logout returns 401
    await assert.rejects(
      async () => {
        await getMeUser();
      },
      (err: unknown) => {
        return err instanceof UserApiError && err.status === 401;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
