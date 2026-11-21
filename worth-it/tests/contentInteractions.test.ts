import test from "node:test";
import assert from "node:assert/strict";
import { contentTaps, contentTouchPoint } from "../src/lib/contentTaps";
import { createStarState } from "../src/lib/starState";
function gestures() {
  let now = 0,
    seq = 0,
    singles = 0,
    doubles = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const taps = contentTaps(
    () => singles++,
    () => doubles++,
    280,
    {
      set(fn, ms) {
        timers.set(++seq, { at: now + ms, fn });
        return seq;
      },
      clear(id) {
        timers.delete(id as number);
      },
    },
  );
  return {
    taps,
    advance(ms: number) {
      now += ms;
      for (const [key, timer] of [...timers])
        if (timer.at <= now) {
          timers.delete(key);
          timer.fn();
        }
    },
    get singles() {
      return singles;
    },
    get doubles() {
      return doubles;
    },
  };
}
test("single taps open once after the double-tap window", () => {
  const g = gestures();
  g.taps.tap();
  g.advance(279);
  assert.equal(g.singles, 0);
  g.advance(1);
  assert.equal(g.singles, 1);
  assert.equal(g.doubles, 0);
});
test("double tap stars once without opening; repeated pairs never open", () => {
  const g = gestures();
  g.taps.tap(10, 20);
  g.advance(90);
  g.taps.tap(12, 21);
  g.advance(500);
  assert.equal(g.doubles, 1);
  assert.equal(g.singles, 0);
  g.taps.tap();
  g.taps.tap();
  g.advance(500);
  assert.equal(g.doubles, 2);
  assert.equal(g.singles, 0);
});
test("scroll, unmount and distant taps do not accidentally combine", () => {
  const g = gestures();
  g.taps.tap();
  g.taps.cancel();
  g.advance(500);
  assert.equal(g.singles, 0);
  g.taps.tap(0, 0);
  g.taps.tap(100, 0);
  g.advance(500);
  assert.equal(g.doubles, 0);
  assert.equal(g.singles, 1);
});
test("simultaneous repeated Star adds coalesce and keep the server count", async () => {
  const s = createStarState();
  s.seed("a", { starred: false, count: 12 });
  let calls = 0;
  const persist = async (next: boolean) => {
    calls++;
    await Promise.resolve();
    return { starred: next, count: 19 };
  };
  await Promise.all([
    s.set("a", true, persist),
    s.set("a", true, persist),
    s.set("a", true, persist),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(s.get("a"), { starred: true, count: 19 });
  await s.set("a", true, persist);
  assert.equal(calls, 1);
  s.seed("a", { starred: false, count: 12 });
  assert.equal(
    s.get("a")?.count,
    19,
    "unchanged stale screen props cannot undo a reaction",
  );
});
test("failed Stars roll back, toggles remain available, and accounts are isolated", async () => {
  const s = createStarState();
  s.seed("a", { starred: false, count: 4 });
  s.seed("b", { starred: false, count: 1 });
  await assert.rejects(
    s.set("a", true, async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
  assert.deepEqual(s.get("a"), { starred: false, count: 4 });
  await s.set("a", true, async () => ({ starred: true, count: 5 }));
  await s.set("a", false, async () => ({ starred: false, count: 4 }));
  assert.deepEqual(s.get("a"), { starred: false, count: 4 });
  assert.deepEqual(s.get("b"), { starred: false, count: 1 });
});

test("default timers call browser globals without binding them to the clock object", () => {
  const original = globalThis.setTimeout;
  let scheduled: () => void = () => {},
    opened = false;
  try {
    globalThis.setTimeout = function (this: unknown, fn: () => void) {
      assert.equal(this, undefined);
      scheduled = fn;
      return 1;
    } as unknown as typeof setTimeout;
    const taps = contentTaps(
      () => {
        opened = true;
      },
      () => {},
    );
    taps.tap();
    scheduled();
    assert.equal(opened, true);
  } finally {
    globalThis.setTimeout = original;
  }
});

test("second finger press reserves the first tap until release, even past its opening deadline", () => {
  const g = gestures();
  g.taps.begin(100, 200);
  g.taps.tap(100, 200);
  g.advance(240);
  g.taps.begin(112, 202);
  g.advance(180);
  assert.equal(g.singles, 0);
  g.taps.tap(112, 202);
  g.advance(500);
  assert.equal(g.doubles, 1);
  assert.equal(g.singles, 0);
});
test("scroll cancellation during the reserved second press never opens or Stars", () => {
  const g = gestures();
  g.taps.tap(100, 100);
  g.advance(150);
  g.taps.begin(110, 100);
  g.taps.cancel();
  g.advance(1000);
  assert.equal(g.singles, 0);
  assert.equal(g.doubles, 0);
});
test("native touch-array coordinates are used without inventing a jump to the origin", () => {
  assert.deepEqual(
    contentTouchPoint({ touches: [{ pageX: 120, pageY: 250 }] }),
    { x: 120, y: 250 },
  );
  assert.deepEqual(
    contentTouchPoint({
      touches: [],
      changedTouches: [{ pageX: 121, pageY: 251 }],
    }),
    { x: 121, y: 251 },
  );
  assert.equal(contentTouchPoint({}), undefined);
  assert.equal(contentTouchPoint({ pageX: NaN, pageY: 1 }), undefined);
  assert.deepEqual(contentTouchPoint({ pageX: 0, pageY: 0 }), { x: 0, y: 0 });
});
