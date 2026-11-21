import test from "node:test";
import assert from "node:assert/strict";
import { orderedComments } from "../src/lib/commentOrder";

test("comment sorting preserves source data, applies date order and stabilizes ties", () => {
  const row = (id: string, created_at: string) => ({
    id,
    created_at,
    username: "Shopper",
    body: id,
  });
  const input = [
    row("b", "2026-11-20T08:00:00Z"),
    row("a", "2026-11-20T08:00:00Z"),
    row("old", "2026-11-19T08:00:00Z"),
  ];
  assert.deepEqual(
    orderedComments(input, "newest").map((item) => item.id),
    ["a", "b", "old"],
  );
  assert.deepEqual(
    orderedComments(input, "oldest").map((item) => item.id),
    ["old", "a", "b"],
  );
  assert.deepEqual(
    input.map((item) => item.id),
    ["b", "a", "old"],
  );
});
