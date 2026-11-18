import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pointFromPointer,
  scaleHotspot,
  clampHotspot,
  getHotspotPresets,
} from '../features/studio/hotspot.ts';
import {
  isWasmSupported,
  AGPL_LICENSE_NOTICE,
  BackgroundRemovalError,
} from '../features/studio/backgroundRemoval.ts';

const mockRect384 = {
  left: 100,
  top: 50,
  width: 384,
  height: 384,
};

test('pointFromPointer — exact corner calculations for 32x32', () => {
  // Top-left exact: (0, 0)
  const topLeft = pointFromPointer(100, 50, mockRect384, 32);
  assert.deepEqual(topLeft, { x: 0, y: 0 });

  // Bottom-right exact: (31, 31)
  // 100 + 384 - 0.1 = 483.9, 50 + 384 - 0.1 = 433.9
  const bottomRight = pointFromPointer(483.9, 433.9, mockRect384, 32);
  assert.deepEqual(bottomRight, { x: 31, y: 31 });

  // Exactly at rect.right boundary: clamps to (31, 31)
  const boundaryRight = pointFromPointer(484, 434, mockRect384, 32);
  assert.deepEqual(boundaryRight, { x: 31, y: 31 });
});

test('pointFromPointer — exact corner calculations for 48x48', () => {
  // Top-left: (0, 0)
  const topLeft = pointFromPointer(100, 50, mockRect384, 48);
  assert.deepEqual(topLeft, { x: 0, y: 0 });

  // Bottom-right: (47, 47)
  const bottomRight = pointFromPointer(483.9, 433.9, mockRect384, 48);
  assert.deepEqual(bottomRight, { x: 47, y: 47 });

  // Boundary clamp: (47, 47)
  const outsideRight = pointFromPointer(600, 700, mockRect384, 48);
  assert.deepEqual(outsideRight, { x: 47, y: 47 });
});

test('pointFromPointer — out-of-bounds negative clamping', () => {
  const farNegative = pointFromPointer(-50, -100, mockRect384, 32);
  assert.deepEqual(farNegative, { x: 0, y: 0 });
});

test('pointFromPointer — center click for 32x32 and 48x48', () => {
  // Center of 384 is offset 192 -> clientX = 292, clientY = 242
  // (192 / 384) * 32 = 16
  const center32 = pointFromPointer(292, 242, mockRect384, 32);
  assert.deepEqual(center32, { x: 16, y: 16 });

  // (192 / 384) * 48 = 24
  const center48 = pointFromPointer(292, 242, mockRect384, 48);
  assert.deepEqual(center48, { x: 24, y: 24 });
});

test('scaleHotspot — converts proportional coordinates between 32 and 48', () => {
  // (0, 0) remains (0, 0)
  assert.deepEqual(scaleHotspot({ x: 0, y: 0 }, 32, 48), { x: 0, y: 0 });
  assert.deepEqual(scaleHotspot({ x: 0, y: 0 }, 48, 32), { x: 0, y: 0 });

  // Extreme corners: (31, 31) -> (47, 47) and vice versa
  assert.deepEqual(scaleHotspot({ x: 31, y: 31 }, 32, 48), { x: 47, y: 47 });
  assert.deepEqual(scaleHotspot({ x: 47, y: 47 }, 48, 32), { x: 31, y: 31 });

  // Center coordinates
  // 16 in 32: round(16 * 47 / 31) = round(24.258) = 24 in 48
  assert.deepEqual(scaleHotspot({ x: 16, y: 16 }, 32, 48), { x: 24, y: 24 });
  // 24 in 48: round(24 * 31 / 47) = round(15.83) = 16 in 32
  assert.deepEqual(scaleHotspot({ x: 24, y: 24 }, 48, 32), { x: 16, y: 16 });

  // Same size scaling returns clamped value
  assert.deepEqual(scaleHotspot({ x: 10, y: 12 }, 32, 32), { x: 10, y: 12 });
  assert.deepEqual(scaleHotspot({ x: 100, y: -5 }, 32, 32), { x: 31, y: 0 });
});

test('clampHotspot and getHotspotPresets', () => {
  assert.deepEqual(clampHotspot({ x: -10, y: 50 }, 32), { x: 0, y: 31 });
  assert.deepEqual(clampHotspot({ x: 12.8, y: 47.9 }, 48), { x: 12, y: 47 });

  const presets32 = getHotspotPresets(32);
  assert.equal(presets32.length, 3);
  assert.deepEqual(presets32[0]?.point, { x: 0, y: 0 });
  assert.deepEqual(presets32[1]?.point, { x: 16, y: 16 });
  assert.deepEqual(presets32[2]?.point, { x: 31, y: 0 });

  const presets48 = getHotspotPresets(48);
  assert.deepEqual(presets48[1]?.point, { x: 24, y: 24 });
  assert.deepEqual(presets48[2]?.point, { x: 47, y: 0 });
});

test('backgroundRemoval — AGPL license and error definitions', () => {
  assert.equal(AGPL_LICENSE_NOTICE.packageName, '@imgly/background-removal');
  assert.equal(AGPL_LICENSE_NOTICE.license, 'AGPL-3.0-or-later');
  assert.equal(AGPL_LICENSE_NOTICE.reviewRequiredBeforeRelease, true);

  const err = new BackgroundRemovalError('WASM_UNSUPPORTED', 'WebAssembly unavailable');
  assert.equal(err.code, 'WASM_UNSUPPORTED');
  assert.equal(err.name, 'BackgroundRemovalError');
  assert.match(err.message, /WebAssembly unavailable/);

  // isWasmSupported runs without crashing
  const supported = isWasmSupported();
  assert.equal(typeof supported, 'boolean');
});
