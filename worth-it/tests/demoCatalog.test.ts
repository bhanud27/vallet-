import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { DEMO_POLLS, DEMO_REELS } from "../src/lib/demoData";
import {
  demoPollSummaries,
  demoPollView,
  isDemoPoll,
} from "../src/lib/demoViews";

test("catalog has 20 distinct fictional products and 10 linked reels with bundled media", () => {
  assert.equal(DEMO_POLLS.length, 20);
  assert.equal(new Set(DEMO_POLLS.map((poll) => poll.id)).size, 20);
  assert.equal(DEMO_REELS.length, 10);
  assert.equal(new Set(DEMO_REELS.map((reel) => reel.id)).size, 10);
  const images = readFileSync("src/ui/demoImages.ts", "utf8");
  const clips = readFileSync("src/ui/useReelSource.ts", "utf8");
  for (const poll of DEMO_POLLS) {
    assert.ok(poll.priceInr > 0 && poll.category && poll.question);
    const asset = "assets/demo/" + poll.demoImage + ".png";
    assert.ok(existsSync(asset), asset);
    assert.ok(
      images.includes(asset),
      "Image must be statically bundled: " + asset,
    );
    assert.equal(readFileSync(asset).subarray(1, 4).toString(), "PNG");
  }
  const hashes = new Set<string>();
  for (const reel of DEMO_REELS) {
    assert.ok(isDemoPoll(reel.pollId));
    const asset = "assets/demo/" + reel.video + "-reel.mp4";
    const bytes = readFileSync(asset);
    assert.ok(
      clips.includes(asset),
      "Video must be statically bundled: " + asset,
    );
    assert.ok(bytes.length > 10000);
    assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
  }
  assert.equal(hashes.size, 10, "Every reel has its own clip");
});

test("connected sample details match summaries without inventing an author or viewer vote", () => {
  const summaries = demoPollSummaries();
  assert.equal(summaries.length, 20);
  for (const summary of summaries) {
    const view = demoPollView(summary.id)!;
    assert.ok(summary.isDemo);
    assert.equal(summary.itemName, view.poll.itemName);
    assert.equal(summary.priceInr, view.poll.priceInr);
    assert.equal(summary.voteCount, view.votes.length);
    assert.equal(view.isAuthor, false);
    assert.equal(view.myChoice, null);
  }
  assert.equal(demoPollView("real-poll"), null);
  assert.equal(isDemoPoll("real-poll"), false);
});
