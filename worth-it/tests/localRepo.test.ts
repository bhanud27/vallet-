import test from "node:test";
import assert from "node:assert/strict";
import { createLocalRepo, KV } from "../src/lib/localRepo";
import { DEMO_POLLS } from "../src/lib/demoData";
import { AppError } from "../src/lib/types";
import { parsePrice, validateUpdate } from "../src/lib/validation";
import { formatInr } from "../src/lib/format";

function memKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async getItem(k) {
      return data.get(k) ?? null;
    },
    async setItem(k, v) {
      data.set(k, v);
    },
    async removeItem(k) {
      data.delete(k);
    },
  };
}
const mk = (kv = memKV()) =>
  createLocalRepo({
    kv,
    prepareImage: async () => "data:image/jpeg;base64,AAAA",
  });
const photo = { uri: "file:///x.jpg" };
const pollInput = {
  itemName: "Sneakers",
  priceInr: 2499,
  question: "Worth it for daily walking?",
  photo,
};

test("seeds twenty labelled demo polls", async () => {
  const r = mk();
  await r.init();
  const demos = await r.listDemoPolls();
  assert.equal(demos.length, 20);
  assert.ok(demos.every((d) => d.isDemo && d.voteCount > 0));
  assert.deepEqual(
    demos.map((d) => d.priceInr),
    [...demos.map((d) => d.priceInr)].sort((a, b) => a - b),
  );
  assert.equal(
    demos.find((d) => d.id === DEMO_POLLS[2].id)!.updateStatus,
    "bought",
  );
});

test("create poll, guest votes once, author sees vote and reason", async () => {
  const r = mk();
  await r.init();
  const poll = await r.createPoll(pollInput);
  assert.equal((await r.listMyPolls()).length, 1);
  assert.equal((await r.getPollView(poll.id))!.isAuthor, true);

  // author cannot vote on own poll
  await assert.rejects(
    r.castVote(poll.id, { choice: "wait", reason: "", ownsItem: false }),
    (e: AppError) => e.code === "author_cannot_vote",
  );

  await r.demoTools!.actAsNewGuest();
  await r.castVote(poll.id, {
    choice: "wait",
    reason: "  Sale in 2 weeks  ",
    ownsItem: true,
  });
  await assert.rejects(
    r.castVote(poll.id, { choice: "buy", reason: "", ownsItem: false }),
    (e: AppError) => e.code === "already_voted",
  );

  const guestView = (await r.getPollView(poll.id))!;
  assert.equal(guestView.isAuthor, false);
  assert.equal(guestView.myChoice, "wait");

  await r.demoTools!.backToMyIdentity();
  const view = (await r.getPollView(poll.id))!;
  assert.equal(view.votes.length, 1);
  assert.equal(view.votes[0].reason, "Sale in 2 weeks");
  assert.equal(view.votes[0].ownsItem, true);
});

test("only the author can post a purchase update; visitors can read it", async () => {
  const r = mk();
  await r.init();
  const poll = await r.createPoll(pollInput);
  const upd = {
    status: "bought" as const,
    pricePaidInr: 2199,
    review: "Comfy",
    storeUrl: "https://example.com/x",
    isAffiliate: true,
  };

  await r.demoTools!.actAsNewGuest();
  await assert.rejects(
    r.savePurchaseUpdate(poll.id, upd),
    (e: AppError) => e.code === "not_author",
  );

  await r.demoTools!.backToMyIdentity();
  const saved = await r.savePurchaseUpdate(poll.id, upd);
  assert.equal(saved.pricePaidInr, 2199);
  assert.equal(saved.isAffiliate, true);

  await r.demoTools!.actAsNewGuest();
  const visitor = (await r.getPollView(poll.id))!;
  assert.equal(visitor.update!.review, "Comfy");
  assert.equal(visitor.isAuthor, false);
});

test("demo polls cannot be edited, but can be voted on locally", async () => {
  const r = mk();
  await r.init();
  const [d] = await r.listDemoPolls();
  await assert.rejects(
    r.savePurchaseUpdate(d.id, {
      status: "passed",
      pricePaidInr: null,
      review: "",
      storeUrl: "",
      isAffiliate: false,
    }),
    (e: AppError) => e.code === "demo_readonly" || e.code === "not_author",
  );
  await r.castVote(d.id, { choice: "skip", reason: "test", ownsItem: false });
  assert.equal((await r.getPollView(d.id))!.votes.length, d.voteCount + 1);
});

test("passed updates drop price, review and link", async () => {
  const r = mk();
  await r.init();
  const poll = await r.createPoll(pollInput);
  const u = await r.savePurchaseUpdate(poll.id, {
    status: "passed",
    pricePaidInr: 5,
    review: "x",
    storeUrl: "https://a.b",
    isAffiliate: true,
  });
  assert.deepEqual(
    [u.pricePaidInr, u.review, u.storeUrl, u.isAffiliate],
    [null, null, null, false],
  );
});

test("state persists across repo instances (same device storage)", async () => {
  const kv = memKV();
  const a = mk(kv);
  await a.init();
  const poll = await a.createPoll(pollInput);
  const b = mk(kv);
  await b.init();
  assert.equal((await b.getPollView(poll.id))!.poll.itemName, "Sneakers");
});

test("validation", () => {
  assert.equal(parsePrice("₹2,499"), 2499);
  assert.equal(parsePrice("24.99"), null);
  assert.equal(parsePrice("0"), null);
  assert.throws(() =>
    validateUpdate({
      status: "bought",
      pricePaidInr: 100,
      review: "",
      storeUrl: "javascript:alert(1)",
      isAffiliate: false,
    }),
  );
  assert.throws(() =>
    validateUpdate({
      status: "bought",
      pricePaidInr: 100,
      review: "",
      storeUrl: "",
      isAffiliate: true,
    }),
  );
  assert.equal(formatInr(249900).replace(/\s/g, ""), "₹2,49,900");
});

test("upgrades the old three-product catalog without losing identity, user posts or votes", async () => {
  const kv = memKV();
  const before = mk(kv);
  const session = await before.init();
  const own = await before.createPoll(pollInput);
  const original = DEMO_POLLS[0].id;
  await before.castVote(original, {
    choice: "wait",
    reason: "Keep this vote",
    ownsItem: false,
  });
  await before.setPollStar(original, true);
  const votes = (await before.getPollView(original))!.votes.length;
  const key = "worthit:local:v1";
  const old = JSON.parse(kv.data.get(key)!);
  const retained = new Set(DEMO_POLLS.slice(0, 3).map((poll) => poll.id));
  old.polls = old.polls.filter(
    (poll: { isDemo: boolean; id: string }) =>
      !poll.isDemo || retained.has(poll.id),
  );
  const pollIds = new Set(old.polls.map((poll: { id: string }) => poll.id));
  old.votes = old.votes.filter((vote: { pollId: string }) =>
    pollIds.has(vote.pollId),
  );
  kv.data.set(key, JSON.stringify(old));
  const after = mk(kv);
  assert.deepEqual(await after.init(), session);
  assert.equal((await after.listDemoPolls()).length, 20);
  assert.equal((await after.getPollView(own.id))!.isAuthor, true);
  assert.equal((await after.getPollView(original))!.votes.length, votes);
  assert.equal((await after.getPollExtras([original]))[original].starred, true);
  const persistedVotes = JSON.parse(kv.data.get(key)!).votes.length;
  const again = mk(kv);
  await again.init();
  assert.equal(JSON.parse(kv.data.get(key)!).votes.length, persistedVotes);
});

test("regular posts reuse publishing, comments/Stars identity and owner lifecycle without poll voting", async () => {
  const r = mk();
  await r.init();
  const input = {
    ...pollInput,
    contentKind: "post" as const,
    priceInr: 0,
    question: "My weekend look",
  };
  const post = await r.createPoll(input);
  assert.equal(post.contentKind, "post");
  assert.equal(post.priceInr, 0);
  assert.equal(
    (await r.listMyPolls()).find((p) => p.id === post.id)?.contentKind,
    "post",
  );
  await r.setPollStar(post.id, true);
  await r.setPollStar(post.id, true);
  assert.equal((await r.getPollExtras([post.id]))[post.id].stars, 1);
  await assert.rejects(
    r.castVote(post.id, { choice: "buy", reason: "", ownsItem: false }),
    /Posts do not have votes/,
  );
  await assert.rejects(
    r.savePurchaseUpdate(post.id, {
      status: "passed",
      pricePaidInr: null,
      review: "",
      storeUrl: "",
      isAffiliate: false,
    }),
    /Posts do not have purchase updates/,
  );
  await r.managePoll(post.id, "edit", {
    ...input,
    question: "New caption",
    productUrl: "",
  });
  assert.equal((await r.getPollView(post.id))?.poll.question, "New caption");
  await r.managePoll(post.id, "archive");
  assert.equal((await r.listMyPolls(true))[0].id, post.id);
  await r.managePoll(post.id, "restore");
  assert.equal((await r.listMyPolls())[0].id, post.id);
  await r.managePoll(post.id, "delete");
  assert.equal(await r.getPollView(post.id), null);
  await assert.rejects(
    r.createPoll({
      ...input,
      photo: undefined,
      productUrl: "https://example.com/item",
    }),
    /Add a photo or video/,
  );
});
