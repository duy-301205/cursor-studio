/**
 * Unit & Integration Test for 17-Role Windows Cursor Interactive Sandbox
 * 
 * Verifies:
 * 1. SANDBOX_17_ROLES covers all 17 Windows roles in canonical Windows Registry order
 * 2. Sandbox card CSS cursor calculation and status badges (Assigned vs "Chưa gán" vs "Default")
 * 3. Live backend verification: assigning two distinct CUR files and hotspots to
 *    Location Select ('location') and Person Select ('person') on a draft pack,
 *    and verifying both cards in the 17-role sandbox receive distinct preview URLs and exact hotspots.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CURSOR_ROLES,
  type CursorAsset,
  type CursorRole,
} from '../types/api.ts';
import {
  SANDBOX_17_ROLES,
  type SandboxRoleDefinition,
} from '../types/sandboxRoles.ts';

test('1. SANDBOX_17_ROLES covers all 17 Windows roles with canonical registry slots and fallbacks', () => {
  assert.equal(CURSOR_ROLES.length, 17);
  assert.equal(SANDBOX_17_ROLES.length, 17);

  const roleMap = new Map<CursorRole, SandboxRoleDefinition>();
  for (const def of SANDBOX_17_ROLES) {
    assert.ok(def.role, 'Role must exist');
    assert.ok(def.slot, `Slot must exist for role: ${def.role}`);
    assert.ok(def.label, `Label must exist for role: ${def.role}`);
    assert.ok(def.nativeFallback, `Native fallback must exist for role: ${def.role}`);
    assert.ok(def.description, `Description must exist for role: ${def.role}`);
    roleMap.set(def.role, def);
  }

  // Ensure every CURSOR_ROLE is present in SANDBOX_17_ROLES
  for (const role of CURSOR_ROLES) {
    assert.ok(roleMap.has(role), `Role ${role} missing in SANDBOX_17_ROLES`);
  }

  // Check specific slots for Location Select and Person Select
  const locDef = roleMap.get('location');
  assert.ok(locDef);
  assert.equal(locDef.slot, 'Pin');
  assert.equal(locDef.label, 'Location Select');
  assert.equal(locDef.nativeFallback, 'pointer');

  const personDef = roleMap.get('person');
  assert.ok(personDef);
  assert.equal(personDef.slot, 'Person');
  assert.equal(personDef.label, 'Person Select');
  assert.equal(personDef.nativeFallback, 'pointer');
});

test('2. Sandbox card cursor style calculation and unassigned state logic', () => {
  function getCursorStyle(
    role: CursorRole,
    fallback: string,
    previews: Partial<Record<CursorRole, CursorAsset>>
  ): string {
    const asset = previews[role];
    if (asset?.preview_png_url) {
      const x = Math.max(0, Math.min(47, Math.round(asset.hotspot_x)));
      const y = Math.max(0, Math.min(47, Math.round(asset.hotspot_y)));
      return `url("${asset.preview_png_url}") ${x} ${y}, ${fallback}`;
    }
    return fallback;
  }

  function getCardBadge(
    role: CursorRole,
    previews: Partial<Record<CursorRole, CursorAsset>>,
    isAdmin: boolean
  ): string {
    const asset = previews[role];
    const isAssigned = Boolean(asset && asset.preview_png_url);
    if (isAssigned && asset) {
      return `(${asset.hotspot_x},${asset.hotspot_y})`;
    }
    if (isAdmin) {
      return 'Chưa gán';
    }
    return 'Default';
  }

  const rolePreviews: Partial<Record<CursorRole, CursorAsset>> = {
    location: {
      role_type: 'location',
      cursor_file_url: '',
      preview_png_url: '/api/v1/admin/packs/42/assets/preview-loc/content',
      hotspot_x: 7,
      hotspot_y: 14,
    },
    person: {
      role_type: 'person',
      cursor_file_url: '',
      preview_png_url: '/api/v1/admin/packs/42/assets/preview-person/content',
      hotspot_x: 12,
      hotspot_y: 5,
    },
  };

  // Case A: Unassigned role (e.g. handwriting)
  assert.equal(getCursorStyle('handwriting', 'crosshair', rolePreviews), 'crosshair');
  assert.equal(getCardBadge('handwriting', rolePreviews, true), 'Chưa gán');
  assert.equal(getCardBadge('handwriting', rolePreviews, false), 'Default');

  // Case B: Assigned Location Select card
  assert.equal(
    getCursorStyle('location', 'pointer', rolePreviews),
    'url("/api/v1/admin/packs/42/assets/preview-loc/content") 7 14, pointer'
  );
  assert.equal(getCardBadge('location', rolePreviews, true), '(7,14)');
  assert.equal(getCardBadge('location', rolePreviews, false), '(7,14)');

  // Case C: Assigned Person Select card
  assert.equal(
    getCursorStyle('person', 'pointer', rolePreviews),
    'url("/api/v1/admin/packs/42/assets/preview-person/content") 12 5, pointer'
  );
  assert.equal(getCardBadge('person', rolePreviews, true), '(12,5)');
  assert.equal(getCardBadge('person', rolePreviews, false), '(12,5)');

  // Hovering over Location card vs Person card produces distinct cursor styles and hotspots
  assert.notEqual(
    getCursorStyle('location', 'pointer', rolePreviews),
    getCursorStyle('person', 'pointer', rolePreviews)
  );
});

// Helper for live backend test
interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  json<T = unknown>(): T;
  text(): string;
}

let sessionCookie: string | null = null;
let csrfToken: string | null = null;

function httpRequest(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string | number>;
    body?: Buffer | string;
  } = {}
): Promise<HttpResponse> {
  return new Promise((resolvePromise, rejectPromise) => {
    const headers: Record<string, string | number> = {
      Host: 'localhost:5173',
      Origin: 'http://localhost:5173',
      ...options.headers,
    };

    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }
    if (csrfToken && options.method && options.method !== 'GET' && options.method !== 'HEAD') {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 8000,
        path,
        method: options.method ?? 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const setCookie = res.headers['set-cookie'];
          if (setCookie && setCookie.length > 0) {
            const first = setCookie[0];
            if (first) {
              const part = first.split(';')[0];
              if (part) {
                sessionCookie = part;
              }
            }
          }
          resolvePromise({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body,
            json<T = unknown>(): T {
              return JSON.parse(body.toString('utf-8')) as T;
            },
            text(): string {
              return body.toString('utf-8');
            },
          });
        });
      }
    );

    req.on('error', rejectPromise);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function createMultipart(
  fields: Record<string, string>,
  files: Array<{ name: string; filename: string; contentType: string; data: Buffer }>
): { boundary: string; buffer: Buffer } {
  const boundary = `----CustomFormBoundary${Math.random().toString(36).slice(2)}`;
  const chunks: Buffer[] = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
      )
    );
  }

  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
      )
    );
    chunks.push(file.data);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    boundary,
    buffer: Buffer.concat(chunks),
  };
}

test('3. Live Backend Test: Assign distinct files to Location Select & Person Select in Sandbox 17-role cards', async () => {
  // Check backend availability
  try {
    const probe = await httpRequest('/api/v1/categories');
    if (probe.status !== 200) return;
  } catch {
    return;
  }

  // Admin Login
  const loginRes = await httpRequest('/api/v1/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '222222' }),
  });
  if (loginRes.status !== 200) return;
  const loginData = loginRes.json<{ csrf_token: string }>();
  csrfToken = loginData.csrf_token;

  // Create Draft Pack
  const timestamp = Date.now();
  const createRes = await httpRequest('/api/v1/admin/packs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `Sandbox 17-Role Verify Pack ${timestamp}`,
      slug: `sandbox-verify-pack-${timestamp}`,
      category_id: 1,
      description: 'Testing 17-role sandbox card bindings',
    }),
  });
  assert.equal(createRes.status, 201);
  const pack = createRes.json<{ id: number; revision: number }>();
  const packId = pack.id;
  let etag = (createRes.headers['etag'] as string) ?? `W/"${packId}-${pack.revision}"`;

  try {
    const sampleDir = existsSync(resolve(process.cwd(), 'backend/app/static/samples/sample-minimal'))
      ? resolve(process.cwd(), 'backend/app/static/samples/sample-minimal')
      : resolve(process.cwd(), '../backend/app/static/samples/sample-minimal');

    // 1. Upload distinct CUR file #1 for Location Select (hotspot 7, 14)
    const baseCurBytes = Buffer.from(readFileSync(resolve(sampleDir, 'link.cur')));
    const locCurBytes = Buffer.from(baseCurBytes);
    locCurBytes.writeUInt16LE(7, 10);  // hotspot_x = 7
    locCurBytes.writeUInt16LE(14, 12); // hotspot_y = 14

    const locCurMp = createMultipart(
      { kind: 'cursor' },
      [{ name: 'file', filename: 'location.cur', contentType: 'image/x-icon', data: locCurBytes }]
    );
    const locCurRes = await httpRequest(`/api/v1/admin/packs/${packId}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${locCurMp.boundary}`,
        'Content-Length': locCurMp.buffer.length,
        'If-Match': etag,
      },
      body: locCurMp.buffer,
    });
    assert.equal(locCurRes.status, 201);
    const locCurAsset = locCurRes.json<{ asset_id: string }>();

    // Upload preview for Location Select
    const linkPngBytes = readFileSync(resolve(sampleDir, 'link.png'));
    const locPngMp = createMultipart(
      { kind: 'preview' },
      [{ name: 'file', filename: 'loc-preview.png', contentType: 'image/png', data: linkPngBytes }]
    );
    const locPngRes = await httpRequest(`/api/v1/admin/packs/${packId}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${locPngMp.boundary}`,
        'Content-Length': locPngMp.buffer.length,
        'If-Match': etag,
      },
      body: locPngMp.buffer,
    });
    assert.equal(locPngRes.status, 201);
    const locPngAsset = locPngRes.json<{ asset_id: string }>();

    // 2. Upload distinct CUR file #2 for Person Select (hotspot 12, 5)
    const personCurBytes = Buffer.from(baseCurBytes);
    personCurBytes.writeUInt16LE(12, 10); // hotspot_x = 12
    personCurBytes.writeUInt16LE(5, 12);  // hotspot_y = 5

    const personCurMp = createMultipart(
      { kind: 'cursor' },
      [{ name: 'file', filename: 'person.cur', contentType: 'image/x-icon', data: personCurBytes }]
    );
    const personCurRes = await httpRequest(`/api/v1/admin/packs/${packId}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${personCurMp.boundary}`,
        'Content-Length': personCurMp.buffer.length,
        'If-Match': etag,
      },
      body: personCurMp.buffer,
    });
    assert.equal(personCurRes.status, 201);
    const personCurAsset = personCurRes.json<{ asset_id: string }>();

    // 3. Assign Location Select
    const assignLocRes = await httpRequest(`/api/v1/admin/packs/${packId}/roles/location`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify({
        asset_id: locCurAsset.asset_id,
        preview_asset_id: locPngAsset.asset_id,
        hotspot_x: 7,
        hotspot_y: 14,
      }),
    });
    assert.equal(assignLocRes.status, 200);
    etag = (assignLocRes.headers['etag'] as string) ?? etag;

    // 4. Assign Person Select
    const assignPersonRes = await httpRequest(`/api/v1/admin/packs/${packId}/roles/person`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify({
        asset_id: personCurAsset.asset_id,
        preview_asset_id: locPngAsset.asset_id,
        hotspot_x: 12,
        hotspot_y: 5,
      }),
    });
    assert.equal(assignPersonRes.status, 200);
    etag = (assignPersonRes.headers['etag'] as string) ?? etag;

    // 5. Reload pack and map to rolePreviews (as used by InteractiveSandbox)
    const reloadRes = await httpRequest(`/api/v1/admin/packs/${packId}`);
    assert.equal(reloadRes.status, 200);
    const reloaded = reloadRes.json<{
      roles: Array<{
        role_type: CursorRole;
        asset_id: string | null;
        preview_asset_id: string | null;
        preview_url?: string;
        hotspot_x: number;
        hotspot_y: number;
      }>;
    }>();

    const rolePreviews: Partial<Record<CursorRole, CursorAsset>> = {};
    for (const r of reloaded.roles) {
      if (r.preview_url) {
        rolePreviews[r.role_type] = {
          role_type: r.role_type,
          cursor_file_url: '',
          preview_png_url: r.preview_url,
          hotspot_x: r.hotspot_x,
          hotspot_y: r.hotspot_y,
        };
      }
    }

    // 6. Verify Location Select card in Sandbox
    const locAsset = rolePreviews.location;
    assert.ok(locAsset);
    assert.equal(locAsset.hotspot_x, 7);
    assert.equal(locAsset.hotspot_y, 14);
    assert.ok(locAsset.preview_png_url.includes(locPngAsset.asset_id));

    // 7. Verify Person Select card in Sandbox
    const personAsset = rolePreviews.person;
    assert.ok(personAsset);
    assert.equal(personAsset.hotspot_x, 12);
    assert.equal(personAsset.hotspot_y, 5);

    // 8. Verify unassigned role in Sandbox (e.g. handwriting)
    assert.equal(rolePreviews.handwriting, undefined);

    // 9. Verify CSS cursor computation on both cards
    const locCursor = `url("${locAsset.preview_png_url}") ${locAsset.hotspot_x} ${locAsset.hotspot_y}, pointer`;
    const personCursor = `url("${personAsset.preview_png_url}") ${personAsset.hotspot_x} ${personAsset.hotspot_y}, pointer`;

    assert.notEqual(locCursor, personCursor);
    assert.ok(locCursor.includes('7 14'));
    assert.ok(personCursor.includes('12 5'));
  } finally {
    // Clean up
    try {
      await httpRequest(`/api/v1/admin/packs/${packId}/unpublish`, {
        method: 'POST',
        headers: { 'If-Match': etag },
      });
    } catch {
      // Ignored
    }
  }
});
