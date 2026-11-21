import test from 'node:test';
import assert from 'node:assert/strict';
import { socialLayout } from '../src/lib/socialLayout';
import { mixExplore, exploreId } from '../src/lib/exploreGrid';
import { createTaskQueue } from '../src/lib/taskQueue';
import type { PollSummary } from '../src/lib/types';
import type { Reel } from '../src/lib/socialRepo';
test('feed and three-column explore grid fit small phones, tablets, and desktop', () => {
  for (const width of [280, 320, 375, 414, 768, 879, 880, 1024, 1440]) {
    const layout = socialLayout(width, 844);
    assert.ok(layout.feedWidth <= width);
    if (width < 600)
      assert.ok(layout.feedWidth >= width - 20, 'phone posts should use nearly the whole screen');
    assert.ok(layout.tileWidth * 3 + 4 <= width + 0.01);
    assert.ok(Math.abs(layout.tileWidth * 3 + 4 - layout.gridWidth) < 0.01);
    assert.ok(layout.reelHeight <= 604);
  }
});
test('explore mixes both media kinds and deduplicates without merging unrelated IDs', () => {
  const polls = [{ id: 'one' }, { id: 'two' }, { id: 'one' }] as PollSummary[];
  const reels = [{ id: 'one' }, { id: 'three' }] as Reel[];
  assert.deepEqual(mixExplore(polls, reels).map(exploreId), [
    'poll:one',
    'reel:one',
    'poll:two',
    'reel:three',
  ]);
});
test('thumbnail decoding runs no more than two jobs and removes cancelled queued work', async () => {
  const queue = createTaskQueue(2),
    signal = new AbortController(),
    cancel = new AbortController();
  const releases: (() => void)[] = [];
  let active = 0,
    maximum = 0,
    queuedRan = false;
  const task = () =>
    queue.run(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
    }, signal.signal);
  const first = task(),
    second = task();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const cancelled = queue.run(async () => {
    queuedRan = true;
  }, cancel.signal);
  cancel.abort();
  await assert.rejects(cancelled, /Cancelled/);
  const third = task();
  assert.equal(releases.length, 2);
  releases[0]();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(releases.length, 3);
  releases[1]();
  releases[2]();
  await Promise.all([second, third]);
  assert.equal(maximum, 2);
  assert.equal(queuedRan, false);
});
test('a failed thumbnail does not block subsequent previews', async () => {
  const queue = createTaskQueue(1),
    signal = new AbortController().signal;
  await assert.rejects(
    queue.run(async () => {
      throw new Error('bad video');
    }, signal),
    /bad video/,
  );
  assert.equal(await queue.run(async () => 42, signal), 42);
});
