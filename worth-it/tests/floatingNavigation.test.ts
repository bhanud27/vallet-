import test from "node:test";
import assert from "node:assert/strict";
import {
  FLOATING_NAV,
  floatingDockHeight,
  floatingSidePadding,
} from "../src/lib/floatingNavigation";
test("floating dock reserves capsule, gaps and system gesture area", () => {
  for (const bottom of [0, 16, 24, 34, 48]) {
    const reserved = floatingDockHeight(bottom);
    assert.equal(
      reserved - bottom - FLOATING_NAV.gap * 2,
      FLOATING_NAV.barHeight,
    );
    assert.ok(reserved >= FLOATING_NAV.barHeight + bottom + 16);
  }
  assert.equal(floatingDockHeight(-1), floatingDockHeight(0));
});

test("side margins align with the header without counting landscape cutouts twice", () => {
  assert.equal(floatingSidePadding(0, false), 12);
  assert.equal(floatingSidePadding(44, false) + 44, 56);
  assert.equal(floatingSidePadding(44, true), 56);
  assert.equal(floatingSidePadding(0, true), 12);
  assert.equal(floatingSidePadding(-1, true), 12);
});
