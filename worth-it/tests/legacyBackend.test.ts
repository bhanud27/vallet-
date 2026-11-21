import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { feedSource } from '../src/lib/feedSource';
import { mediaDerivatives } from '../src/lib/mediaDerivatives';
import { notificationData } from '../src/lib/notificationsData';
import { pollRead } from '../src/lib/pollRead';
import { accountSafetyStatus } from '../src/lib/accountSafetyStatus';
import { ownReelPublished } from '../src/lib/reelPublishLookup';
test(
  'core reads work on the pre-upgrade schema without bypassing privacy',
  { timeout: 90000 },
  async () => {
    const db = new PGlite();
    const owner = 'a1000000-0000-4000-8000-000000000001',
      viewer = 'a1000000-0000-4000-8000-000000000002',
      outsider = 'a1000000-0000-4000-8000-000000000003';
    const poll = 'a2000000-0000-4000-8000-000000000001',
      reel = 'a3000000-0000-4000-8000-000000000001';
    try {
      await db.exec(
        await readFile(new URL('../supabase/tests/00_supabase_stubs.sql', import.meta.url), 'utf8'),
      );
      const directory = new URL('../supabase/migrations/', import.meta.url);
      for (const name of (await readdir(directory))
        .filter((n) => n.endsWith('.sql') && n < '0012')
        .sort())
        await db.exec(await readFile(new URL(name, directory), 'utf8'));
      for (const [id, username] of [
        [owner, 'legacy_owner'],
        [viewer, 'legacy_viewer'],
        [outsider, 'legacy_outsider'],
      ])
        await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
          id,
          JSON.stringify({ worthit_username: username }),
        ]);
      await db.query('update public.social_profiles set is_private=true where id=$1', [owner]);
      await db.query(
        'insert into public.polls(id,author_id,item_name,price_inr,question,image_path) values($1,$2,$3,100,$4,$5)',
        [poll, owner, 'Legacy shoe', 'Worth it?', owner + '/' + poll + '.jpg'],
      );
      await db.query('insert into storage.objects(bucket_id,name,owner) values($1,$2,$3)', [
        'poll-photos',
        owner + '/' + poll + '.jpg',
        owner,
      ]);
      await db.query(
        'insert into public.social_follows(follower_id,following_id,accepted) values($1,$2,true)',
        [viewer, owner],
      );
      await db.query(
        'insert into public.social_reels(id,author_id,caption,video_path) values($1,$2,$3,$4)',
        [reel, viewer, 'Legacy reel', viewer + '/reels/' + reel + '.mp4'],
      );
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [viewer]);
      // Adapt real PostgreSQL results to RPC responses without contacting Supabase.
      const client = {
        rpc: async (name: string, args: Record<string, unknown> = {}) => {
          assert.match(name, /^[a-z_]+$/);
          const found = await db.query<{ proretset: boolean }>(
            "select proretset from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname=$1",
            [name],
          );
          if (!found.rows.length) return { data: null, error: { code: 'PGRST202' } };
          const keys = Object.keys(args);
          for (const key of keys) assert.match(key, /^[a-z_]+$/);
          const call =
            'public.' + name + '(' + keys.map((key, i) => key + '=>$' + (i + 1)).join(',') + ')';
          try {
            const sql = found.rows[0].proretset
              ? "select coalesce(jsonb_agg(to_jsonb(row)),'[]'::jsonb) as value from " +
                call +
                ' row'
              : 'select ' + call + ' as value';
            const result = await db.query<{ value: unknown }>(sql, Object.values(args));
            return { data: result.rows[0]?.value, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
      } as unknown as SupabaseClient;
      type Post = { id: string; created_at: string };
      const page = await feedSource<never, Post>(
        client,
        undefined,
        async () => {
          const { data, error } = await client.rpc('list_social_polls', { p_author: null });
          if (error) throw error;
          return data as Post[];
        },
        (item) => ({ time: item.created_at, id: item.id }),
        (item) => item.id,
      );
      assert.equal(page.kind, 'legacy');
      if (page.kind === 'legacy') assert.equal(page.items[0].id, poll);
      assert.equal((await pollRead(client, poll))?.poll.id, poll);
      assert.deepEqual(await mediaDerivatives(client, [poll, reel]), []);
      assert.equal((await notificationData(client)).readAvailable, false);
      assert.equal((await accountSafetyStatus(client)).available, false);
      await assert.rejects(db.query('select * from public.social_reels'), /permission denied/);
      assert.equal(await ownReelPublished(client, viewer, reel), true);
      assert.equal(
        (await db.query<{ count: number }>('select count(*)::int as count from storage.objects'))
          .rows[0].count,
        1,
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [outsider]);
      assert.equal(await pollRead(client, poll), null);
      const forbidden = await client.rpc('list_social_polls', { p_author: owner });
      assert.deepEqual(forbidden.data, []);
      assert.equal(
        (await db.query<{ count: number }>('select count(*)::int as count from storage.objects'))
          .rows[0].count,
        0,
      );
    } finally {
      await db.close();
    }
  },
);
