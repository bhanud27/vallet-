import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultPreferences,
  validatePreferences,
  preferenceScore,
} from "../src/lib/preferenceValues";
test("settings validation rejects unsupported values and bounds lists", () => {
  validatePreferences({
    autoplay: false,
    data_saver: true,
    comments_audience: "followers",
  });
  for (const value of [
    { language: "fr" },
    { autoplay: "true" },
    { hidden_words: [""] },
    { preferred_brands: Array(26).fill("a") },
    { notification_types: { unknown: true } },
    { notification_types: { mentions: "yes" } },
    { user_id: "another" },
  ])
    assert.throws(() => validatePreferences(value as never));
});
test("recommendation preferences rank actual matching words without hiding other content", () => {
  const p = {
    ...defaultPreferences(),
    preferred_categories: ["linen shirts"],
    preferred_brands: ["Cotton Lane"],
  };
  assert.equal(preferenceScore(p, "COTTON LANE linen-shirts"), 2);
  assert.equal(preferenceScore(p, "Sunglasses"), 0);
  assert.equal(defaultPreferences().notification_types.mentions, undefined);
  assert.equal(defaultPreferences().autoplay, true);
});
