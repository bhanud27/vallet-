import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { jpegPreview } = require('../server/media-worker.cjs');
const { cleanFolder } = require('../server/media-cleanup.cjs');
const { deletePrefix } = require('../server/deletion-worker.cjs');
test('worker decodes real JPEGs, bounds preview dimensions, and rejects disguised content', async () => {
  const input = await sharp({
    create: { width: 1800, height: 1200, channels: 3, background: '#f00' },
  })
    .jpeg()
    .toBuffer();
  const output = await jpegPreview(input);
  const info = await sharp(output).metadata();
  assert.equal(info.width, 720);
  assert.equal(info.height, 480);
  assert.equal(info.exif, undefined);
  await assert.rejects(jpegPreview(Buffer.from('<html>fake jpg</html>')));
  await assert.rejects(jpegPreview(await sharp(input).png().toBuffer()), /Expected JPEG/);
});
test('cleanup preserves referenced and recent objects and defaults to dry run', async () => {
  let deletes: string[] = [];
  const old = '2020-01-01T00:00:00Z';
  const client = {
    storage: {
      from: () => ({
        list: async () => ({
          data: [
            { id: '1', name: 'used.jpg', updated_at: old },
            { id: '2', name: 'orphan.jpg', updated_at: old },
            { id: '3', name: 'recent.jpg', updated_at: new Date().toISOString() },
          ],
        }),
        remove: async (paths: string[]) => {
          deletes.push(...paths);
          return {};
        },
      }),
    },
    rpc: async (_name: string, args: { p_path: string }) => ({ data: args.p_path === 'used.jpg' }),
  };
  assert.equal(await cleanFolder(client, 'poll-photos'), 1);
  assert.deepEqual(deletes, []);
  assert.equal(await cleanFolder(client, 'poll-photos', '', true), 1);
  assert.deepEqual(deletes, ['orphan.jpg']);
});
test('account deletion walks nested storage folders', async () => {
  const removed: string[] = [];
  const client = {
    storage: {
      from: () => ({
        list: async (path: string) => ({
          data:
            path === 'user' ? [{ name: 'thumbs', id: null }] : [{ name: 'image.jpg', id: 'one' }],
        }),
        remove: async (paths: string[]) => {
          removed.push(...paths);
          return {};
        },
      }),
    },
  };
  await deletePrefix(client, 'poll-photos', 'user');
  assert.deepEqual(removed, ['user/thumbs/image.jpg']);
});
