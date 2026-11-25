import test from "node:test";
import assert from "node:assert/strict";
import { productPreviewOrigin } from "../src/lib/productPreviewOrigin";
test("development uses Expo hosts and releases require an explicit HTTPS origin", () => {
  assert.equal(
    productPreviewOrigin(
      "",
      true,
      "web",
      undefined,
      "https://worthit.example",
    ),
    "https://worthit.example",
  );
  assert.equal(
    productPreviewOrigin(undefined, true, "android", "192.168.1.5:8081"),
    "http://192.168.1.5:8081",
  );
  assert.equal(
    productPreviewOrigin(
      "http://127.0.0.1:8787",
      true,
      "android",
      "192.168.1.5:8081",
    ),
    "http://192.168.1.5:8787",
  );
  assert.equal(productPreviewOrigin(undefined, false, "android"), null);
  assert.equal(productPreviewOrigin(undefined, false, "web", undefined, "https://worthit.example"), null);
  assert.equal(
    productPreviewOrigin("https://import.example/", false, "android"),
    "https://import.example",
  );
  for (const input of [
    "ftp://server.example",
    "https://user:pass@server.example",
    "http://import.example",
    "https://127.0.0.1",
    "https://import.example/some/path",
  ])
    assert.throws(() => productPreviewOrigin(input, false, "android"));
});
