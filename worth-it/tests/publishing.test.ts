import test from "node:test";
import assert from "node:assert/strict";
import { publishPoll } from "../src/lib/publishPoll";
import type { NewPollInput } from "../src/lib/types";
const id = "11111111-1111-4111-8111-111111111111";
const input: NewPollInput = {
  requestId: id,
  itemName: "Shoes",
  priceInr: 999,
  question: "Worth it?",
  media: [
    {
      kind: "image",
      id: "22222222-2222-4222-8222-222222222222",
      file: { uri: "file:///photo.jpg" },
    },
  ],
};
function fixture() {
  const rows = new Map<string, any>();
  const files = new Set<string>();
  const state = {
    lostReply: false,
    offlineAfterCommit: false,
    failUpload: false,
    inserts: 0,
    uploads: 0,
    deletes: 0,
  };
  const client: any = {
    from() {
      return {
        select() {
          let requested = "";
          return {
            eq(key: string, value: string) {
              if (key === "id") requested = value;
              return this;
            },
            async maybeSingle() {
              if (state.offlineAfterCommit && state.inserts)
                throw new Error("offline");
              return { data: rows.get(requested) || null, error: null };
            },
          };
        },
        insert(row: any) {
          return {
            select() {
              return {
                async single() {
                  state.inserts++;
                  rows.set(row.id, row);
                  return {
                    data: state.lostReply ? null : row,
                    error: state.lostReply ? { message: "timeout" } : null,
                  };
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from() {
        return {
          async list(owner: string) {
            return {
              data: [...files].map((value) => ({ name: value.split("/")[1] })),
              error: null,
            };
          },
          async upload(path: string) {
            state.uploads++;
            if (state.failUpload)
              return { error: new Error("upload interrupted") };
            files.add(path);
            return { error: null };
          },
          async remove() {
            state.deletes++;
          },
        };
      },
    },
  };
  const run = () =>
    publishPoll(client, input, "owner", id, async () => new ArrayBuffer(2));
  return { rows, files, state, run, client };
}
test("lost insert acknowledgement recovers the saved post without deleting its media", async () => {
  const f = fixture();
  f.state.lostReply = true;
  assert.equal((await f.run()).id, id);
  assert.equal(f.state.inserts, 1);
  assert.equal(f.state.deletes, 0);
  assert.equal(f.files.size, 1);
});
test("offline after commit is recoverable with the same publishing identity", async () => {
  const f = fixture();
  f.state.lostReply = true;
  f.state.offlineAfterCommit = true;
  await assert.rejects(f.run(), /offline/);
  assert.equal(f.files.size, 1);
  assert.equal(f.state.deletes, 0);
  f.state.offlineAfterCommit = false;
  assert.equal((await f.run()).id, id);
  assert.equal(f.state.inserts, 1);
  assert.equal(f.state.uploads, 1);
});
test("a failed upload can be retried without changing the post identity", async () => {
  const f = fixture();
  f.state.failUpload = true;
  await assert.rejects(f.run());
  assert.equal(f.rows.size, 0);
  f.state.failUpload = false;
  await f.run();
  assert.equal(f.rows.size, 1);
  assert.equal(f.state.deletes, 0);
});
test("repeated successful submissions return the existing post", async () => {
  const f = fixture();
  await f.run();
  await f.run();
  assert.equal(f.state.inserts, 1);
  assert.equal(f.state.uploads, 1);
});

test("publish progress describes actual stages without pretending to measure bytes", async () => {
  const f = fixture();
  const stages: string[] = [];
  await publishPoll(
    f.client,
    input,
    "owner",
    id,
    async () => new ArrayBuffer(2),
    (status) => stages.push(status.stage),
  );
  assert.deepEqual(stages, [
    "preparing",
    "uploading",
    "uploading",
    "publishing",
    "completed",
  ]);
});

test("a paused draft does not insert or remove media", async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    publishPoll(
      f.client,
      { ...input, signal: controller.signal },
      "owner",
      id,
      async () => new ArrayBuffer(2),
    ),
    /paused/,
  );
  assert.equal(f.state.inserts, 0);
  assert.equal(f.state.deletes, 0);
});
test("the upload adapter reports bytes before committing the same poll ID", async () => {
  const f = fixture();
  let observed = 0;
  await publishPoll(
    f.client,
    input,
    "owner",
    id,
    async () => new ArrayBuffer(10),
    (v) => {
      if (v.bytesSent) observed = v.bytesSent;
    },
    undefined,
    async (_bucket, _path, _bytes, _type, progress) => {
      progress(5, 10);
      return { error: null };
    },
  );
  assert.equal(observed, 5);
  assert.equal(f.state.inserts, 1);
});

test("regular fashion posts persist an explicit type and null price through the same retry-safe media publisher", async () => {
  const f = fixture();
  const post = {
    ...input,
    contentKind: "post" as const,
    priceInr: 0,
    question: "My weekend look",
    category: "fashion" as const,
  };
  await publishPoll(
    f.client,
    post,
    "owner",
    id,
    async () => new ArrayBuffer(2),
  );
  assert.equal(f.rows.get(id).content_type, "post");
  assert.equal(f.rows.get(id).price_inr, null);
  assert.equal(f.rows.get(id).question, "My weekend look");
  await publishPoll(
    f.client,
    post,
    "owner",
    id,
    async () => new ArrayBuffer(2),
  );
  assert.equal(f.state.inserts, 1);
  assert.equal(f.state.uploads, 1);
});

test("product metadata uses the existing publisher and survives acknowledgement loss", async () => {
  const f = fixture();
  f.state.lostReply = true;
  const details = {
    brand: "Brand",
    description: "Cotton",
    category: "T-shirts",
    currency: "INR",
    price: 999,
  };
  await publishPoll(
    f.client,
    { ...input, productDetails: details },
    "owner",
    id,
    async () => new ArrayBuffer(2),
  );
  assert.deepEqual(f.rows.get(id).product_details, details);
  assert.equal(f.state.inserts, 1);
});
