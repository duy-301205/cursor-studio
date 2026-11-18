import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateImageFile,
  hexToRgb,
  applyAlphaOutline,
  isCurBinaryHeader,
  MAX_UPLOAD_BYTES,
} from '../features/studio/canvasPipeline.ts';
import { convertCursor } from '../lib/api.ts';

test('validateImageFile — rejects file exceeding 2MB limit', () => {
  const largeFile = new File([''], 'huge.png', {
    type: 'image/png',
  });
  Object.defineProperty(largeFile, 'size', { value: MAX_UPLOAD_BYTES + 1 });

  const result = validateImageFile(largeFile);
  assert.equal(result.valid, false);
  assert.match(result.error ?? '', /exceeds the 2 MB limit/);
});

test('validateImageFile — accepts valid PNG, JPEG, WebP under 2MB', () => {
  const pngFile = new File(['fake-png-data'], 'valid.png', { type: 'image/png' });
  assert.equal(validateImageFile(pngFile).valid, true);

  const jpgFile = new File(['fake-jpg-data'], 'valid.jpg', { type: 'image/jpeg' });
  assert.equal(validateImageFile(jpgFile).valid, true);

  const webpFile = new File(['fake-webp-data'], 'valid.webp', { type: 'image/webp' });
  assert.equal(validateImageFile(webpFile).valid, true);
});

test('validateImageFile — rejects unsupported MIME formats', () => {
  const gifFile = new File(['fake-gif'], 'anim.gif', { type: 'image/gif' });
  const resultGif = validateImageFile(gifFile);
  assert.equal(resultGif.valid, false);
  assert.match(resultGif.error ?? '', /Unsupported file format/);

  const exeFile = new File(['fake-binary'], 'app.exe', { type: 'application/octet-stream' });
  assert.equal(validateImageFile(exeFile).valid, false);
});

test('hexToRgb — parses hex colors correctly', () => {
  assert.deepEqual(hexToRgb('#FFFFFF'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('#000000'), [0, 0, 0]);
  assert.deepEqual(hexToRgb('#EF4444'), [239, 68, 68]);
  assert.deepEqual(hexToRgb('#fff'), [255, 255, 255]);
});

test('isCurBinaryHeader — identifies Windows CUR magic bytes', () => {
  // Reserved: 0x0000, Type: 0x0002
  const validCur = new Uint8Array([0x00, 0x00, 0x02, 0x00, 0x01, 0x00]);
  assert.equal(isCurBinaryHeader(validCur), true);

  // ICO header: Type 0x0001
  const ico = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
  assert.equal(isCurBinaryHeader(ico), false);

  // Truncated header
  const short = new Uint8Array([0x00, 0x00]);
  assert.equal(isCurBinaryHeader(short), false);
});

test('applyAlphaOutline — expands alpha mask by dilation without modifying opaque center', () => {
  // 5x5 grid with center pixel (2, 2) fully opaque black
  const width = 5;
  const height = 5;
  const buffer = new Uint8ClampedArray(width * height * 4);

  // Center pixel index: (2 * 5 + 2) * 4 = 48
  const centerIdx = (2 * width + 2) * 4;
  buffer[centerIdx] = 10;     // R
  buffer[centerIdx + 1] = 20; // G
  buffer[centerIdx + 2] = 30; // B
  buffer[centerIdx + 3] = 255;// Alpha

  const mockImageData = {
    width,
    height,
    data: buffer,
    colorSpace: 'srgb',
  } as ImageData;

  // Apply 1px white outline [255, 255, 255]
  applyAlphaOutline(mockImageData, 1, [255, 255, 255]);

  // Verify center pixel retained original RGBA values
  assert.equal(buffer[centerIdx], 10);
  assert.equal(buffer[centerIdx + 1], 20);
  assert.equal(buffer[centerIdx + 2], 30);
  assert.equal(buffer[centerIdx + 3], 255);

  // Verify adjacent pixel (2, 1) received outline color
  const topNeighborIdx = (1 * width + 2) * 4;
  assert.equal(buffer[topNeighborIdx], 255);
  assert.equal(buffer[topNeighborIdx + 1], 255);
  assert.equal(buffer[topNeighborIdx + 2], 255);
  assert.equal(buffer[topNeighborIdx + 3], 255);

  // Verify far corner (0, 0) remains fully transparent (beyond radius 1)
  const farIdx = (0 * width + 0) * 4;
  assert.equal(buffer[farIdx + 3], 0);
});

test('convertCursor — live backend integration test generating valid CUR binary', async () => {
  // Minimal valid 1x1 transparent PNG blob:
  const base64Png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const binaryString = atob(base64Png);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const pngBlob = new Blob([bytes], { type: 'image/png' });

  // Test 32x32 convert
  const result32 = await convertCursor({
    file: pngBlob,
    size: 32,
    hotspot_x: 0,
    hotspot_y: 0,
  });

  assert.ok(result32.blob);
  assert.equal(result32.filename, 'custom-cursor.cur');
  const buffer32 = new Uint8Array(await result32.blob.arrayBuffer());
  assert.equal(isCurBinaryHeader(buffer32), true);

  // Test 48x48 convert with non-zero hotspot
  const result48 = await convertCursor({
    file: pngBlob,
    size: 48,
    hotspot_x: 24,
    hotspot_y: 24,
  });

  assert.ok(result48.blob);
  const buffer48 = new Uint8Array(await result48.blob.arrayBuffer());
  assert.equal(isCurBinaryHeader(buffer48), true);
});
