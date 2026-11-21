import test from "node:test";
import assert from "node:assert/strict";
import { productPreviewOrigin } from "../src/lib/productPreviewOrigin";
test("web exports use the same-origin API and native previews resolve Expo LAN hosts", () => {
  assert.equal(
    productPreviewOrigin(
      "",
      false,
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
  assert.equal(
    productPreviewOrigin("https://import.example/", false, "android"),
    "https://import.example",
  );
  for (const input of [
    "ftp://server.example",
    "https://user:pass@server.example",
    "http://import.example",
  ])
    assert.throws(() => productPreviewOrigin(input, false, "android"));
});
