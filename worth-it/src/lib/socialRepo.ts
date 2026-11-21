import {
  reelEdit,
  postAction,
  postMutationError,
  type PostAction,
  type ReelEdit,
  type PostCursor,
} from "./postEdits";
import { ownReelPublished } from "./reelPublishLookup";
import { mediaDerivatives } from "./mediaDerivatives";
import { uploadMedia } from "./uploads";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { prepareImage } from "./image";
import {
  readVideoBytes,
  removeDeviceVideo,
  saveDeviceVideo,
} from "./socialVideo";
import type { SelectedVideo } from "./socialVideo";
import { supabase } from "./supabase";
import { signMediaPaths } from "./storageUrls";
import {
  isUsername,
  normalizeUsername,
  USERNAME_HINT,
  USERNAME_TAKEN,
} from "./username";
import { detectProductUrl } from "./validation";
import { mixReels } from "./reelMix";
import { DEMO_REELS, DEMO_REFERENCE_TIME } from "./demoData";
import {
  samplesEnabled,
  accountMuted,
  recommendationScore,
} from "./preferences";

export const PROFILE_BIO_MAX = 150;
export const REEL_CAPTION_MAX = 180;

export interface Profile {
  displayName: string;
  username: string | null;
  bio: string;
  avatar: string | null;
}

interface ProfileInput {
  displayName?: string;
  username: string;
  bio: string;
  avatar?: { uri: string } | null;
}

interface ReelPost {
  archivedAt?: string;
  editedAt?: string;
  poster?: string;
  id: string;
  authorId: string;
  caption: string;
  createdAt: string;
  productUrl?: string;
}

export interface Reel extends ReelPost {
  author: Profile;
  media: { kind: "demo" | "device" | "remote"; value: string };
  liked: boolean;
  likes: number;
}

interface SocialRepo {
  getProfile(userId: string): Promise<Profile>;
  saveProfile(userId: string, input: ProfileInput): Promise<Profile>;
  listReels(
    viewer: string,
    author?: string,
    following?: boolean,
  ): Promise<Reel[]>;
  postReel(
    author: string,
    caption: string,
    selected: SelectedVideo,
    productLink?: string,
    requestId?: string,
  ): Promise<string>;
  listArchivedReels(viewer: string, before?: PostCursor): Promise<Reel[]>;
  getOwnedReel(
    viewer: string,
    id: string,
  ): Promise<(ReelEdit & { archivedAt?: string }) | null>;
  manageReel(
    viewer: string,
    id: string,
    action: PostAction,
    values?: ReelEdit,
  ): Promise<void>;
  setLiked(viewer: string, reel: Reel, liked: boolean): Promise<void>;
  setStar(
    viewer: string,
    id: string,
    starred: boolean,
  ): Promise<{ starred: boolean; count: number }>;
}

const STORAGE_KEY = "worthit:social:v1";
const MEDIA_BUCKET = "social-media";
const emptyProfile: Profile = {
  displayName: "",
  username: null,
  bio: "",
  avatar: null,
};

const demoReels: Reel[] = DEMO_REELS.map(
  ({ id, caption, video, hoursAgo }) => ({
    id,
    caption,
    authorId: "",
    author: { ...emptyProfile, displayName: "Worth It? demo" },
    createdAt: new Date(
      DEMO_REFERENCE_TIME - hoursAgo * 3600_000,
    ).toISOString(),
    liked: false,
    likes: 0,
    media: { kind: "demo", value: video },
  }),
);

export const isDemoReel = (id: string) =>
  demoReels.some((reel) => reel.id === id);

function profileText(input: ProfileInput) {
  const username = normalizeUsername(input.username);
  const displayName = input.displayName?.trim();
  if (displayName !== undefined && (!displayName || displayName.length > 40))
    throw new Error("Enter a display name between 1 and 40 characters.");
  const bio = input.bio.trim();
  if (!isUsername(username))
    throw new Error(`Enter a valid username. ${USERNAME_HINT}`);
  if (bio.length > PROFILE_BIO_MAX)
    throw new Error("Keep your bio under 150 characters.");
  return {
    username,
    bio,
    ...(displayName === undefined ? {} : { displayName }),
  };
}

function captionText(input: string) {
  const caption = input.trim();
  if (caption.length > REEL_CAPTION_MAX)
    throw new Error("Keep your caption under 180 characters.");
  return caption;
}

function reelProductUrl(input?: string) {
  if (!input?.trim()) return undefined;
  const url = detectProductUrl(input);
  if (!url) throw new Error("Enter a valid HTTPS product link.");
  return url;
}

interface LocalState {
  profiles: Record<
    string,
    Omit<Profile, "username"> & { username?: string | null }
  >;
  reels: ReelPost[];
  likes: Record<string, string[]>;
}

function createLocalSocialRepo(): SocialRepo & {
  reset(): Promise<void>;
  listDemoReels(viewer: string): Promise<Reel[]>;
} {
  let pending = Promise.resolve();

  async function read(): Promise<LocalState> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { profiles: {}, reels: [], likes: {} };
  }

  function update<T>(change: (state: LocalState) => T): Promise<T> {
    const saved = pending.then(async () => {
      const state = await read();
      const result = change(state);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return result;
    });
    pending = saved.then(
      () => undefined,
      () => undefined,
    );
    return saved;
  }

  return {
    async getProfile(userId) {
      await pending;
      return { ...emptyProfile, ...(await read()).profiles[userId] };
    },
    async saveProfile(userId, input) {
      const text = profileText(input);
      const photo =
        input.avatar && (await prepareImage(input.avatar.uri, 320, true));
      if (photo && !photo.base64)
        throw new Error("Could not process the profile photo.");
      return update((state) => {
        if (
          Object.entries(state.profiles).some(
            ([id, profile]) =>
              id !== userId && profile.username === text.username,
          )
        ) {
          throw new Error(USERNAME_TAKEN);
        }
        const avatar = photo
          ? `data:image/jpeg;base64,${photo.base64}`
          : input.avatar === null
            ? null
            : (state.profiles[userId]?.avatar ?? null);
        const profile = {
          ...text,
          displayName:
            text.displayName ??
            state.profiles[userId]?.displayName ??
            text.username,
          avatar,
        };
        state.profiles[userId] = profile;
        return profile;
      });
    },
    async listDemoReels(viewer) {
      await pending;
      const state = await read();
      return demoReels.map((reel) => {
        const people = state.likes[reel.id] ?? [];
        return {
          ...reel,
          liked: people.includes(viewer),
          likes: people.length,
        };
      });
    },
    async listReels(viewer, author, following) {
      if (following) return [];
      await pending;
      const state = await read();
      const posts = state.reels
        .filter(
          (post) => !post.archivedAt && (!author || post.authorId === author),
        )
        .map((post): Reel => ({
          ...post,
          author: { ...emptyProfile, ...state.profiles[post.authorId] },
          media: { kind: "device", value: post.id },
          liked: false,
          likes: 0,
        }));
      return (
        author || !samplesEnabled() ? posts : [...posts, ...demoReels]
      ).map((post) => {
        const people = state.likes[post.id] ?? [];
        return {
          ...post,
          liked: people.includes(viewer),
          likes: people.length,
        };
      });
    },
    async getOwnedReel(viewer, id) {
      await pending;
      const post = (await read()).reels.find(
        (p) => p.id === id && p.authorId === viewer,
      );
      return post
        ? {
            caption: post.caption,
            productUrl: post.productUrl || "",
            archivedAt: post.archivedAt,
          }
        : null;
    },
    async listArchivedReels(viewer, before) {
      await pending;
      const state = await read();
      return state.reels
        .filter(
          (p) =>
            p.authorId === viewer &&
            !!p.archivedAt &&
            (!before ||
              p.archivedAt < before.time ||
              (p.archivedAt === before.time && p.id < before.id)),
        )
        .sort(
          (a, b) =>
            (b.archivedAt || "").localeCompare(a.archivedAt || "") ||
            b.id.localeCompare(a.id),
        )
        .slice(0, 60)
        .map((post) => ({
          ...post,
          author: { ...emptyProfile, ...state.profiles[post.authorId] },
          media: { kind: "device" as const, value: post.id },
          liked: (state.likes[post.id] || []).includes(viewer),
          likes: (state.likes[post.id] || []).length,
        }));
    },
    async manageReel(viewer, id, action, values) {
      postAction(action);
      const edited = action === "edit" ? reelEdit(values) : undefined;
      await update((state) => {
        const post = state.reels.find((p) => p.id === id);
        if (!post || post.authorId !== viewer)
          throw new Error("Only the owner can manage this check.");
        if (action === "delete") {
          state.reels = state.reels.filter((p) => p.id !== id);
          delete state.likes[id];
          return;
        }
        if (edited) {
          Object.assign(post, edited);
          post.editedAt = new Date().toISOString();
        }
        if (action === "archive") post.archivedAt ||= new Date().toISOString();
        if (action === "restore") delete post.archivedAt;
      });
      if (action === "delete")
        await removeDeviceVideo(id).catch(() => undefined);
    },
    async postReel(authorId, input, selected, productLink, requestId) {
      const caption = captionText(input);
      const productUrl = reelProductUrl(productLink);
      const id = randomUUID();
      await saveDeviceVideo(id, selected);
      try {
        await update((state) =>
          state.reels.unshift({
            id,
            authorId,
            caption,
            productUrl,
            createdAt: new Date().toISOString(),
          }),
        );
      } catch (error) {
        await removeDeviceVideo(id).catch(() => undefined);
        throw error;
      }
      return id;
    },
    async setStar(viewer, id, starred) {
      return update((state) => {
        const post = state.reels.find((p) => p.id === id);
        if (
          !isDemoReel(id) &&
          (!post || (post.archivedAt && post.authorId !== viewer))
        )
          throw new Error("This check is unavailable.");
        const people = new Set(state.likes[id] ?? []);
        if (starred) people.add(viewer);
        else people.delete(viewer);
        state.likes[id] = [...people];
        return { starred: people.has(viewer), count: people.size };
      });
    },
    async setLiked(viewer, reel, liked) {
      await update((state) => {
        const post = state.reels.find((p) => p.id === reel.id);
        if (
          !isDemoReel(reel.id) &&
          (!post || (post.archivedAt && post.authorId !== viewer))
        )
          throw new Error("This check is unavailable.");
        const people = new Set(state.likes[reel.id] ?? []);
        if (liked) people.add(viewer);
        else people.delete(viewer);
        state.likes[reel.id] = [...people];
      });
    },
    async reset() {
      const ids = await update((state) => {
        const previous = state.reels.map(({ id }) => id);
        state.profiles = {};
        state.reels = [];
        state.likes = {};
        return previous;
      });
      await Promise.allSettled(ids.map(removeDeviceVideo));
    },
  };
}

interface ProfileRow {
  display_name: string;
  username?: string | null;
  bio: string;
  avatar_path: string | null;
}
interface FeedRow extends ProfileRow {
  archived_at?: string;
  edited_at?: string;
  id: string;
  author_id: string;
  caption: string;
  created_at: string;
  video_path: string;
  liked: boolean;
  likes: number;
}

function createConnectedSocialRepo(client: SupabaseClient): SocialRepo & {
  mixedReels(viewer: string, seed: number, limit?: number): Promise<Reel[]>;
} {
  const files = client.storage.from(MEDIA_BUCKET);
  const profile = (row: ProfileRow, urls: Map<string, string>): Profile => ({
    displayName: row.display_name,
    username: row.username ?? null,
    bio: row.bio,
    avatar: urls.get(row.avatar_path ?? "") ?? null,
  });
  async function reelRows(author?: string, following?: boolean) {
    const { data, error } = following
      ? await client.rpc("list_visible_reels", {
          p_author: author ?? null,
          p_following: true,
        })
      : await client.rpc("social_reel_feed", { p_author: author ?? null });
    if (following && error?.code === "PGRST202") return [];
    if (error) throw new Error(error.message);
    return (data ?? []) as FeedRow[];
  }

  async function hydrateReels(rows: FeedRow[]): Promise<Reel[]> {
    if (!rows.length) return [];
    const derivatives = await mediaDerivatives(
      client,
      rows.map((row) => row.id),
    );
    const posterPaths = new Map(
      derivatives
        .filter((d) => d.state === "ready")
        .map((d) => [d.reel_id, d.preview_path]),
    );
    rows = rows.map((row) => ({
      ...row,
      video_path:
        derivatives.find((d) => d.reel_id === row.id && d.state === "ready")
          ?.playback_path || row.video_path,
    }));
    const [urls, links] = await Promise.all([
      signMediaPaths(
        client,
        MEDIA_BUCKET,
        rows.flatMap((row) => [
          row.avatar_path,
          row.video_path,
          posterPaths.get(row.id) || null,
        ]),
      ),
      client.rpc("get_reel_product_links", {
        p_ids: rows.map((row) => row.id),
      }),
    ]);
    const productLinks = new Map<string, string>(
      (links.data ?? []).map((link: { id: string; product_url: string }) => [
        link.id,
        link.product_url,
      ]),
    );
    return rows.flatMap((row): Reel[] => {
      const video = urls.get(row.video_path);
      return video
        ? [
            {
              id: row.id,
              authorId: row.author_id,
              caption: row.caption,
              createdAt: row.created_at,
              archivedAt: row.archived_at,
              editedAt: row.edited_at,
              poster: urls.get(posterPaths.get(row.id) || ""),
              productUrl: productLinks.get(row.id),
              author: profile(row, urls),
              media: { kind: "remote", value: video },
              liked: row.liked,
              likes: row.likes,
            },
          ]
        : [];
    });
  }

  return {
    async getProfile(userId) {
      const { data, error } = await client
        .from("social_profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data
        ? profile(
            data,
            await signMediaPaths(client, MEDIA_BUCKET, [data.avatar_path]),
          )
        : emptyProfile;
    },
    async saveProfile(userId, input) {
      const { username, bio, displayName } = profileText(input);
      const { data: old, error: lookupError } = await client
        .from("social_profiles")
        .select("display_name,avatar_path")
        .eq("id", userId)
        .maybeSingle();
      if (lookupError) throw new Error(lookupError.message);
      let uploaded: string | null = null;
      if (input.avatar) {
        const photo = await prepareImage(input.avatar.uri, 320, false);
        const bytes =
          Platform.OS === "web"
            ? await (await fetch(photo.uri)).arrayBuffer()
            : await new File(photo.uri).arrayBuffer();
        uploaded = `${userId}/avatars/${randomUUID()}.jpg`;
        const { error } = await files.upload(uploaded, bytes, {
          contentType: "image/jpeg",
        });
        if (error) throw new Error(error.message);
      }
      const avatarPath =
        uploaded ?? (input.avatar === null ? null : (old?.avatar_path ?? null));
      const { data, error } = await client
        .from("social_profiles")
        .upsert({
          id: userId,
          display_name: displayName ?? old?.display_name ?? username,
          username,
          bio,
          avatar_path: avatarPath,
        })
        .select("display_name,username,bio,avatar_path")
        .single();
      if (error) {
        if (uploaded) await files.remove([uploaded]);
        if (error.code === "23505") throw new Error(USERNAME_TAKEN);
        if (error.code === "PGRST204" || error.code === "42703") {
          throw new Error(
            "Username setup is pending on the server. Please try again later.",
          );
        }
        throw new Error(error.message);
      }
      if (old?.avatar_path && old.avatar_path !== avatarPath)
        await files.remove([old.avatar_path]);
      return profile(
        data,
        await signMediaPaths(client, MEDIA_BUCKET, [data.avatar_path]),
      );
    },
    async listReels(_viewer, author, following) {
      return hydrateReels(await reelRows(author, following));
    },
    async mixedReels(viewer, seed, limit) {
      const [visible, following] = await Promise.all([
        reelRows(),
        reelRows(undefined, true),
      ]);
      return hydrateReels(
        mixReels(
          visible.filter((row) => row.author_id !== viewer),
          following,
          seed,
          limit,
        ),
      );
    },
    async getOwnedReel(viewer, id) {
      const { data, error } = await client
        .from("social_reels")
        .select("caption,product_url,archived_at")
        .eq("id", id)
        .eq("author_id", viewer)
        .maybeSingle();
      if (error) throw postMutationError(error);
      return data
        ? {
            caption: data.caption,
            productUrl: data.product_url || "",
            archivedAt: data.archived_at ?? undefined,
          }
        : null;
    },
    async listArchivedReels(_viewer, before) {
      const { data, error } = await client.rpc("worthit_archived_posts", {
        p_kind: "reel",
        p_before: before?.time ?? null,
        p_before_id: before?.id ?? null,
      });
      if (error) throw postMutationError(error);
      return hydrateReels(data || []);
    },
    async manageReel(_viewer, id, action, values) {
      postAction(action);
      const p_values = action === "edit" ? reelEdit(values) : {};
      const { error } = await client.rpc("worthit_manage_post", {
        p_kind: "reel",
        p_id: id,
        p_action: action,
        p_values,
      });
      if (error) throw postMutationError(error);
    },
    async postReel(authorId, input, selected, productLink, requestId) {
      const caption = captionText(input);
      const productUrl = reelProductUrl(productLink);
      const id = requestId || randomUUID();
      if (await ownReelPublished(client, authorId, id)) return id;
      const path = `${authorId}/reels/${id}.mp4`;
      const previous = await files.list(authorId + "/reels", {
        search: id + ".mp4",
      });
      if (previous.error) throw new Error(previous.error.message);
      const { error: uploadError } = previous.data?.some(
        (f) => f.name === id + ".mp4",
      )
        ? { error: null }
        : await uploadMedia(
            client,
            MEDIA_BUCKET,
            path,
            await readVideoBytes(selected),
            "video/mp4",
          );
      if (uploadError) throw new Error(uploadError.message);
      const { error } = await client.from("social_reels").insert({
        id,
        author_id: authorId,
        caption,
        video_path: path,
        ...(productUrl ? { product_url: productUrl } : {}),
      });
      if (error) {
        if (await ownReelPublished(client, authorId, id)) return id;
        if (error.code === "PGRST204" && productUrl)
          throw new Error(
            "Check product links are still being set up on the server.",
          );
        throw new Error(error.message);
      }
      return id;
    },
    async setStar(_viewer, id, starred) {
      const { data, error } = await client.rpc("worthit_set_check_star", {
        p_id: id,
        p_starred: starred,
      });
      if (error?.code === "PGRST202")
        throw new Error(
          "Check Stars are being updated. Please try again later.",
        );
      if (error) throw new Error(error.message);
      return { starred: !!data.starred, count: Number(data.count) };
    },
    async setLiked(_viewer, reel, liked) {
      const { error } = await client.rpc("social_set_reel_like", {
        p_reel: reel.id,
        p_liked: liked,
      });
      if (error) throw new Error(error.message);
    },
  };
}

const local = createLocalSocialRepo();
const connected = supabase && createConnectedSocialRepo(supabase);

export const resetLocalSocial = local.reset;
export const getDemoReels = local.listDemoReels;

async function mixedReelsUnranked(viewer: string, seed: number, limit = 60) {
  if (!connected)
    return mixReels(await local.listReels(viewer), [], seed, limit);
  const posts = await connected.mixedReels(viewer, seed, limit);
  if (!samplesEnabled()) return posts;
  const samples = mixReels(await getDemoReels(viewer), [], seed);
  const merged: Reel[] = [];
  // Preserve the server recommendation order while inserting samples.
  for (let index = 0; index < Math.max(posts.length, samples.length); index++) {
    if (posts[index]) merged.push(posts[index]);
    if (samples[index]) merged.push(samples[index]);
  }
  return merged.slice(0, limit);
}

export const socialRepo: SocialRepo = connected
  ? {
      ...connected,
      async listReels(viewer, author, following) {
        const posts = await connected.listReels(viewer, author, following);
        if (author || following || !samplesEnabled()) return posts;
        const samples = await local.listReels(viewer);
        return [
          ...posts,
          ...samples.filter((post) => post.media.kind === "demo"),
        ];
      },
      setStar: (viewer, id, starred) =>
        (isDemoReel(id) ? local : connected).setStar(viewer, id, starred),
      setLiked: (viewer, reel, liked) =>
        (reel.media.kind === "demo" ? local : connected).setLiked(
          viewer,
          reel,
          liked,
        ),
    }
  : local;

export async function listMixedReels(
  ...args: Parameters<typeof mixedReelsUnranked>
) {
  const rows = await mixedReelsUnranked(...args);
  return rows
    .filter((row) => !accountMuted(row.authorId))
    .sort(
      (a, b) => recommendationScore(b.caption) - recommendationScore(a.caption),
    );
}
