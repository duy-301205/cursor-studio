import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIX_STORAGE_KEY,
  loadLocalMix,
  saveLocalMix,
  toShareConfig,
  countAssignedRoles,
  type MixSlotItem,
  type LocalMixStateV1,
} from '../features/mix/mixStorage.ts';
import { createShare, getShare, getPacks, ApiError } from '../lib/api.ts';

// Mock localStorage for Node environment if not present
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

test('loadLocalMix — returns clean empty mix when storage is empty', () => {
  localStorage.clear();
  const mix = loadLocalMix();
  assert.equal(mix.version, 1);
  assert.equal(typeof mix.roles, 'object');
  assert.equal(Object.keys(mix.roles).length, 0);
  assert.equal(countAssignedRoles(mix.roles), 0);
});

test('saveLocalMix and loadLocalMix — persists and restores 8 independent slots', () => {
  localStorage.clear();

  const itemPointer: MixSlotItem = {
    pack_id: 1,
    pack_title: 'Minimal Dark',
    pack_slug: 'minimal-dark',
    role_type: 'pointer',
    preview_png_url: 'http://localhost:8000/static/pointer.png',
    hotspot_x: 0,
    hotspot_y: 0,
  };

  const itemLink: MixSlotItem = {
    pack_id: 2,
    pack_title: 'Retro Neon',
    pack_slug: 'retro-neon',
    role_type: 'link',
    preview_png_url: 'http://localhost:8000/static/link.png',
    hotspot_x: 5,
    hotspot_y: 2,
  };

  const state: LocalMixStateV1 = {
    version: 1,
    title: 'Custom Hybrid Workstation',
    roles: {
      pointer: itemPointer,
      link: itemLink,
    },
    updatedAt: new Date().toISOString(),
  };

  saveLocalMix(state);

  const restored = loadLocalMix();
  assert.equal(restored.version, 1);
  assert.equal(restored.title, 'Custom Hybrid Workstation');
  assert.equal(countAssignedRoles(restored.roles), 2);
  assert.deepEqual(restored.roles.pointer, itemPointer);
  assert.deepEqual(restored.roles.link, itemLink);
  assert.equal(restored.roles.text, undefined);

  // Raw localStorage check
  const raw = localStorage.getItem(MIX_STORAGE_KEY);
  assert.ok(raw);
  assert.match(raw, /"version":1/);
  assert.match(raw, /Custom Hybrid Workstation/);
});

test('loadLocalMix — gracefully handles corrupt or malformed JSON in localStorage', () => {
  // Corrupt non-JSON string
  localStorage.setItem(MIX_STORAGE_KEY, '{invalid-json:true}');
  const fallbackCorrupt = loadLocalMix();
  assert.equal(fallbackCorrupt.version, 1);
  assert.equal(countAssignedRoles(fallbackCorrupt.roles), 0);

  // Incompatible version
  localStorage.setItem(MIX_STORAGE_KEY, JSON.stringify({ version: 99, roles: {} }));
  const fallbackVersion = loadLocalMix();
  assert.equal(fallbackVersion.version, 1);

  // Malformed role data (invalid role keys or missing required numbers)
  localStorage.setItem(
    MIX_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      roles: {
        nonExistentRole: { pack_id: 1 },
        pointer: { pack_id: 'not-a-number' }, // invalid type
      },
    })
  );
  const fallbackRoles = loadLocalMix();
  assert.equal(countAssignedRoles(fallbackRoles.roles), 0);
});

test('toShareConfig — strips local UI URLs and dates, outputting strict ShareConfig', () => {
  const item: MixSlotItem = {
    pack_id: 1,
    pack_title: 'Minimal Dark',
    pack_slug: 'minimal-dark',
    role_type: 'busy',
    preview_png_url: 'http://localhost:8000/static/busy.png',
    hotspot_x: 16,
    hotspot_y: 16,
  };

  const mix: LocalMixStateV1 = {
    version: 1,
    title: 'Minimal Test',
    roles: {
      busy: item,
    },
    updatedAt: new Date().toISOString(),
  };

  const shareConfig = toShareConfig(mix);
  assert.equal(shareConfig.version, 1);
  assert.deepEqual(shareConfig.roles, {
    busy: {
      pack_id: 1,
      role_type: 'busy',
    },
  });

  // Verify UI fields were completely stripped
  assert.equal((shareConfig as any).updatedAt, undefined);
  assert.equal((shareConfig.roles.busy as any).preview_png_url, undefined);
  assert.equal((shareConfig.roles.busy as any).hotspot_x, undefined);
});

test('createShare and getShare — live backend integration test for shared presets', async () => {
  let validPackId = 1;
  try {
    const packsRes = await getPacks({ limit: 1 });
    if (packsRes.items.length > 0 && packsRes.items[0]?.id) {
      validPackId = packsRes.items[0].id;
    }
  } catch {
    // fallback
  }

  const payload = {
    title: 'Integration Test Preset',
    config: {
      version: 1 as const,
      roles: {
        pointer: { pack_id: validPackId, role_type: 'pointer' as const },
        link: { pack_id: validPackId, role_type: 'link' as const },
      },
    },
  };

  const created = await createShare(payload);
  assert.ok(created.share_code);
  assert.ok(created.expires_at);
  assert.match(created.share_url, new RegExp(created.share_code));

  // Retrieve shared preset via getShare
  const sharedView = await getShare(created.share_code);
  assert.equal(sharedView.share_code, created.share_code);
  assert.equal(sharedView.title, 'Integration Test Preset');
  assert.ok(Array.isArray(sharedView.resolved_items));
  assert.equal(sharedView.resolved_items.length, 2);

  const pointerItem = sharedView.resolved_items.find((i) => i.target_role === 'pointer');
  assert.ok(pointerItem);
  assert.equal(pointerItem?.pack_id, validPackId);
  assert.ok(pointerItem?.preview_png_url);

  // Verify non-existent share code returns 404
  await assert.rejects(
    async () => {
      await getShare('missing00000');
    },
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      return true;
    }
  );
});
