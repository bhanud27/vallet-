import { feedSource } from "./feedSource";
import { readableRpcError } from "./backendRpc";
import { measured } from "./diagnostics";
import { mediaDerivatives } from "./mediaDerivatives";
import { supabase } from "./supabase";
import { repo } from "./repo";
import { socialRepo, type Reel } from "./socialRepo";
import { signMediaPaths } from "./storageUrls";
import { createQueryCache } from "./queryCache";
import type { PollSummary, PollMedia } from "./types";
export type FeedItem =
  { kind: "poll"; poll: PollSummary } | { kind: "reel"; reel: Reel };
export type FeedCursor = { time: string; id: string };
export type FeedSnapshot = {
  fetchedAt: number;
  items: FeedItem[];
  cursor?: FeedCursor;
  hasMore: boolean;
  extras: Record<string, import("./types").PollExtras>;
};
export const feedCache = createQueryCache<FeedSnapshot>(20);
export const feedTime = (item: FeedItem) =>
  item.kind === "poll" ? item.poll.createdAt : item.reel.createdAt;
export const feedId = (item: FeedItem) =>
  item.kind === "poll" ? item.poll.id : item.reel.id;
type Row = { kind: "poll" | "reel"; post: Record<string, any> };
async function loadFeedInner(
  viewer: string,
  cursor?: FeedCursor,
): Promise<FeedItem[]> {
  if (!supabase) {
    if (cursor) return [];
    const [polls, demos, reels] = await Promise.all([
      repo.listMyPolls(),
      repo.listDemoPolls(),
      socialRepo.listReels(viewer),
    ]);
    return [...polls, ...demos]
      .map((poll) => ({ kind: "poll", poll }) as FeedItem)
      .concat(reels.map((reel) => ({ kind: "reel", reel }) as FeedItem))
      .sort((a, b) => feedTime(b).localeCompare(feedTime(a)));
  }
  let source;
  try {
    source = await feedSource<Row, FeedItem>(
      supabase,
      cursor,
      async () => {
        const [own, followed, ownReels, followedReels] = await Promise.all([
          repo.listMyPolls(),
          repo.listSocialPolls ? repo.listSocialPolls() : Promise.resolve([]),
          socialRepo.listReels(viewer, viewer),
          socialRepo.listReels(viewer, undefined, true),
        ]);
        return [...own, ...followed]
          .map((poll) => ({ kind: "poll", poll }) as FeedItem)
          .concat(
            [...ownReels, ...followedReels]
              .filter((reel) => reel.media.kind !== "demo")
              .map((reel) => ({ kind: "reel", reel }) as FeedItem),
          );
      },
      (item) => ({ time: feedTime(item), id: feedId(item) }),
      (item) => item.kind + ":" + feedId(item),
    );
  } catch (error) {
    throw new Error(
      readableRpcError(
        error,
        "Could not load your feed. Check your connection and try again.",
      ),
    );
  }
  if (source.kind === "legacy") {
    if (!source.items.length && !cursor)
      return (await repo.listDemoPolls()).map((poll) => ({
        kind: "poll",
        poll,
      }));
    return source.items;
  }
  const rows = source.rows;
  if (!rows.length && !cursor) {
    return (await repo.listDemoPolls()).map((poll) => ({ kind: "poll", poll }));
  }
  const derived = await mediaDerivatives(
    supabase,
    rows.map((row) => row.post.id),
  );
  for (const row of rows) {
    if (row.kind === "poll")
      row.post.media_gallery = (row.post.media_gallery || []).map(
        (m: PollMedia) => {
          const d = derived.find(
            (d) =>
              d.poll_id === row.post.id &&
              d.source_path === m.value &&
              d.state === "ready",
          );
          return {
            ...m,
            value: m.kind === "video" ? d?.playback_path || m.value : m.value,
            thumbnail: d?.preview_path || m.thumbnail,
          };
        },
      );
    else {
      const d = derived.find(
        (d) => d.reel_id === row.post.id && d.state === "ready",
      );
      row.post.video_path = d?.playback_path || row.post.video_path;
      row.post.poster = d?.preview_path;
    }
  }
  const galleries = rows
    .filter((r) => r.kind === "poll")
    .flatMap((r) => (r.post.media_gallery || []) as PollMedia[]);
  const [photos, videos] = await Promise.all([
    signMediaPaths(
      supabase,
      "poll-photos",
      galleries
        .filter((m) => m.kind === "image")
        .map((m) => m.thumbnail || m.value)
        .concat(
          rows.filter((r) => r.kind === "poll").map((r) => r.post.image_path),
        ),
    ),
    signMediaPaths(
      supabase,
      "social-media",
      rows
        .filter((r) => r.kind === "reel")
        .flatMap((r) => [r.post.video_path, r.post.avatar_path, r.post.poster])
        .concat(
          galleries
            .filter((m) => m.kind === "video")
            .flatMap((m) => [m.value, m.thumbnail || null]),
        ),
    ),
  ]);
  return rows.map(({ kind, post: p }): FeedItem => {
    if (kind === "reel")
      return {
        kind,
        reel: {
          poster: videos.get(p.poster),
          id: p.id,
          authorId: p.author_id,
          caption: p.caption,
          createdAt: p.created_at,
          author: {
            displayName: p.username || "",
            username: p.username || null,
            bio: "",
            avatar: videos.get(p.avatar_path) || null,
          },
          media: { kind: "remote", value: videos.get(p.video_path) || "" },
          liked: !!p.liked,
          likes: Number(p.likes || 0),
          productUrl: p.product_url || undefined,
        },
      };
    return {
      kind,
      poll: {
        contentKind: p.content_type ?? "poll",
        creationSpec: p.creation_spec ?? undefined,
        productDetails: p.product_details ?? undefined,
        mediaState: p.media_state,
        id: p.id,
        itemName: p.item_name,
        question: p.question,
        priceInr: p.price_inr ?? 0,
        createdAt: p.created_at,
        imageUrl: photos.get(p.image_path) || null,
        demoImage: p.demo_image || null,
        isDemo: false,
        authorId: p.author_id,
        username: p.username,
        category: p.category,
        useCase: p.use_case,
        priority: p.priority,
        budgetInr: p.budget_inr,
        voteCount: Number(p.vote_count || 0),
        updateStatus: p.update_status || null,
        media: ((p.media_gallery || []) as PollMedia[])
          .map((m) => ({
            ...m,
            value:
              (m.kind === "image" ? photos : videos).get(
                m.kind === "image" ? m.thumbnail || m.value : m.value,
              ) || "",
            thumbnail:
              m.kind === "video" ? videos.get(m.thumbnail || "") : undefined,
          }))
          .filter((m) => p.creation_spec || m.value),
      },
    };
  });
}

export const loadFeed = (viewer: string, cursor?: FeedCursor) =>
  measured("feed_load", () => loadFeedInner(viewer, cursor));
