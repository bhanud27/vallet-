import { pollEdit, postAction, postMutationError } from "./postEdits";
import { demoPollSummaries, demoPollView, isDemoPoll } from "./demoViews";
import { pollRead } from "./pollRead";
import { optionalRpc } from "./backendRpc";
import { measured } from "./diagnostics";
import { mediaDerivatives } from "./mediaDerivatives";
import { uploadMedia } from "./uploads";
import { prepareImage } from "./image";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { publishPoll } from "./publishPoll";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appSession } from "./auth";
import { signMediaPaths } from "./storageUrls";
import {
  AppError,
  Choice,
  NewPollMedia,
  PickedPhoto,
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

const BUCKET = "poll-photos";
interface ExtrasRow {
  id: string;
  product_url: string | null;
  stars: number;
  starred: boolean;
}

interface Deps {
  client: SupabaseClient;
  /** Returns JPEG bytes for the picked photo (resized, EXIF removed). */
  prepareUpload(photo: PickedPhoto): Promise<{ bytes: ArrayBuffer }>;
  prepareVideo(
    video: Extract<NewPollMedia, { kind: "video" }>["file"],
  ): Promise<ArrayBuffer>;
  uuid(): string;
}

export function createSupabaseRepo({
  client,
  prepareUpload,
  prepareVideo,
  uuid,
}: Deps): Repo {
  const toPoll = (r: any): Poll => ({
    contentKind: r.content_type ?? "poll",
    creationSpec: r.creation_spec ?? undefined,
    productDetails: r.product_details ?? undefined,
    archivedAt: r.archived_at ?? undefined,
    editedAt: r.edited_at ?? undefined,
    mediaState: r.media_state,
    id: r.id,
    itemName: r.item_name,
    priceInr: r.price_inr ?? 0,
    question: r.question,
    imageUrl: null,
    demoImage: r.demo_image ?? null,
    isDemo: !!r.is_demo,
    createdAt: r.created_at,
    authorId: r.author_id ?? undefined,
    username: r.username ?? undefined,
    category: r.category ?? undefined,
    useCase: r.use_case ?? undefined,
    priority: r.priority ?? undefined,
    budgetInr: r.budget_inr ?? undefined,
  });
  const toSummary = (r: any): PollSummary => ({
    ...toPoll(r),
    voteCount: Number(r.vote_count ?? 0),
    updateStatus: r.update_status ?? null,
  });
  const toExtras = (r: ExtrasRow): PollExtras => ({
    productUrl: r.product_url,
    stars: Number(r.stars),
    starred: r.starred,
  });
  const toVote = (r: any): VoteEntry => ({
    id: r.id,
    choice: r.choice as Choice | null,
    optionId: r.option_id ?? undefined,
    reason: r.reason,
    ownsItem: !!r.owns_item,
    createdAt: r.created_at,
    helpful: !!r.helpful,
  });
  const toUpdate = (r: any): PurchaseUpdate => ({
    status: r.status,
    pricePaidInr: r.price_paid_inr,
    review: r.review,
    storeUrl: r.store_url,
    isAffiliate: !!r.is_affiliate,
    updatedAt: r.updated_at,
    purchasedAt: r.purchased_at ?? null,
    wouldBuyAgain: r.would_buy_again ?? null,
  });

  function mapError(
    e: any,
    fallback = "Something went wrong. Try again.",
  ): AppError {
    if (e instanceof AppError) return e;
    if (e?.code === "PGRST202" || e?.code === "PGRST204")
      return new AppError(
        "unknown",
        "The latest shopping features are still being set up on the server.",
      );
    const msg: string = e?.message ?? "";
    if (msg.includes("already_voted"))
      return new AppError("already_voted", "You already voted on this poll.");
    if (msg.includes("author_cannot_vote"))
      return new AppError(
        "author_cannot_vote",
        "You created this poll, so you can’t vote on it. Share the link with a friend.",
      );
    if (msg.includes("demo_readonly"))
      return new AppError(
        "demo_readonly",
        "Demo polls are read-only. Create your own poll to try voting.",
      );
    if (msg.includes("not_found"))
      return new AppError("not_found", "This poll no longer exists.");
    if (msg.includes("row-level security") || msg.includes("permission denied"))
      return new AppError(
        "not_author",
        "Only the person who created this poll can do that.",
      );
    if (/fetch|network|Failed to|timeout/i.test(msg))
      return new AppError(
        "network",
        "Can’t reach the server. Check your connection and try again.",
      );
    return new AppError("unknown", msg ? `${fallback} (${msg})` : fallback);
  }

  async function currentSession(): Promise<Session> {
    const { data } = await client.auth.getSession();
    const u = data.session?.user;
    if (!u) throw new AppError("unknown", "Not signed in.");
    return appSession(u);
  }

  async function attachMedia<T extends Poll>(
    polls: T[],
    photoPaths: (string | null)[],
  ): Promise<T[]> {
    if (!polls.length || polls.every((poll) => poll.isDemo)) return polls;
    const { data, error } = await client.rpc("get_poll_media", {
      p_ids: polls.map((poll) => poll.id),
    });
    const rows = (error ? [] : (data ?? [])) as {
      id: string;
      media: PollMedia[];
    }[];
    const derivatives = await mediaDerivatives(
      client,
      polls.map((p) => p.id),
    );
    for (const row of rows)
      row.media = row.media.map((item) => {
        const derived = derivatives.find(
          (d) =>
            d.poll_id === row.id &&
            d.source_path === item.value &&
            d.state === "ready",
        );
        return {
          ...item,
          value: derived?.playback_path || item.value,
          thumbnail:
            item.kind === "video"
              ? derived?.preview_path || item.thumbnail
              : undefined,
        };
      });
    const galleryItems = rows.flatMap((row) => row.media);
    const [photos, videos] = await Promise.all([
      signMediaPaths(client, BUCKET, [
        ...photoPaths,
        ...galleryItems
          .filter((item) => item.kind === "image")
          .map((item) => item.value),
      ]),
      signMediaPaths(
        client,
        "social-media",
        galleryItems
          .filter((item) => item.kind === "video")
          .flatMap((item) => [item.value, item.thumbnail || null]),
      ),
    ]);
    const galleries = new Map(
      rows.map((row) => [
        row.id,
        row.media.flatMap((item) => {
          const value = (item.kind === "image" ? photos : videos).get(
            item.value,
          );
          return value || polls.find((p) => p.id === row.id)?.creationSpec
            ? [
                {
                  ...item,
                  value: value ?? "",
                  thumbnail:
                    item.kind === "video"
                      ? videos.get(item.thumbnail || "")
                      : undefined,
                },
              ]
            : [];
        }),
      ]),
    );
    return polls.map((poll, index) => ({
      ...poll,
      imageUrl: photos.get(photoPaths[index] ?? "") ?? null,
      media: galleries.get(poll.id),
    }));
  }

  return {
    mode: "supabase",
    demoVotingEnabled: false,

    async init() {
      try {
        const { data } = await client.auth.getSession();
        if (!data.session) {
          if (process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY)
            throw new Error("Verify you are human to start a guest session.");
          const { error } = await client.auth.signInAnonymously();
          if (error) {
            if (/anonymous/i.test(error.message))
              throw new AppError(
                "unknown",
                "Guest sign-in is turned off in your Supabase project. Enable Authentication → Sign In / Providers → Allow anonymous sign-ins.",
              );
            throw error;
          }
        }
        return await currentSession();
      } catch (e) {
        throw mapError(e, "Could not start a session.");
      }
    },
    getSession: currentSession,

    async listDemoPolls() {
      return demoPollSummaries();
    },
    async listMyPolls(archived = false, before) {
      const { data, error } = archived
        ? await client.rpc("worthit_archived_posts", {
            p_kind: "poll",
            p_before: before?.time ?? null,
            p_before_id: before?.id ?? null,
          })
        : await client.rpc("list_polls", { p_demo: false });
      if (error)
        throw archived
          ? postMutationError(error)
          : mapError(error, "Could not load your polls.");
      return attachMedia(
        (data as any[]).map(toSummary),
        (data as any[]).map((row) => row.image_path),
      );
    },
    async managePoll(id, action, values) {
      postAction(action);
      const p_values = action === "edit" ? pollEdit(values) : {};
      const { error } = await client.rpc("worthit_manage_post", {
        p_kind: "poll",
        p_id: id,
        p_action: action,
        p_values,
      });
      if (error) throw postMutationError(error);
    },
    async listSocialPolls(author) {
      const { data, error } = await client.rpc("list_social_polls", {
        p_author: author ?? null,
      });
      if (error?.code === "PGRST202" && !author) return []; // Allow the existing feed during migration rollout.
      if (error) throw mapError(error, "Could not load posts.");
      return attachMedia(
        (data as any[]).map(toSummary),
        (data as any[]).map((row) => row.image_path),
      );
    },
    async discoverPolls(filters) {
      const { data, error } = await client.rpc("discover_shopping_polls", {
        p_category: filters.category ?? null,
        p_min: filters.min ?? null,
        p_max: filters.max ?? null,
        p_query: filters.query ?? null,
        p_needs_answer: filters.needsAnswer,
      });
      if (error)
        throw mapError(error, "Could not discover shopping questions.");
      return attachMedia(
        (data as any[]).map(toSummary),
        (data as any[]).map((row) => row.image_path),
      );
    },
    async listProductHistory(productUrl, current) {
      const { data, error } = await client.rpc("list_product_history", {
        p_url: productUrl,
        p_current: current ?? null,
      });
      if (error) throw mapError(error, "Could not load related polls.");
      return (data as any[]).map((r) => ({
        archivedAt: r.archived_at ?? undefined,
        editedAt: r.edited_at ?? undefined,
        mediaState: r.media_state,
        id: r.id,
        itemName: r.item_name,
        priceInr: r.price_inr,
        createdAt: r.created_at,
        pricePaidInr: r.price_paid_inr,
        purchasedAt: r.purchased_at,
        status: r.status,
      }));
    },

    async createPoll(input, onProgress) {
      validatePoll(input);
      const session = await currentSession();
      try {
        const data = await measured("publish", () =>
          publishPoll(
            client,
            {
              ...input,
              productUrl: input.productUrl
                ? canonicalPollProductUrl(input.productUrl)!
                : undefined,
            },
            session.userId,
            input.requestId || uuid(),
            async (item) =>
              item.kind === "video"
                ? prepareVideo(item.file)
                : (await prepareUpload(item.file)).bytes,
            onProgress,
            async (item) => {
              const preview = await prepareImage(item.file.uri, 720, false);
              try {
                return await (Platform.OS === "web"
                  ? (await fetch(preview.uri)).arrayBuffer()
                  : new File(preview.uri).arrayBuffer());
              } finally {
                if (Platform.OS === "web") {
                  if (preview.uri.startsWith("blob:"))
                    URL.revokeObjectURL(preview.uri);
                } else {
                  const file = new File(preview.uri);
                  if (file.exists) file.delete();
                }
              }
            },
            (bucket, path, bytes, type, onBytes) =>
              uploadMedia(
                client,
                bucket,
                path,
                bytes,
                type,
                input.signal,
                onBytes,
              ),
          ),
        );
        return toPoll({
          ...data,
          content_type: input.contentKind ?? "poll",
          creation_spec: input.creationSpec,
          product_details: input.productDetails,
        });
      } catch (error) {
        throw mapError(
          error,
          "Could not confirm publication. Your draft is kept. Retry to check the same post safely.",
        );
      }
    },

    async getPollView(id) {
      if (isDemoPoll(id)) return demoPollView(id);
      let data;
      try {
        data = await pollRead(client, id);
      } catch (error) {
        throw mapError(error);
      }
      if (!data) return null;
      const d = data as any;
      let modern: any;
      if (d.poll?.creation_spec && d.poll.content_type !== "post") {
        const r = await client.rpc("worthit_option_results", { p_id: id });
        if (r.error) throw mapError(r.error);
        modern = r.data;
      }
      const [poll] = await attachMedia([toPoll(d.poll)], [d.poll.image_path]);
      return {
        poll,
        myOption: modern?.my_option ?? null,
        optionSummary: modern
          ? { counts: modern.counts, total: modern.total }
          : undefined,
        summary: d.summary,
        votes: (d.votes as any[]).map(toVote),
        update: d.update ? toUpdate(d.update) : null,
        isAuthor: !!d.is_author,
        myChoice: (d.my_choice as Choice) ?? null,
      } satisfies PollView;
    },

    async getVoteReasons(id, before, beforeId) {
      try {
        const result = await optionalRpc<any>(client, "worthit_poll_page", {
          p_id: id,
          p_before: before,
          p_before_id: beforeId,
        });
        return result.available ? (result.data?.votes || []).map(toVote) : [];
      } catch (error) {
        throw mapError(error);
      }
    },
    async getPollExtras(ids) {
      const demos = Object.fromEntries(
        ids
          .filter(isDemoPoll)
          .map((id) => [id, { productUrl: null, stars: 0, starred: false }]),
      );
      ids = ids.filter((id) => !isDemoPoll(id));
      if (!ids.length) return demos;
      const { data, error } = await client.rpc("get_poll_extras", {
        p_ids: ids,
      });
      if (error) throw mapError(error, "Could not load stars.");
      return {
        ...demos,
        ...Object.fromEntries(
          (data as ExtrasRow[]).map((row) => [row.id, toExtras(row)]),
        ),
      };
    },

    async setPollStar(id, starred) {
      if (isDemoPoll(id))
        throw new AppError(
          "demo_readonly",
          "Sample products are read-only in a connected account.",
        );
      const { data, error } = await client.rpc("set_poll_star", {
        p_id: id,
        p_starred: starred,
      });
      if (error) throw mapError(error, "Could not update your star.");
      return toExtras(data as ExtrasRow);
    },

    async castVote(id, input) {
      if (isDemoPoll(id))
        throw new AppError(
          "demo_readonly",
          "Sample products are read-only in a connected account.",
        );
      validateVote(input);
      const { error } = await measured(
        "vote",
        async () =>
          await client.rpc(
            input.optionId ? "worthit_cast_option_vote" : "cast_vote",
            input.optionId
              ? {
                  p_id: id,
                  p_option: input.optionId,
                  p_reason: input.reason.trim() || null,
                  p_owns: input.ownsItem,
                }
              : {
                  p_id: id,
                  p_choice: input.choice,
                  p_reason: input.reason.trim() || null,
                  p_owns: input.ownsItem,
                },
          ),
      );
      if (error) throw mapError(error, "Could not submit your vote.");
    },
    async markHelpfulReason(pollId, voteId, helpful) {
      if (isDemoPoll(pollId))
        throw new AppError(
          "demo_readonly",
          "Sample products are read-only in a connected account.",
        );
      const { error } = await client.rpc("mark_poll_reason_helpful", {
        p_poll: pollId,
        p_vote: voteId,
        p_helpful: helpful,
      });
      if (error) throw mapError(error, "Could not update this reason.");
    },

    async savePurchaseUpdate(id, input) {
      if (isDemoPoll(id))
        throw new AppError(
          "demo_readonly",
          "Sample products are read-only in a connected account.",
        );
      validateUpdate(input);
      const n = normaliseUpdate(input);
      const fields = {
        poll_id: id,
        status: n.status,
        price_paid_inr: n.pricePaidInr,
        review: n.review,
        store_url: n.storeUrl,
        is_affiliate: n.isAffiliate,
        updated_at: new Date().toISOString(),
      };
      const save = (
        record: typeof fields & { would_buy_again?: boolean | null },
      ) =>
        client
          .from("purchase_updates")
          .upsert(record, { onConflict: "poll_id" })
          .select()
          .single();
      let result = await save({
        ...fields,
        ...(n.wouldBuyAgain !== undefined ||
        n.status === "returned" ||
        n.status === "passed"
          ? { would_buy_again: n.wouldBuyAgain ?? null }
          : {}),
      });
      if (n.status === "passed" && result.error?.code === "PGRST204")
        result = await save(fields);
      if (result.error)
        throw mapError(result.error, "Could not save the update.");
      return toUpdate(result.data);
    },
  };
}
