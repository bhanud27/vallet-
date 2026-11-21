import { pollEdit } from "../src/lib/postEdits";
import test from "node:test";
import assert from "node:assert/strict";
import { createLocalRepo, type KV } from "../src/lib/localRepo";
import { createRequire } from "node:module";
const { cleanPostMedia } = createRequire(import.meta.url)(
  "../server/post-cleanup.cjs",
);
test("local edit, archive, restore and delete preserve and remove the correct data", async () => {
  const data = new Map<string, string>(),
    deleted: string[] = [];
  const kv: KV = {
    getItem: async (k) => data.get(k) || null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
  const repo = createLocalRepo({
    kv,
    prepareImage: async () => "",
    storeMedia: async () => {},
    removeMedia: async (id) => {
      deleted.push(id);
    },
  });
  await repo.init();
  const poll = await repo.createPoll({
    itemName: "Shirt",
    question: "Worth it?",
    priceInr: 500,
    media: [{ kind: "image", file: { uri: "file.jpg" } }],
  });
  await repo.demoTools!.actAsNewGuest();
  await assert.rejects(
    () => repo.managePoll(poll.id, "delete"),
    /Only the owner/,
  );
  await repo.castVote(poll.id, {
    choice: "buy",
    reason: "Useful",
    ownsItem: true,
  });
  await repo.demoTools!.backToMyIdentity();
  await repo.managePoll(poll.id, "edit", {
    itemName: "Blue shirt",
    question: "For work?",
    priceInr: 600,
    productUrl: "",
  });
  assert.equal((await repo.getPollView(poll.id))!.votes.length, 1);
  await repo.managePoll(poll.id, "archive");
  assert.equal((await repo.listMyPolls()).length, 0);
  assert.equal((await repo.listMyPolls(true))[0].itemName, "Blue shirt");
  assert.ok(
    !(await repo.discoverPolls({ needsAnswer: false })).some(
      (p) => p.id === poll.id,
    ),
  );
  await repo.demoTools!.actAsNewGuest();
  assert.equal(await repo.getPollView(poll.id), null);
  await repo.demoTools!.backToMyIdentity();
  await repo.managePoll(poll.id, "restore");
  assert.equal((await repo.listMyPolls()).length, 1);
  await repo.managePoll(poll.id, "delete");
  assert.equal(await repo.getPollView(poll.id), null);
  assert.equal(deleted.length, 1);
  const next = createLocalRepo({ kv, prepareImage: async () => "" });
  await next.init();
  assert.equal(await next.getPollView(poll.id), null);
});
test("failed local mutations leave persisted and cached data unchanged", async () => {
  let raw: string | null = null,
    fail = false;
  const repo = createLocalRepo({
    kv: {
      getItem: async () => raw,
      setItem: async (_k, v) => {
        if (fail) throw Error("full");
        raw = v;
      },
      removeItem: async () => {},
    },
    prepareImage: async () => "",
  });
  await repo.init();
  const poll = await repo.createPoll({
    itemName: "One",
    question: "Worth?",
    priceInr: 100,
    photo: { uri: "file.jpg" },
  });
  fail = true;
  await assert.rejects(
    () => repo.managePoll(poll.id, "archive"),
    /Could not save/,
  );
  assert.equal((await repo.listMyPolls()).length, 1);
  fail = false;
  await assert.rejects(
    () =>
      repo.managePoll(poll.id, "edit", {
        itemName: "",
        question: "?",
        priceInr: 100,
        productUrl: "",
      }),
    /item name/,
  );
});
test("post cleanup rechecks references and acknowledges only after storage succeeds", async () => {
  const calls: string[] = [];
  const client = {
    rpc: async (name: string) => {
      calls.push(name);
      return {
        data: name === "worthit_object_referenced" ? false : null,
        error: null,
      };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          calls.push(paths[0]);
          return { error: null };
        },
      }),
    },
  };
  const job = {
    bucket: "social-media",
    owner_id: "owner",
    path: "owner/reels/file.mp4",
    lease: "lease",
  };
  await cleanPostMedia(client, job);
  assert.deepEqual(calls, [
    "worthit_object_referenced",
    "owner/reels/file.mp4",
    "worthit_finish_post_cleanup",
  ]);
  calls.length = 0;
  client.storage.from = () => ({
    remove: async () => {
      throw Error("network");
    },
  });
  await assert.rejects(() => cleanPostMedia(client, job), /network/);
  assert.ok(!calls.includes("worthit_finish_post_cleanup"));
  await assert.rejects(
    () => cleanPostMedia(client, { ...job, path: "other/file.mp4" }),
    /Invalid cleanup/,
  );
});
test("post cleanup leaves shared referenced objects intact", async () => {
  let removed = false,
    finished = false;
  await cleanPostMedia(
    {
      rpc: async (name: string) => {
        if (name === "worthit_finish_post_cleanup") finished = true;
        return { data: name === "worthit_object_referenced", error: null };
      },
      storage: {
        from: () => ({
          remove: async () => {
            removed = true;
            return { error: null };
          },
        }),
      },
    },
    {
      bucket: "poll-photos",
      owner_id: "owner",
      path: "owner/photo.jpg",
      lease: "one",
    },
  );
  assert.equal(removed, false);
  assert.equal(finished, true);
});

test("editing accepts only metadata and cannot replace ownership, identity or media", () => {
  const values = {
    itemName: " Shirt ",
    priceInr: 500,
    question: " Worth it? ",
    productUrl: "",
    authorId: "someone-else",
    id: "different-post",
    media: [{ kind: "image", value: "replacement" }],
    isDemo: true,
  };
  assert.deepEqual(pollEdit(values), {
    itemName: "Shirt",
    priceInr: 500,
    question: "Worth it?",
    productUrl: "",
  });
});
