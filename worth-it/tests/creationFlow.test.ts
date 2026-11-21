import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCreationSpec,
  optionResults,
  type CreationSpec,
} from "../src/lib/creationSpec";
import { createLocalRepo } from "../src/lib/localRepo";
const spec = (): CreationSpec => ({
  version: 1,
  subtype: "compare",
  products: [
    {
      id: "a",
      name: "Shirt A",
      url: "https://www.myntra.com/a",
      media: [],
      details: { brand: "A", price: 20, currency: "USD" },
    },
    { id: "b", name: "Shirt B", url: "https://www.ajio.com/b", media: [] },
  ],
  options: [
    { id: "a", label: "Shirt A", productId: "a" },
    { id: "b", label: "Shirt B", productId: "b" },
  ],
});
test("comparison validation preserves independent metadata and rejects invalid options", () => {
  assert.deepEqual(normalizeCreationSpec(spec()), spec());
  for (const change of [
    (s: CreationSpec) => {
      s.products.pop();
    },
    (s: CreationSpec) => {
      s.options[0].productId = "absent";
    },
    (s: CreationSpec) => {
      s.options[1].label = "Shirt A";
    },
    (s: CreationSpec) => {
      s.products[1].url = "http://127.0.0.1";
    },
    (s: CreationSpec) => {
      s.products[0].media = [0];
      s.products[1].media = [0];
    },
  ]) {
    const s = spec();
    change(s);
    assert.throws(() => normalizeCreationSpec(s));
  }
});
test("opinion options support 2–4 unique labels without inventing prices", () => {
  const s: CreationSpec = {
    version: 1,
    subtype: "opinion",
    products: [{ id: "shirt", name: "Shirt", media: [] }],
    options: [
      { id: "yes", label: "Worth it" },
      { id: "no", label: "Not worth it" },
    ],
  };
  assert.equal(normalizeCreationSpec(s)?.products[0].details, undefined);
  assert.throws(() => normalizeCreationSpec({ ...s, options: [s.options[0]] }));
  assert.throws(() =>
    normalizeCreationSpec({
      ...s,
      options: [s.options[0], { id: "other", label: " Worth IT " }],
    }),
  );
});
test("local publishing and product voting survive reload, enforce ownership and one vote", async () => {
  const data = new Map<string, string>(),
    kv = {
      getItem: async (k: string) => data.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        data.set(k, v);
      },
      removeItem: async (k: string) => {
        data.delete(k);
      },
    };
  const make = () => createLocalRepo({ kv, prepareImage: async () => "" });
  const repo = make();
  await repo.init();
  const input = {
    itemName: "Shirt A",
    priceInr: 0,
    question: "Which one should I buy?",
    productUrl: "https://www.myntra.com/a",
    creationSpec: spec(),
  };
  const poll = await repo.createPoll(input);
  assert.equal(poll.priceInr, 0);
  await assert.rejects(
    repo.castVote(poll.id, {
      choice: null,
      optionId: "a",
      reason: "",
      ownsItem: false,
    }),
  );
  await repo.demoTools!.actAsNewGuest();
  await assert.rejects(
    repo.castVote(poll.id, {
      choice: null,
      optionId: "bad",
      reason: "",
      ownsItem: false,
    }),
  );
  await repo.castVote(poll.id, {
    choice: null,
    optionId: "b",
    reason: "",
    ownsItem: false,
  });
  await assert.rejects(
    repo.castVote(poll.id, {
      choice: null,
      optionId: "a",
      reason: "",
      ownsItem: false,
    }),
  );
  const other = make();
  await other.init();
  const view = await other.getPollView(poll.id);
  assert.equal(view?.myOption, "b");
  assert.equal(view?.optionSummary?.counts.b, 1);
  assert.equal(optionResults(spec(), view!.votes)[1].percent, 100);
});
