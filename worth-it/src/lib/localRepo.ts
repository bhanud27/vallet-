import { normalizeCreationSpec } from "./creationSpec";
import { normalizeProductDetails } from "./productDetails";
import { postAction, pollEdit } from "./postEdits";
import { DEMO_POLLS } from "./demoData";
import {
  AppError,
  DecisionNotification,
  NewPollMedia,
  Poll,
  PollExtras,
  PollMedia,
  PollSummary,
  PollView,
  PurchaseUpdate,
  Repo,
  Session,
  VoteEntry,
} from "./types";
import {
  normaliseUpdate,
  canonicalPollProductUrl,
  validatePoll,
  validateUpdate,
  validateVote,
} from "./validation";

export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface LocalDeps {
  kv: KV;
  /** Turns a picked photo into a small data URI so it can live in local storage. */
  prepareImage(photo: { uri: string; mimeType?: string }): Promise<string>;
  storeMedia?(id: string, item: NewPollMedia): Promise<void>;
  removeMedia?(id: string, kind: PollMedia["kind"]): Promise<void>;
  now?: () => number;
  uuid?: () => string;
}

interface StoredPoll extends Omit<Poll, "authorId"> {
  authorId: string | null;
  productUrl?: string | null;
}
interface StoredVote extends VoteEntry {
  pollId: string;
  voterId: string;
}
interface State {
  v: 1;
  home: string; // the identity that owns polls created on this device
  me: string; // identity currently acting (changes with "Act as a new guest")
  polls: StoredPoll[];
  votes: StoredVote[];
  updates: Record<string, PurchaseUpdate>;
  stars?: Record<string, string[]>;
}

const KEY = "worthit:local:v1";

function defaultUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function createLocalRepo(deps: LocalDeps): Repo {
  const now = deps.now ?? Date.now;
  const uuid = deps.uuid ?? defaultUuid;
  let cache: State | null = null;

  const iso = (ms: number) => new Date(ms).toISOString();

  function seed(): State {
    const home = uuid();
    const t = now();
    const state: State = {
      v: 1,
      home,
      me: home,
      polls: [],
      votes: [],
      updates: {},
    };
    addDemoRows(state, t);
    return state;
  }

  function addDemoRows(state: State, t: number): boolean {
    let changed = false;
    for (const d of DEMO_POLLS) {
      const existing = state.polls.find((poll) => poll.id === d.id);
      if (existing) {
        if (existing.isDemo && !existing.category && d.category) {
          existing.category = d.category;
          changed = true;
        }
        continue;
      }
      changed = true;
      state.polls.push({
        id: d.id,
        authorId: null,
        itemName: d.itemName,
        priceInr: d.priceInr,
        question: d.question,
        category: d.category,
        imageUrl: null,
        demoImage: d.demoImage,
        isDemo: true,
        createdAt: iso(t - d.hoursAgo * 3600_000),
      });
      d.votes.forEach((v, i) =>
        state.votes.push({
          id: uuid(),
          pollId: d.id,
          voterId: `demo-voter-${d.id}-${i}`,
          choice: v.choice,
          reason: v.reason,
          ownsItem: v.owns,
          createdAt: iso(t - v.minsAgo * 60_000),
        }),
      );
      if (d.update)
        state.updates[d.id] = { ...d.update, updatedAt: iso(t - 2 * 3600_000) };
    }
    return changed;
  }

  async function load(): Promise<State> {
    if (cache) return cache;
    const raw = await deps.kv.getItem(KEY);
    if (raw) {
      let parsed: State | undefined;
      try {
        parsed = JSON.parse(raw) as State;
      } catch {
        /* Preserve the existing recovery behavior for malformed storage. */
      }
      if (parsed?.v === 1) {
        cache = parsed;
        if (addDemoRows(parsed, now())) await save();
        return cache;
      }
    }
    cache = seed();
    await save();
    return cache;
  }

  async function save() {
    if (!cache) return;
    try {
      await deps.kv.setItem(KEY, JSON.stringify(cache));
    } catch {
      throw new AppError(
        "unknown",
        "Could not save on this device. Browser storage may be full or blocked.",
      );
    }
  }

  const sessionOf = (s: State): Session => ({
    userId: s.me,
    isGuest: true,
    email: null,
  });
  const cleanup = (media: PollMedia[]) =>
    Promise.allSettled(
      media.map((item) => deps.removeMedia?.(item.value, item.kind)),
    );
  function extras(s: State, poll: StoredPoll): PollExtras {
    const people = s.stars?.[poll.id] ?? [];
    return {
      productUrl: poll.productUrl ?? null,
      stars: people.length,
      starred: people.includes(s.me),
    };
  }
  const summary = (s: State, p: StoredPoll): PollSummary => {
    const { authorId: _a, ...poll } = p;
    return {
      ...poll,
      voteCount: s.votes.filter((v) => v.pollId === p.id).length,
      updateStatus: s.updates[p.id]?.status ?? null,
    };
  };

  const repo: Repo = {
    mode: "local",
    demoVotingEnabled: true,
    async init() {
      return sessionOf(await load());
    },
    async getSession() {
      return sessionOf(await load());
    },

    async listDemoPolls() {
      const s = await load();
      return s.polls
        .filter((p) => p.isDemo)
        .sort((a, b) => a.priceInr - b.priceInr)
        .map((p) => summary(s, p));
    },
    async listMyPolls(archived = false, before) {
      const s = await load();
      const rows = s.polls
        .filter(
          (p) =>
            p.authorId === s.me &&
            !!p.archivedAt === archived &&
            (!before ||
              (p.archivedAt || "") < before.time ||
              (p.archivedAt === before.time && p.id < before.id)),
        )
        .sort(
          (a, b) =>
            (archived
              ? (b.archivedAt || "").localeCompare(a.archivedAt || "")
              : b.createdAt.localeCompare(a.createdAt)) ||
            b.id.localeCompare(a.id),
        );
      return (archived ? rows.slice(0, 60) : rows).map((p) => summary(s, p));
    },
    async managePoll(id, action, values) {
      postAction(action);
      const s = await load();
      const old = s.polls.find((p) => p.id === id);
      if (!old || old.isDemo || old.authorId !== s.me)
        throw new AppError(
          "not_author",
          "Only the owner can manage this poll.",
        );
      const edited =
        action === "edit"
          ? pollEdit(
              values
                ? { ...values, creationSpec: old.creationSpec }
                : undefined,
              old.contentKind ?? "poll",
            )
          : undefined;
      if (edited && !edited.productUrl && !old.imageUrl && !old.media?.length)
        throw new Error("Keep a product link or photo attached to this poll.");
      const next: State = {
        ...s,
        polls: s.polls.map((p) =>
          p.id !== id
            ? p
            : {
                ...p,
                ...edited,
                archivedAt:
                  action === "archive"
                    ? p.archivedAt || iso(now())
                    : action === "restore"
                      ? undefined
                      : p.archivedAt,
                editedAt: edited ? iso(now()) : p.editedAt,
              },
        ),
      };
      if (action === "delete") {
        next.polls = next.polls.filter((p) => p.id !== id);
        next.votes = s.votes.filter((v) => v.pollId !== id);
        next.updates = { ...s.updates };
        delete next.updates[id];
        next.stars = { ...s.stars };
        delete next.stars[id];
      }
      // Commit only after persistence succeeds, so failed actions do not alter the visible state.
      try {
        await deps.kv.setItem(KEY, JSON.stringify(next));
      } catch {
        throw new Error("Could not save this change on your device.");
      }
      cache = next;
      if (action === "delete") await cleanup(old.media || []);
    },
    async discoverPolls(filters) {
      const s = await load();
      const query = filters.query?.toLowerCase();
      const replies = new Map<string, number>();
      const helpful = new Set<string>();
      for (const vote of s.votes) {
        if (vote.reason?.trim())
          replies.set(vote.pollId, (replies.get(vote.pollId) ?? 0) + 1);
        if (vote.helpful) helpful.add(vote.pollId);
      }
      return s.polls
        .filter(
          (poll) =>
            !poll.archivedAt &&
            (!filters.category || poll.category === filters.category) &&
            (!filters.min || poll.priceInr >= filters.min) &&
            (!filters.max || poll.priceInr <= filters.max) &&
            (!query ||
              poll.itemName.toLowerCase().includes(query) ||
              (poll.contentKind === "post" &&
                poll.question.toLowerCase().includes(query)) ||
              poll.productUrl === filters.query) &&
            (!filters.needsAnswer ||
              (!s.updates[poll.id] && !helpful.has(poll.id))),
        )
        .sort(
          (a, b) =>
            (filters.needsAnswer
              ? (replies.get(a.id) ?? 0) - (replies.get(b.id) ?? 0)
              : 0) || b.createdAt.localeCompare(a.createdAt),
        )
        .slice(0, 50)
        .map((poll) => summary(s, poll));
    },
    async listProductHistory(productUrl, current) {
      const s = await load();
      return s.polls
        .filter(
          (poll) =>
            !poll.isDemo &&
            poll.contentKind !== "post" &&
            !poll.archivedAt &&
            poll.id !== current &&
            (poll.productUrl ?? s.updates[poll.id]?.storeUrl) === productUrl,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12)
        .map((poll) => {
          const update = s.updates[poll.id];
          return {
            id: poll.id,
            itemName: poll.itemName,
            priceInr: poll.priceInr,
            createdAt: poll.createdAt,
            pricePaidInr: update?.pricePaidInr ?? null,
            purchasedAt: update?.purchasedAt ?? update?.updatedAt ?? null,
            status: update?.status ?? null,
          };
        });
    },

    async createPoll(input, onProgress) {
      validatePoll(input);
      const initial = await load();
      const existing = input.requestId
        ? initial.polls.find(
            (p) => p.id === input.requestId && p.authorId === initial.me,
          )
        : undefined;
      if (existing) {
        const { authorId: _author, ...poll } = existing;
        return poll;
      }
      onProgress?.({
        stage: "preparing",
        completed: 0,
        total: input.media?.length || 0,
      });
      let dataUri: string | null = null;
      const media: PollMedia[] = [];
      try {
        const attachments: NewPollMedia[] = input.media?.length
          ? input.media
          : input.photo && deps.storeMedia
            ? [{ kind: "image", file: input.photo }]
            : [];
        if (input.photo && !attachments.length)
          dataUri = await deps.prepareImage(input.photo);
        for (const item of attachments) {
          if (!deps.storeMedia)
            throw new Error("Media storage is unavailable.");
          const id = uuid();
          media.push({
            kind: item.kind,
            value: id,
            device: true,
            sourceUrl: item.sourceUrl,
          });
          await deps.storeMedia(id, item);
        }
      } catch (error) {
        await cleanup(media);
        if (error instanceof AppError) throw error;
        throw new AppError(
          "upload_failed",
          "Could not save a media item. Check the file format and available storage.",
        );
      }
      const s = await load();
      if (s.me !== initial.me) {
        await cleanup(media);
        throw new AppError(
          "not_author",
          "Your account changed. Reopen your own draft to publish.",
        );
      }
      const poll: StoredPoll = {
        contentKind: input.contentKind ?? "poll",
        importSource: input.importSource,
        productDetails: normalizeProductDetails(input.productDetails),
        creationSpec: normalizeCreationSpec(input.creationSpec),
        id: input.requestId || uuid(),
        authorId: s.me,
        itemName: input.itemName.trim(),
        priceInr: input.priceInr,
        category: input.category,
        useCase: input.useCase?.trim(),
        priority: input.priority?.trim(),
        budgetInr: input.budgetInr,
        question: input.question.trim(),
        imageUrl: dataUri,
        demoImage: null,
        isDemo: false,
        createdAt: iso(now()),
        productUrl: input.productUrl ? canonicalPollProductUrl(input.productUrl) : null,
        ...(media.length ? { media } : {}),
      };
      s.polls.push(poll);
      try {
        await save();
      } catch {
        s.polls = s.polls.filter((item) => item.id !== poll.id);
        await cleanup(media);
        throw new AppError(
          "upload_failed",
          "Could not save the poll on this device. Browser storage may be full.",
        );
      }
      onProgress?.({
        stage: "completed",
        completed: media.length,
        total: media.length,
      });
      const { authorId: _a, ...pub } = poll;
      return pub;
    },

    async getPollView(id) {
      const s = await load();
      const p = s.polls.find((x) => x.id === id);
      if (!p || (p.archivedAt && p.authorId !== s.me)) return null;
      const votes = s.votes
        .filter((v) => v.pollId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const mine = votes.find((v) => v.voterId === s.me);
      const { authorId, ...poll } = p;
      return {
        poll,
        votes: votes.map(({ pollId: _p, voterId: _v, ...v }) => v),
        update: s.updates[id] ?? null,
        isAuthor: authorId !== null && authorId === s.me,
        myChoice: mine?.choice ?? null,
        myOption: mine?.optionId ?? null,
        optionSummary: p.creationSpec
          ? {
              total: votes.length,
              counts: Object.fromEntries(
                p.creationSpec.options.map((o) => [
                  o.id,
                  votes.filter((v) => v.optionId === o.id).length,
                ]),
              ),
            }
          : undefined,
      } satisfies PollView;
    },

    async getPollExtras(ids) {
      const s = await load();
      const included = new Set(ids);
      return Object.fromEntries(
        s.polls
          .filter(
            (poll) =>
              included.has(poll.id) &&
              (!poll.archivedAt || poll.authorId === s.me),
          )
          .map((poll) => [poll.id, extras(s, poll)]),
      );
    },

    async setPollStar(id, starred) {
      const s = await load();
      const poll = s.polls.find((item) => item.id === id);
      if (!poll || (poll.archivedAt && poll.authorId !== s.me))
        throw new AppError("not_found", "This poll no longer exists.");
      const stars = (s.stars ??= {});
      const previous = stars[id] ?? [];
      const people = new Set(previous);
      if (starred) people.add(s.me);
      else people.delete(s.me);
      stars[id] = [...people];
      try {
        await save();
      } catch (error) {
        stars[id] = previous;
        throw error;
      }
      return extras(s, poll);
    },

    async castVote(id, input) {
      validateVote(input);
      const s = await load();
      const p = s.polls.find((x) => x.id === id);
      if (!p || (p.archivedAt && p.authorId !== s.me))
        throw new AppError("not_found", "This poll no longer exists.");
      if (
        p.creationSpec &&
        (!input.optionId ||
          !p.creationSpec.options.some((o) => o.id === input.optionId))
      )
        throw new AppError("invalid", "Choose one of this poll’s options.");
      if (!p.creationSpec && input.optionId)
        throw new AppError(
          "invalid",
          "This poll uses its original voting options.",
        );
      if (p.contentKind === "post")
        throw new AppError("invalid", "Posts do not have votes.");
      if (p.authorId === s.me)
        throw new AppError(
          "author_cannot_vote",
          "You created this poll, so you can’t vote on it. Share the link with a friend.",
        );
      if (s.votes.some((v) => v.pollId === id && v.voterId === s.me))
        throw new AppError("already_voted", "You already voted on this poll.");
      s.votes.push({
        id: uuid(),
        pollId: id,
        voterId: s.me,
        choice: input.choice,
        optionId: input.optionId,
        reason: input.reason.trim() || null,
        ownsItem: input.ownsItem,
        createdAt: iso(now()),
      });
      await save();
    },

    async markHelpfulReason(pollId, voteId, helpful) {
      const s = await load();
      if (
        !s.polls.some(
          (poll) =>
            poll.id === pollId && poll.authorId === s.me && !poll.isDemo,
        )
      )
        throw new AppError(
          "not_author",
          "Only the shopper who posted this poll can mark reasons helpful.",
        );
      const vote = s.votes.find(
        (item) =>
          item.id === voteId && item.pollId === pollId && item.reason?.trim(),
      );
      if (!vote) throw new AppError("not_found", "This reply is unavailable.");
      const previous = vote.helpful;
      vote.helpful = helpful;
      try {
        await save();
      } catch (error) {
        vote.helpful = previous;
        throw error;
      }
    },
    async savePurchaseUpdate(id, input) {
      validateUpdate(input);
      const s = await load();
      const p = s.polls.find((x) => x.id === id);
      if (!p || (p.archivedAt && p.authorId !== s.me))
        throw new AppError("not_found", "This poll no longer exists.");
      if (p.isDemo)
        throw new AppError("demo_readonly", "Demo polls can’t be edited.");
      if (p.contentKind === "post")
        throw new AppError("invalid", "Posts do not have purchase updates.");
      if (p.authorId !== s.me)
        throw new AppError(
          "not_author",
          "Only the person who created this poll can post a purchase update.",
        );
      const previous = s.updates[id];
      const u: PurchaseUpdate = {
        ...normaliseUpdate(input),
        updatedAt: iso(now()),
        purchasedAt:
          input.status === "passed"
            ? null
            : (previous?.purchasedAt ??
              (previous?.status === "bought"
                ? previous.updatedAt
                : iso(now()))),
      };
      s.updates[id] = u;
      try {
        await save();
      } catch (error) {
        if (previous) s.updates[id] = previous;
        else delete s.updates[id];
        throw error;
      }
      return u;
    },

    demoTools: {
      async decisionNotifications() {
        const s = await load();
        const votes = new Map(
          s.votes
            .filter((vote) => vote.voterId === s.me)
            .map((vote) => [vote.pollId, vote]),
        );
        return s.polls
          .flatMap((poll): DecisionNotification[] => {
            const update = s.updates[poll.id];
            if (
              poll.isDemo ||
              !update ||
              (poll.archivedAt && poll.authorId !== s.me)
            )
              return [];
            const purchased = Date.parse(
              update.purchasedAt ?? update.updatedAt,
            );
            const reminderAt = purchased + 7 * 86400_000;
            if (
              poll.authorId === s.me &&
              update.status === "bought" &&
              update.wouldBuyAgain == null &&
              now() >= reminderAt
            ) {
              return [
                {
                  id: "reminder:" + poll.id,
                  kind: "after_buy_reminder",
                  target_id: poll.id,
                  username: "Worth It?",
                  detail: poll.itemName,
                  created_at: iso(reminderAt),
                },
              ];
            }
            const vote = votes.get(poll.id);
            if (!vote || update.updatedAt < vote.createdAt) return [];
            const outcome =
              update.status === "returned"
                ? "Returned"
                : update.status === "passed"
                  ? "Passed"
                  : update.wouldBuyAgain != null
                    ? "After-buy verdict"
                    : "Bought";
            return [
              {
                id: "decision:" + poll.id,
                kind: "purchase_update",
                target_id: poll.id,
                username: "The shopper",
                detail: poll.itemName + " · " + outcome,
                created_at: update.updatedAt,
              },
            ];
          })
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 50);
      },
      async actAsNewGuest() {
        const s = await load();
        s.me = uuid();
        await save();
        return sessionOf(s);
      },
      async backToMyIdentity() {
        const s = await load();
        s.me = s.home;
        await save();
        return sessionOf(s);
      },
      async resetAll() {
        const media = (await load()).polls.flatMap((poll) => poll.media ?? []);
        await deps.kv.removeItem(KEY);
        cache = null;
        await cleanup(media);
        return sessionOf(await load());
      },
    },
  };
  return repo;
}
