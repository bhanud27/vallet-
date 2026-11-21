import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { optionalRpc } from '../src/lib/backendRpc';
import { mediaDerivatives } from '../src/lib/mediaDerivatives';
import { feedSource } from '../src/lib/feedSource';
import { notificationData, markNotificationsRead } from '../src/lib/notificationsData';
import { accountSafetyStatus } from '../src/lib/accountSafetyStatus';
import { pollRead } from '../src/lib/pollRead';
import { ownReelPublished } from '../src/lib/reelPublishLookup';
const missing = { code: 'PGRST202', message: 'Could not find function in schema cache' };
function client(responses: Record<string, unknown>) {
  const calls: { name: string; args: unknown }[] = [];
  return {
    calls,
    value: {
      rpc: async (name: string, args?: unknown) => {
        calls.push({ name, args });
        return responses[name] ?? { data: null, error: missing };
      },
    } as unknown as SupabaseClient,
  };
}
test('missing processing RPC keeps original-media loading available for profiles and reels', async () => {
  const c = client({});
  assert.deepEqual(await mediaDerivatives(c.value, ['post']), []);
  assert.equal(c.calls[0].name, 'worthit_media_derivatives');
});
test('media permission and network failures are not misreported as missing migrations', async () => {
  for (const error of [{ code: '42501', message: 'denied' }, { message: 'Failed to fetch' }]) {
    const c = client({ worthit_media_derivatives: { data: null, error } });
    await assert.rejects(
      mediaDerivatives(c.value, ['post']),
      error.code === '42501' ? /permission/ : /connection/,
    );
  }
});
test('optional RPC fallback is limited to a missing function', async () => {
  const c = client({
    broken: { error: { code: '42883', message: 'dependent SQL function missing' } },
  });
  await assert.rejects(optionalRpc(c.value, 'broken'), { code: '42883' });
  assert.deepEqual(await optionalRpc(c.value, 'missing'), { available: false });
});
test('legacy feed uses authorized loaders, deduplicates, and pages equal timestamps', async () => {
  const c = client({});
  let loads = 0;
  const rows = Array.from({ length: 25 }, (_, i) => ({
    id: String(i + 1).padStart(3, '0'),
    time: '2026-01-01T00:00:00Z',
  }));
  const load = async () => {
    loads++;
    return [...rows, rows[0]];
  };
  const first = await feedSource(
    c.value,
    undefined,
    load,
    (row) => row,
    (row) => row.id,
  );
  assert.equal(first.kind, 'legacy');
  if (first.kind !== 'legacy') return;
  assert.equal(first.items.length, 12);
  assert.equal(first.items[0].id, '025');
  const next = await feedSource(
    c.value,
    first.items[11],
    load,
    (row) => row,
    (row) => row.id,
  );
  assert.equal(next.kind, 'legacy');
  if (next.kind !== 'legacy') return;
  assert.equal(next.items[0].id, '013');
  assert.equal(next.items.length, 12);
  assert.equal(loads, 2);
});
test('current feed empty results and permission failures never trigger legacy reads', async () => {
  for (const response of [
    { data: [], error: null },
    { data: null, error: { code: '42501', message: 'denied' } },
  ]) {
    const c = client({ worthit_feed: response });
    let legacy = false;
    const run = () =>
      feedSource(
        c.value,
        undefined,
        async () => {
          legacy = true;
          return [];
        },
        (_v: never) => ({ time: '', id: '' }),
        () => '',
      );
    if (response.error) await assert.rejects(run(), { code: '42501' });
    else assert.deepEqual(await run(), { kind: 'current', rows: [] });
    assert.equal(legacy, false);
  }
});
test('notifications remain visible when only notification-read support is missing', async () => {
  const items = [
    {
      id: 'n1',
      kind: 'follow',
      target_id: 'member',
      username: 'friend',
      detail: '',
      created_at: '2026-01-01',
    },
  ];
  const c = client({ list_social_notifications: { data: items, error: null } });
  const result = await notificationData(c.value);
  assert.deepEqual(result.items, items);
  assert.equal(result.readAvailable, false);
  assert.equal(result.warning, '');
  assert.deepEqual(c.calls[1].args, { p_mark: false });
});
test('notification status failures preserve notifications and show an honest warning', async () => {
  const c = client({
    list_social_notifications: { data: [{ id: 'n1' }], error: null },
    worthit_notification_read: { data: null, error: { message: 'offline' } },
  });
  const result = await notificationData(c.value);
  assert.equal(result.items.length, 1);
  assert.match(result.warning, /could not be checked/);
});
test('marking read sends an explicit parameter and never pretends a missing write succeeded', async () => {
  const c = client({});
  assert.deepEqual(await markNotificationsRead(c.value), { available: false });
  assert.deepEqual(c.calls[0].args, { p_mark: true });
});
test('missing safety support disables safety actions; real failures stay visible', async () => {
  const c = client({});
  assert.deepEqual(await accountSafetyStatus(c.value), {
    available: false,
    blocks: [],
    moderator: false,
  });
  const denied = client({ list_account_blocks: { error: { code: '42501' } } });
  await assert.rejects(accountSafetyStatus(denied.value), { code: '42501' });
});
test('poll results use the existing authorized endpoint only when the paged endpoint is absent', async () => {
  const poll = { poll: { id: 'p' }, votes: [] };
  const c = client({ get_poll_view: { data: poll, error: null } });
  assert.deepEqual(await pollRead(c.value, 'p'), poll);
  assert.deepEqual(
    c.calls.map((v) => v.name),
    ['worthit_poll_page', 'get_poll_view'],
  );
  const denied = client({ worthit_poll_page: { error: { code: '42501' } } });
  await assert.rejects(pollRead(denied.value, 'p'), { code: '42501' });
  assert.equal(denied.calls.length, 1);
});
test('reel retry lookup works without new table grants and checks the owner', async () => {
  const c = client({
    social_reel_feed: {
      data: [
        { id: 'r', author_id: 'owner' },
        { id: 'other', author_id: 'someone-else' },
      ],
      error: null,
    },
  });
  assert.equal(await ownReelPublished(c.value, 'owner', 'r'), true);
  assert.equal(await ownReelPublished(c.value, 'owner', 'other'), false);
});
