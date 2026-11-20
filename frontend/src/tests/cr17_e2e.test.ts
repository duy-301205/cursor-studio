/**
 * E2E Verification Test for CR-20261120-01 (17 Windows Cursor Roles)
 * 
 * Verifies:
 * 1. Admin login & session management
 * 2. Creating draft pack
 * 3. Uploading thumbnail & setting pack thumbnail
 * 4. Uploading distinct cursor asset for Location Select ('location')
 * 5. Uploading and assigning all 17 Windows roles
 * 6. Reloading draft pack details to verify persistence and binding of location asset & hotspot
 * 7. Validating pack (checks 17 roles complete, missing_roles: [])
 * 8. Publishing pack
 * 9. Downloading ZIP package and unzipping Install.inf
 * 10. Verifying Install.inf has 17 registry slots and slot 15 (Pin/Location Select) points to location.cur
 * 11. Verifying contents of location.cur match the unique uploaded bytes
 * 12. Verifying public catalog returns 17 cursor items for published pack
 * 13. Unpublishing test pack back to draft to clean up public gallery
 * 14. Confirming real packs ('midnight-soots', 'letters-to-the-sky', 'little-witchs-desk', 'whispering-woods') remain intact with 17 roles
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { CURSOR_ROLES, type CursorRole } from '../types/api.ts';

let sessionCookie: string | null = null;
let csrfToken: string | null = null;

interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  json<T = unknown>(): T;
  text(): string;
}

async function httpRequest(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string | number>;
    body?: Buffer | string;
  } = {}
): Promise<HttpResponse> {
  const maxRetries = 3;
  let attempt = 0;

  while (true) {
    const res = await new Promise<HttpResponse>((resolvePromise, rejectPromise) => {
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

    if (res.status === 429 && attempt < maxRetries) {
      attempt++;
      const retryHeader = res.headers['retry-after'];
      const waitSeconds = retryHeader ? Math.max(1, parseInt(String(retryHeader), 10) || 5) : 10;
      console.log(`[429 Rate Limited] Waiting ${waitSeconds}s before retrying ${path}...`);
      await new Promise((r) => setTimeout(r, waitSeconds * 1000 + 500));
      continue;
    }

    return res;
  }
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

test('CR-20261120-01 End-to-End Test: 17 Windows cursor roles workflow', async () => {
  // 0. Probe backend
  const probe = await httpRequest('/api/v1/categories');
  assert.equal(probe.status, 200, 'Backend /api/v1/categories should respond 200');

  // 1. Admin Login
  const loginRes = await httpRequest('/api/v1/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '222222' }),
  });
  assert.equal(loginRes.status, 200, `Login failed: status ${loginRes.status} ${loginRes.text()}`);
  const loginData = loginRes.json<{ csrf_token: string; admin: { username: string } }>();
  assert.equal(loginData.admin.username, 'admin');
  assert.ok(loginData.csrf_token, 'Login must return CSRF token');
  csrfToken = loginData.csrf_token;
  assert.ok(sessionCookie, 'Login must set session cookie');

  // 2. Create Draft Pack
  const timestamp = Date.now();
  const slug = `cr17-e2e-test-${timestamp}`;
  const createRes = await httpRequest('/api/v1/admin/packs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `CR17 Test Pack ${timestamp}`,
      slug,
      category_id: 1,
      description: 'End-to-end verification pack for 17 Windows roles',
    }),
  });
  assert.equal(createRes.status, 201, `Create pack failed: ${createRes.status} ${createRes.text()}`);
  const pack = createRes.json<{ id: number; status: string; revision: number }>();
  const packId = pack.id;
  let etag = (createRes.headers['etag'] as string) ?? `W/"${packId}-${pack.revision}"`;
  assert.equal(pack.status, 'draft');

  try {
    // 3. Upload thumbnail
    const sampleDir = existsSync(resolve(process.cwd(), 'backend/app/static/samples/sample-minimal'))
      ? resolve(process.cwd(), 'backend/app/static/samples/sample-minimal')
      : resolve(process.cwd(), '../backend/app/static/samples/sample-minimal');
    const thumbBuffer = readFileSync(resolve(sampleDir, 'thumbnail.webp'));
    const thumbMp = createMultipart(
      { kind: 'thumbnail' },
      [{ name: 'file', filename: 'thumbnail.webp', contentType: 'image/webp', data: thumbBuffer }]
    );

    const thumbRes = await httpRequest(`/api/v1/admin/packs/${packId}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${thumbMp.boundary}`,
        'Content-Length': thumbMp.buffer.length,
        'If-Match': etag,
      },
      body: thumbMp.buffer,
    });
    assert.equal(thumbRes.status, 201, `Upload thumbnail failed: ${thumbRes.status} ${thumbRes.text()}`);
    const thumbAsset = thumbRes.json<{ asset_id: string }>();

    // Patch pack with thumbnail
    const patchRes = await httpRequest(`/api/v1/admin/packs/${packId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify({ thumbnail_asset_id: thumbAsset.asset_id }),
    });
    assert.equal(patchRes.status, 200, 'Patch thumbnail failed');
    etag = (patchRes.headers['etag'] as string) ?? etag;

    // 4. Upload matched pairs from sample-minimal
    // The backend validates that preview image pixels match the CUR raster pixels!
    const sampleFiles = [
      'pointer',
      'working',
      'busy',
      'precision',
      'text',
      'unavailable',
      'move',
      'link',
    ] as const;

    const uploadedPairs: Record<
      string,
      { curAssetId: string; previewAssetId: string; hotspotX: number; hotspotY: number }
    > = {};

    for (const baseName of sampleFiles) {
      const curData = readFileSync(resolve(sampleDir, `${baseName}.cur`));
      const pngData = readFileSync(resolve(sampleDir, `${baseName}.png`));

      const hotspotX = curData.readUInt16LE(10);
      const hotspotY = curData.readUInt16LE(12);

      const curMp = createMultipart(
        { kind: 'cursor' },
        [{ name: 'file', filename: `${baseName}.cur`, contentType: 'image/x-icon', data: curData }]
      );
      const curRes = await httpRequest(`/api/v1/admin/packs/${packId}/assets`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${curMp.boundary}`,
          'Content-Length': curMp.buffer.length,
          'If-Match': etag,
        },
        body: curMp.buffer,
      });
      assert.equal(curRes.status, 201, `Upload ${baseName}.cur failed`);
      const curAsset = curRes.json<{ asset_id: string }>();

      const pngMp = createMultipart(
        { kind: 'preview' },
        [{ name: 'file', filename: `${baseName}.png`, contentType: 'image/png', data: pngData }]
      );
      const pngRes = await httpRequest(`/api/v1/admin/packs/${packId}/assets`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${pngMp.boundary}`,
          'Content-Length': pngMp.buffer.length,
          'If-Match': etag,
        },
        body: pngMp.buffer,
      });
      assert.equal(pngRes.status, 201, `Upload ${baseName}.png failed`);
      const pngAsset = pngRes.json<{ asset_id: string }>();

      uploadedPairs[baseName] = {
        curAssetId: curAsset.asset_id,
        previewAssetId: pngAsset.asset_id,
        hotspotX,
        hotspotY,
      };
    }

    // 5. Create a UNIQUE cursor file specifically for Location Select ('location')
    // We alter hotspot bytes 10 and 12 of link.cur (hotspot_x = 7, hotspot_y = 14)
    // The raster bitmap is identical so link.png matches pixel-for-pixel,
    // but the CUR file has a distinct header and SHA256!
    const baseCurBytes = Buffer.from(readFileSync(resolve(sampleDir, 'link.cur')));
    const locationCurBytes = Buffer.from(baseCurBytes);
    locationCurBytes.writeUInt16LE(7, 10);  // hotspot_x = 7
    locationCurBytes.writeUInt16LE(14, 12); // hotspot_y = 14

    const locCurMp = createMultipart(
      { kind: 'cursor' },
      [{ name: 'file', filename: 'location-custom.cur', contentType: 'image/x-icon', data: locationCurBytes }]
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
    assert.equal(locCurRes.status, 201, 'Upload custom location CUR failed');
    const locCurAsset = locCurRes.json<{ asset_id: string }>();

    // Mapping from 17 roles to base assets
    const roleSourceMap: Record<CursorRole, string> = {
      pointer: 'pointer',
      help: 'pointer',
      working: 'working',
      busy: 'busy',
      precision: 'precision',
      text: 'text',
      handwriting: 'text',
      unavailable: 'unavailable',
      resize_vertical: 'move',
      resize_horizontal: 'move',
      resize_diagonal_nwse: 'move',
      resize_diagonal_nesw: 'move',
      move: 'move',
      alternate: 'pointer',
      link: 'link',
      location: 'link', // will use locCurAsset specifically
      person: 'link',
    };

    // 6. Assign all 17 roles
    // Specifically assign unique asset for 'location'
    const assignLocRes = await httpRequest(`/api/v1/admin/packs/${packId}/roles/location`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify({
        asset_id: locCurAsset.asset_id,
        preview_asset_id: uploadedPairs['link']!.previewAssetId,
        hotspot_x: 7,
        hotspot_y: 14,
      }),
    });
    assert.equal(assignLocRes.status, 200, `Assign location failed: ${assignLocRes.status} ${assignLocRes.text()}`);
    etag = (assignLocRes.headers['etag'] as string) ?? etag;

    // Assign remaining 16 roles
    for (const role of CURSOR_ROLES) {
      if (role === 'location') continue;
      const src = roleSourceMap[role];
      const pair = uploadedPairs[src]!;
      const assignRes = await httpRequest(`/api/v1/admin/packs/${packId}/roles/${role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify({
          asset_id: pair.curAssetId,
          preview_asset_id: pair.previewAssetId,
          hotspot_x: pair.hotspotX,
          hotspot_y: pair.hotspotY,
        }),
      });
      assert.equal(assignRes.status, 200, `Assign ${role} failed: ${assignRes.status} ${assignRes.text()}`);
      etag = (assignRes.headers['etag'] as string) ?? etag;
    }

    // 6. Reload pack to test binding persistence
    const reloadRes = await httpRequest(`/api/v1/admin/packs/${packId}`);
    assert.equal(reloadRes.status, 200, 'Reload pack failed');
    const reloadedPack = reloadRes.json<{
      roles: Array<{
        role_type: CursorRole;
        asset_id: string;
        preview_asset_id: string;
        hotspot_x: number;
        hotspot_y: number;
      }>;
    }>();

    assert.equal(reloadedPack.roles.length, 17, 'Reloaded pack must have all 17 roles assigned');
    const locRole = reloadedPack.roles.find((r) => r.role_type === 'location');
    assert.ok(locRole, 'Location role must be present');
    assert.equal(locRole.asset_id, locCurAsset.asset_id, 'Location role must have custom asset_id');
    assert.equal(locRole.hotspot_x, 7, 'Location hotspot_x must be 7');
    assert.equal(locRole.hotspot_y, 14, 'Location hotspot_y must be 14');

    // 7. Validate Pack
    const valRes = await httpRequest(`/api/v1/admin/packs/${packId}/validate`, {
      method: 'POST',
      headers: { 'If-Match': etag },
    });
    assert.equal(valRes.status, 200, 'Validation endpoint failed');
    const valReport = valRes.json<{ valid: boolean; missing_roles: string[]; errors: unknown[] }>();
    assert.equal(valReport.valid, true, `Validation failed: ${JSON.stringify(valReport.errors)}`);
    assert.equal(valReport.missing_roles.length, 0, 'No missing roles allowed');

    // 8. Publish Pack
    const pubRes = await httpRequest(`/api/v1/admin/packs/${packId}/publish`, {
      method: 'POST',
      headers: { 'If-Match': etag },
    });
    assert.equal(pubRes.status, 200, `Publish failed: ${pubRes.status} ${pubRes.text()}`);
    const published = pubRes.json<{ status: string }>();
    assert.equal(published.status, 'published');
    etag = (pubRes.headers['etag'] as string) ?? etag;

    // 9. Download ZIP and inspect Install.inf
    const dlRes = await httpRequest(`/api/v1/packs/${packId}/download`);
    assert.equal(dlRes.status, 200, `Download ZIP failed: ${dlRes.status}`);
    const zipBuffer = dlRes.body;

    // Simple ZIP parser to find Install.inf and location.cur
    const files: Record<string, Buffer> = {};
    let offset = 0;
    while (offset < zipBuffer.length - 4) {
      const sig = zipBuffer.readUInt32LE(offset);
      if (sig === 0x04034b50) { // Local file header
        const compMethod = zipBuffer.readUInt16LE(offset + 8);
        const compSize = zipBuffer.readUInt32LE(offset + 18);
        const nameLen = zipBuffer.readUInt16LE(offset + 26);
        const extraLen = zipBuffer.readUInt16LE(offset + 28);
        const name = zipBuffer.toString('utf-8', offset + 30, offset + 30 + nameLen);
        const dataStart = offset + 30 + nameLen + extraLen;
        const compData = zipBuffer.subarray(dataStart, dataStart + compSize);
        if (compMethod === 0) {
          files[name] = Buffer.from(compData);
        } else if (compMethod === 8) {
          files[name] = inflateRawSync(compData);
        }
        offset = dataStart + compSize;
      } else {
        offset++;
      }
    }

    const infKey = Object.keys(files).find((k) => k.endsWith('Install.inf'));
    assert.ok(infKey, 'Install.inf must be present in the ZIP');
    const infFileBuffer = files[infKey];
    assert.ok(infFileBuffer, 'infFileBuffer must exist');
    const infContent = infFileBuffer.toString('ascii');

    // 10. Check Install.inf structure and exact location slot
    assert.ok(infContent.includes('[CursorScheme]'), 'Install.inf must have [CursorScheme]');
    const schemeMatch = infContent.match(/HKCU,"Control Panel\\Cursors\\Schemes","%SCHEME_NAME%",0x00000000,"([^"]+)"/);
    assert.ok(schemeMatch && schemeMatch[1], 'Install.inf must contain cursor scheme registry paths');
    const schemePaths = schemeMatch[1].split(',');
    assert.equal(schemePaths.length, 17, `CursorScheme must contain 17 paths, got ${schemePaths.length}`);

    // Verify index 15 corresponds to Location Select ('location.cur')
    // As required by Requirement 5: Confirm unique file sits exactly at Location Select
    const locationPath = schemePaths[15];
    assert.ok(locationPath, 'Slot 15 must exist');
    assert.ok(
      locationPath.endsWith('\\location.cur'),
      `Slot 15 (Location Select) must point to location.cur, got: ${locationPath}`
    );

    // Verify index 16 corresponds to Person Select (falls back to link.cur when asset is shared)
    const personPath = schemePaths[16];
    assert.ok(personPath, 'Slot 16 must exist');
    assert.ok(
      personPath.endsWith('\\link.cur') || personPath.endsWith('\\person.cur'),
      `Slot 16 (Person Select) must point to link.cur or person.cur, got: ${personPath}`
    );

    // 11. Verify that location.cur in the zip matches the custom bytes we uploaded
    const locFileKey = Object.keys(files).find((k) => k.endsWith('location.cur'));
    assert.ok(locFileKey, 'location.cur must be present in the ZIP files');
    const locZipBytes = files[locFileKey];
    assert.ok(locZipBytes, 'locZipBytes must exist');
    assert.equal(locZipBytes.length, locationCurBytes.length, 'location.cur byte size match');
    assert.equal(locZipBytes.readUInt16LE(10), 7, 'location.cur in ZIP must preserve hotspot_x = 7');
    assert.equal(locZipBytes.readUInt16LE(12), 14, 'location.cur in ZIP must preserve hotspot_y = 14');

    // 12. Verify public catalog detail returns 17 cursor items
    const catRes = await httpRequest(`/api/v1/packs/${slug}`);
    assert.equal(catRes.status, 200, 'Catalog detail should return 200');
    const catPack = catRes.json<{ cursor_items: Array<{ role_type: string; hotspot_x: number; hotspot_y: number }> }>();
    assert.equal(catPack.cursor_items.length, 17, 'Catalog detail must return 17 cursor items');
    const catLoc = catPack.cursor_items.find((i) => i.role_type === 'location');
    assert.ok(catLoc, 'Catalog detail must have location item');
    assert.equal(catLoc.hotspot_x, 7);
    assert.equal(catLoc.hotspot_y, 14);

  } finally {
    // 13. Clean up: Unpublish test pack back to draft
    try {
      await httpRequest(`/api/v1/admin/packs/${packId}/unpublish`, {
        method: 'POST',
        headers: { 'If-Match': etag },
      });
    } catch {
      // Ignore cleanup error if already in draft
    }
  }

  // 14. Verify Real Packs remain intact with 17 roles
  const realPackSlugs = [
    'midnight-soots',
    'letters-to-the-sky',
    'little-witchs-desk',
    'whispering-woods',
  ];

  for (const rSlug of realPackSlugs) {
    const rRes = await httpRequest(`/api/v1/packs/${rSlug}`);
    assert.equal(rRes.status, 200, `Real pack ${rSlug} must respond 200`);
    const rPack = rRes.json<{ cursor_items: unknown[] }>();
    assert.equal(rPack.cursor_items.length, 17, `Real pack ${rSlug} must have 17 cursor items`);
  }
});
