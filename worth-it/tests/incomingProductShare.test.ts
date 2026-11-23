import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductShareInbox,
  isAndroidSharePath,
  sharedProductUrl,
} from "../src/lib/incomingProductShare";

test("extracts a product URL from plain text, quoted messages, and retailer short links", () => {
  assert.equal(
    sharedProductUrl([
      {
        shareType: "text",
        value:
          "Found this on Myntra!\nhttps://www.myntra.com/shirts/shirt/12345/buy?variant=blue&utm_source=share.\nWould you buy it?",
      },
    ]),
    "https://www.myntra.com/shirts/shirt/12345/buy?variant=blue",
  );
  assert.equal(
    sharedProductUrl([
      {
        shareType: "text",
        value:
          "Check this out on Meesho (https://www.meesho.com/s/p/abc?ref=share).",
      },
    ]),
    "https://www.meesho.com/s/p/abc?ref=share",
  );
  assert.equal(
    sharedProductUrl([{ value: "“https://dl.meesho.com/abc123”" }]),
    "https://dl.meesho.com/abc123",
  );
  assert.equal(
    sharedProductUrl([{ shareType: "url", value: "http://amzn.to/abc" }]),
    "https://amzn.to/abc",
  );
  assert.equal(
    sharedProductUrl([
      {
        value:
          "First (https://127.0.0.1/item), then https://shop.example/product?variant=2.",
      },
    ]),
    "https://shop.example/product?variant=2",
  );
});

test("rejects unsafe destinations, non-text payloads and oversized text", () => {
  for (const value of [
    "Nothing to browse here",
    "javascript:https://shop.example/product",
    "file:///etc/hosts",
    "https://user:pass@myntra.com/path",
    "https://10.0.0.1/path",
    "https://printer.local/path",
    "https://shop.example:8000/item",
    "https://shop.example/" + "a".repeat(2048),
    "https://shop.example/product " + "a".repeat(32 * 1024),
  ])
    assert.equal(
      sharedProductUrl([{ shareType: "text", value }]),
      null,
      value.slice(0, 80),
    );
  assert.equal(
    sharedProductUrl([
      { shareType: "file", value: "https://shop.example/item" },
    ]),
    null,
  );
});

test("inbox retains pending startup shares and consumes each notification once", () => {
  const inbox = createProductShareInbox();
  const raw = [{ shareType: "text", value: "https://shop.example/item" }];
  inbox.receive(raw);
  const first = inbox.getSnapshot()!;
  assert.equal(first.url, raw[0].value);
  let updates = 0;
  const unsubscribe = inbox.subscribe(() => updates++);
  inbox.receive(raw);
  assert.equal(inbox.getSnapshot(), first);
  assert.equal(updates, 0);
  assert.ok(inbox.take(first));
  assert.equal(inbox.take(first), false);
  inbox.receive([]);
  assert.equal(inbox.getSnapshot(), null);
  assert.equal(updates, 1);

  inbox.receive(raw);
  assert.notEqual(inbox.getSnapshot(), first);
  assert.equal(updates, 2);
  inbox.receive([{ value: "Invalid share" }]);
  assert.equal(inbox.getSnapshot()!.url, null);
  unsubscribe();
});

test("only Expo Sharing's configured Android URI is intercepted", () => {
  assert.equal(isAndroidSharePath("worthit://expo-sharing"), true);
  assert.equal(isAndroidSharePath("worthit://expo-sharing/"), true);
  assert.equal(
    isAndroidSharePath("/add?productUrl=https%3A%2F%2Fshop.example"),
    false,
  );
  assert.equal(isAndroidSharePath("worthit://auth-confirm"), false);
  assert.equal(isAndroidSharePath("https://expo-sharing/"), false);
  assert.equal(
    isAndroidSharePath("worthit://expo-sharing/another-route"),
    false,
  );
});

test("incoming shares wait while a publication is in progress", () => {
  const inbox = createProductShareInbox();
  const release = inbox.hold();
  inbox.receive([{ value: "https://shop.example/product" }]);
  assert.equal(inbox.getSnapshot(), null);
  release();
  release();
  assert.equal(inbox.getSnapshot()!.url, "https://shop.example/product");
});
