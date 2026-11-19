import { DEMO_POLLS } from './demoData';
import {
  AppError, NewPollMedia, Poll, PollExtras, PollMedia, PollSummary, PollView, PurchaseUpdate, Repo, Session, VoteEntry,
} from './types';
import { normaliseUpdate, parseProductUrl, validatePoll, validateUpdate, validateVote } from './validation';

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
  removeMedia?(id: string, kind: PollMedia['kind']): Promise<void>;
  now?: () => number;
  uuid?: () => string;
}

interface StoredPoll extends Poll { authorId: string | null; productUrl?: string | null }
interface StoredVote extends VoteEntry { pollId: string; voterId: string }
interface State {
  v: 1;
  home: string; // the identity that owns polls created on this device
  me: string;   // identity currently acting (changes with "Act as a new guest")
  polls: StoredPoll[];
  votes: StoredVote[];
  updates: Record<string, PurchaseUpdate>;
  stars?: Record<string, string[]>;
}

const KEY = 'worthit:local:v1';

function defaultUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
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
    const state: State = { v: 1, home, me: home, polls: [], votes: [], updates: {} };
    for (const d of DEMO_POLLS) {
      state.polls.push({
        id: d.id, authorId: null, itemName: d.itemName, priceInr: d.priceInr, question: d.question,
        imageUrl: null, demoImage: d.demoImage, isDemo: true, createdAt: iso(t - d.hoursAgo * 3600_000),
      });
      d.votes.forEach((v, i) =>
        state.votes.push({
          id: uuid(), pollId: d.id, voterId: `demo-voter-${d.id}-${i}`, choice: v.choice, reason: v.reason,
          ownsItem: v.owns, createdAt: iso(t - v.minsAgo * 60_000),
        }),
      );
      if (d.update) state.updates[d.id] = { ...d.update, updatedAt: iso(t - 2 * 3600_000) };
    }
    return state;
  }

  async function load(): Promise<State> {
    if (cache) return cache;
    const raw = await deps.kv.getItem(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as State;
        if (parsed.v === 1) return (cache = parsed);
      } catch { /* fall through and reseed */ }
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
      throw new AppError('unknown', 'Could not save on this device. Browser storage may be full or blocked.');
    }
  }

  const sessionOf = (s: State): Session => ({ userId: s.me, isGuest: true, email: null });
  const cleanup = (media: PollMedia[]) => Promise.allSettled(media.map((item) => deps.removeMedia?.(item.value, item.kind)));
  function extras(s: State, poll: StoredPoll): PollExtras {
    const people = s.stars?.[poll.id] ?? [];
    return { productUrl: poll.productUrl ?? null, stars: people.length, starred: people.includes(s.me) };
  }
  const summary = (s: State, p: StoredPoll): PollSummary => {
    const { authorId: _a, ...poll } = p;
    return { ...poll, voteCount: s.votes.filter((v) => v.pollId === p.id).length, updateStatus: s.updates[p.id]?.status ?? null };
  };

  const repo: Repo = {
    mode: 'local',
    demoVotingEnabled: true,
    async init() { return sessionOf(await load()); },
    async getSession() { return sessionOf(await load()); },

    async listDemoPolls() {
      const s = await load();
      return s.polls.filter((p) => p.isDemo).sort((a, b) => a.priceInr - b.priceInr).map((p) => summary(s, p));
    },
    async listMyPolls() {
      const s = await load();
      return s.polls.filter((p) => p.authorId === s.me).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => summary(s, p));
    },

    async createPoll(input) {
      validatePoll(input);
      let dataUri: string | null = null;
      const media: PollMedia[] = [];
      try {
        if (input.photo) dataUri = await deps.prepareImage(input.photo);
        for (const item of input.media ?? []) {
          if (!deps.storeMedia) throw new Error('Media storage is unavailable.');
          const id = uuid();
          media.push({ kind: item.kind, value: id, device: true, sourceUrl: item.sourceUrl });
          await deps.storeMedia(id, item);
        }
      } catch {
        await cleanup(media);
        throw new AppError('upload_failed', 'Could not save a media item. Check the file format and available storage.');
      }
      const s = await load();
      const poll: StoredPoll = {
        id: uuid(), authorId: s.me, itemName: input.itemName.trim(), priceInr: input.priceInr,
        question: input.question.trim(), imageUrl: dataUri, demoImage: null, isDemo: false, createdAt: iso(now()),
        productUrl: input.productUrl ? parseProductUrl(input.productUrl) : null,
        ...(media.length ? { media } : {}),
      };
      s.polls.push(poll);
      try {
        await save();
      } catch {
        s.polls = s.polls.filter((item) => item.id !== poll.id);
        await cleanup(media);
        throw new AppError('upload_failed', 'Could not save the poll on this device. Browser storage may be full.');
      }
      const { authorId: _a, ...pub } = poll;
      return pub;
    },

    async getPollView(id) {
      const s = await load();
      const p = s.polls.find((x) => x.id === id);
      if (!p) return null;
      const votes = s.votes.filter((v) => v.pollId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const mine = votes.find((v) => v.voterId === s.me);
      const { authorId, ...poll } = p;
      return {
        poll,
        votes: votes.map(({ pollId: _p, voterId: _v, ...v }) => v),
        update: s.updates[id] ?? null,
        isAuthor: authorId !== null && authorId === s.me,
        myChoice: mine?.choice ?? null,
      } satisfies PollView;
    },

    async getPollExtras(ids) {
      const s = await load();
      const included = new Set(ids);
      return Object.fromEntries(s.polls.filter((poll) => included.has(poll.id)).map((poll) => [poll.id, extras(s, poll)]));
    },

    async setPollStar(id, starred) {
      const s = await load();
      const poll = s.polls.find((item) => item.id === id);
      if (!poll) throw new AppError('not_found', 'This poll no longer exists.');
      const stars = s.stars ??= {};
      const previous = stars[id] ?? [];
      const people = new Set(previous);
      if (starred) people.add(s.me);
      else people.delete(s.me);
      stars[id] = [...people];
      try { await save(); } catch (error) { stars[id] = previous; throw error; }
      return extras(s, poll);
    },

    async castVote(id, input) {
      validateVote(input);
      const s = await load();
      const p = s.polls.find((x) => x.id === id);
      if (!p) throw new AppError('not_found', 'This poll no longer exists.');
      if (p.authorId === s.me) throw new AppError('author_cannot_vote', 'You created this poll, so you can’t vote on it. Share the link with a friend.');
      if (s.votes.some((v) => v.pollId === id && v.voterId === s.me))
        throw new AppError('already_voted', 'You already voted on this poll.');
      s.votes.push({
        id: uuid(), pollId: id, voterId: s.me, choice: input.choice,
        reason: input.reason.trim() || null, ownsItem: input.ownsItem, createdAt: iso(now()),
      });
      await save();
    },

    async savePurchaseUpdate(id, input) {
      validateUpdate(input);
      const s = await load();
      const p = s.polls.find((x) => x.id === id);
      if (!p) throw new AppError('not_found', 'This poll no longer exists.');
      if (p.isDemo) throw new AppError('demo_readonly', 'Demo polls can’t be edited.');
      if (p.authorId !== s.me) throw new AppError('not_author', 'Only the person who created this poll can post a purchase update.');
      const u: PurchaseUpdate = { ...normaliseUpdate(input), updatedAt: iso(now()) };
      s.updates[id] = u;
      await save();
      return u;
    },

    demoTools: {
      async actAsNewGuest() { const s = await load(); s.me = uuid(); await save(); return sessionOf(s); },
      async backToMyIdentity() { const s = await load(); s.me = s.home; await save(); return sessionOf(s); },
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
