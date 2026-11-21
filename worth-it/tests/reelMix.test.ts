import assert from 'node:assert/strict';
import test from 'node:test';
import { mixReels } from '../src/lib/reelMix';

const entries = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({ id: prefix + index }));

test('mixes nine shuffled discovery reels with one followed reel per ten', () => {
  const discovery = entries('d', 40);
  const following = entries('f', 12);
  const visible = [...discovery, ...following];
  const mix = mixReels(visible, following, 42, 30);
  assert.equal(new Set(mix.map((item) => item.id)).size, 30);
  assert.deepEqual(mix.flatMap((item, index) => item.id.startsWith('f') ? [index] : []), [9, 19, 29]);
  assert.deepEqual(mix, mixReels(visible, following, 42, 30));
  assert.notDeepEqual(mix, mixReels(visible, following, 105, 30));
});

test('uses the other pool when a pool runs out and deduplicates overlapping results', () => {
  const discovery = entries('d', 2);
  const following = entries('f', 3);
  const mix = mixReels([...discovery, ...following, discovery[0]], [...following, following[0]], 96);
  assert.equal(mix.length, 5);
  assert.equal(new Set(mix.map((item) => item.id)).size, 5);
  assert.deepEqual(mixReels([], [], 96), []);
});
