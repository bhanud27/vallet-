import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AppError, Choice, Poll, PollSummary, PollView, PurchaseUpdate, Repo, Session, VoteEntry,
} from './types';
import { normaliseUpdate, validatePoll, validateUpdate, validateVote } from './validation';

const BUCKET = 'poll-photos';

interface Deps {
  client: SupabaseClient;
  /** Returns JPEG bytes for the picked photo (resized, EXIF removed). */
  prepareUpload(photo: { uri: string }): Promise<{ bytes: ArrayBuffer }>;
  uuid(): string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function createSupabaseRepo({ client, prepareUpload, uuid }: Deps): Repo {
  const photoUrl = (path: string | null) => (path ? client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null);

  const toPoll = (r: any): Poll => ({
    id: r.id, itemName: r.item_name, priceInr: r.price_inr, question: r.question,
    imageUrl: photoUrl(r.image_path), demoImage: r.demo_image ?? null, isDemo: !!r.is_demo, createdAt: r.created_at,
  });
  const toSummary = (r: any): PollSummary => ({ ...toPoll(r), voteCount: Number(r.vote_count ?? 0), updateStatus: r.update_status ?? null });
  const toVote = (r: any): VoteEntry => ({ id: r.id, choice: r.choice as Choice, reason: r.reason, ownsItem: !!r.owns_item, createdAt: r.created_at });
  const toUpdate = (r: any): PurchaseUpdate => ({
    status: r.status, pricePaidInr: r.price_paid_inr, review: r.review, storeUrl: r.store_url,
    isAffiliate: !!r.is_affiliate, updatedAt: r.updated_at,
  });

  function mapError(e: any, fallback = 'Something went wrong. Try again.'): AppError {
    if (e instanceof AppError) return e;
    const msg: string = e?.message ?? '';
    if (msg.includes('already_voted')) return new AppError('already_voted', 'You already voted on this poll.');
    if (msg.includes('author_cannot_vote')) return new AppError('author_cannot_vote', 'You created this poll, so you can’t vote on it. Share the link with a friend.');
    if (msg.includes('demo_readonly')) return new AppError('demo_readonly', 'Demo polls are read-only. Create your own poll to try voting.');
    if (msg.includes('not_found')) return new AppError('not_found', 'This poll no longer exists.');
    if (msg.includes('row-level security') || msg.includes('permission denied')) return new AppError('not_author', 'Only the person who created this poll can do that.');
    if (/fetch|network|Failed to|timeout/i.test(msg)) return new AppError('network', 'Can’t reach the server. Check your connection and try again.');
    return new AppError('unknown', msg ? `${fallback} (${msg})` : fallback);
  }

  async function currentSession(): Promise<Session> {
    const { data } = await client.auth.getSession();
    const u = data.session?.user;
    if (!u) throw new AppError('unknown', 'Not signed in.');
    return { userId: u.id, isGuest: !!u.is_anonymous, email: u.email ?? null };
  }

  return {
    mode: 'supabase',
    demoVotingEnabled: false,

    async init() {
      try {
        const { data } = await client.auth.getSession();
        if (!data.session) {
          const { error } = await client.auth.signInAnonymously();
          if (error) {
            if (/anonymous/i.test(error.message))
              throw new AppError('unknown', 'Guest sign-in is turned off in your Supabase project. Enable Authentication → Sign In / Providers → Allow anonymous sign-ins.');
            throw error;
          }
        }
        return await currentSession();
      } catch (e) { throw mapError(e, 'Could not start a session.'); }
    },
    getSession: currentSession,

    async listDemoPolls() {
      const { data, error } = await client.rpc('list_polls', { p_demo: true });
      if (error) throw mapError(error);
      return (data as any[]).map(toSummary);
    },
    async listMyPolls() {
      const { data, error } = await client.rpc('list_polls', { p_demo: false });
      if (error) throw mapError(error);
      return (data as any[]).map(toSummary);
    },

    async createPoll(input) {
      validatePoll(input);
      const session = await currentSession();
      const path = `${session.userId}/${uuid()}.jpg`;
      try {
        const { bytes } = await prepareUpload(input.photo);
        const { error } = await client.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
        if (error) throw error;
      } catch (e: any) {
        throw new AppError('upload_failed', `Photo upload failed. Nothing was published. Check your connection and try again.${e?.message ? ` (${e.message})` : ''}`);
      }
      const { data, error } = await client.from('polls').insert({
        author_id: session.userId, item_name: input.itemName.trim(), price_inr: input.priceInr,
        question: input.question.trim(), image_path: path,
      }).select('id, item_name, price_inr, question, image_path, demo_image, is_demo, created_at').single();
      if (error) {
        await client.storage.from(BUCKET).remove([path]); // best effort: don't leave an orphaned photo behind
        throw mapError(error, 'Could not publish the poll.');
      }
      return toPoll(data);
    },

    async getPollView(id) {
      const { data, error } = await client.rpc('get_poll_view', { p_id: id });
      if (error) throw mapError(error);
      if (!data) return null;
      const d = data as any;
      return {
        poll: toPoll(d.poll), votes: (d.votes as any[]).map(toVote),
        update: d.update ? toUpdate(d.update) : null, isAuthor: !!d.is_author, myChoice: (d.my_choice as Choice) ?? null,
      } satisfies PollView;
    },

    async castVote(id, input) {
      validateVote(input);
      const { error } = await client.rpc('cast_vote', {
        p_id: id, p_choice: input.choice, p_reason: input.reason.trim() || null, p_owns: input.ownsItem,
      });
      if (error) throw mapError(error, 'Could not submit your vote.');
    },

    async savePurchaseUpdate(id, input) {
      validateUpdate(input);
      const n = normaliseUpdate(input);
      const { data, error } = await client.from('purchase_updates').upsert({
        poll_id: id, status: n.status, price_paid_inr: n.pricePaidInr, review: n.review,
        store_url: n.storeUrl, is_affiliate: n.isAffiliate, updated_at: new Date().toISOString(),
      }, { onConflict: 'poll_id' }).select().single();
      if (error) throw mapError(error, 'Could not save the update.');
      return toUpdate(data);
    },
  };
}
