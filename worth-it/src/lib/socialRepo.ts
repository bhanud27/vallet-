import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { prepareImage } from './image';
import { readVideoBytes, removeDeviceVideo, saveDeviceVideo } from './socialVideo';
import type { SelectedVideo } from './socialVideo';
import { supabase } from './supabase';
import { isUsername, normalizeUsername, USERNAME_HINT, USERNAME_TAKEN } from './username';

export const PROFILE_BIO_MAX = 150;
export const REEL_CAPTION_MAX = 180;

export interface Profile {
  displayName: string;
  username: string | null;
  bio: string;
  avatar: string | null;
}

interface ProfileInput {
  username: string;
  bio: string;
  avatar?: { uri: string } | null;
}

interface ReelPost {
  id: string;
  authorId: string;
  caption: string;
  createdAt: string;
}

export interface Reel extends ReelPost {
  author: Profile;
  media: { kind: 'demo' | 'device' | 'remote'; value: string };
  liked: boolean;
  likes: number;
}

interface SocialRepo {
  getProfile(userId: string): Promise<Profile>;
  saveProfile(userId: string, input: ProfileInput): Promise<Profile>;
  listReels(viewer: string, author?: string): Promise<Reel[]>;
  postReel(author: string, caption: string, selected: SelectedVideo): Promise<string>;
  setLiked(viewer: string, reel: Reel, liked: boolean): Promise<void>;
}

const STORAGE_KEY = 'worthit:social:v1';
const MEDIA_BUCKET = 'social-media';
const emptyProfile: Profile = { displayName: '', username: null, bio: '', avatar: null };

const demoReels: Reel[] = [
  { id: 'demo-stride', caption: 'Stride Lite for daily walks. Would you pay ₹1,299?', video: 'stride' },
  { id: 'demo-trail', caption: 'Apex Pro trail sneakers. Would you wait for a sale?', video: 'trail' },
].map(({ id, caption, video }) => ({
  id, caption, authorId: '', author: { ...emptyProfile, displayName: 'Worth It? demo' }, createdAt: '', liked: false, likes: 0,
  media: { kind: 'demo', value: video },
}));

function profileText(input: ProfileInput) {
  const username = normalizeUsername(input.username);
  const bio = input.bio.trim();
  if (!isUsername(username)) throw new Error(`Enter a valid username. ${USERNAME_HINT}`);
  if (bio.length > PROFILE_BIO_MAX) throw new Error('Keep your bio under 150 characters.');
  return { username, bio };
}

function captionText(input: string) {
  const caption = input.trim();
  if (caption.length > REEL_CAPTION_MAX) throw new Error('Keep your caption under 180 characters.');
  return caption;
}

interface LocalState {
  profiles: Record<string, Omit<Profile, 'username'> & { username?: string | null }>;
  reels: ReelPost[];
  likes: Record<string, string[]>;
}

function createLocalSocialRepo(): SocialRepo & { reset(): Promise<void> } {
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
    pending = saved.then(() => undefined, () => undefined);
    return saved;
  }

  return {
    async getProfile(userId) {
      await pending;
      return { ...emptyProfile, ...(await read()).profiles[userId] };
    },
    async saveProfile(userId, input) {
      const text = profileText(input);
      const photo = input.avatar && await prepareImage(input.avatar.uri, 320, true);
      if (photo && !photo.base64) throw new Error('Could not process the profile photo.');
      return update((state) => {
        if (Object.entries(state.profiles).some(([id, profile]) => id !== userId && profile.username === text.username)) {
          throw new Error(USERNAME_TAKEN);
        }
        const avatar = photo ? `data:image/jpeg;base64,${photo.base64}`
          : input.avatar === null ? null : state.profiles[userId]?.avatar ?? null;
        const profile = { ...text, displayName: state.profiles[userId]?.displayName || text.username, avatar };
        state.profiles[userId] = profile;
        return profile;
      });
    },
    async listReels(viewer, author) {
      await pending;
      const state = await read();
      const posts = state.reels.filter((post) => !author || post.authorId === author).map((post): Reel => ({
        ...post, author: { ...emptyProfile, ...state.profiles[post.authorId] },
        media: { kind: 'device', value: post.id }, liked: false, likes: 0,
      }));
      return (author ? posts : [...posts, ...demoReels]).map((post) => {
        const people = state.likes[post.id] ?? [];
        return { ...post, liked: people.includes(viewer), likes: people.length };
      });
    },
    async postReel(authorId, input, selected) {
      const caption = captionText(input);
      const id = randomUUID();
      await saveDeviceVideo(id, selected);
      try {
        await update((state) => state.reels.unshift({ id, authorId, caption, createdAt: new Date().toISOString() }));
      } catch (error) {
        await removeDeviceVideo(id).catch(() => undefined);
        throw error;
      }
      return id;
    },
    async setLiked(viewer, reel, liked) {
      await update((state) => {
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

interface ProfileRow { display_name: string; username?: string | null; bio: string; avatar_path: string | null }
interface FeedRow extends ProfileRow {
  id: string;
  author_id: string;
  caption: string;
  created_at: string;
  video_path: string;
  liked: boolean;
  likes: number;
}

function createConnectedSocialRepo(client: SupabaseClient): SocialRepo {
  const files = client.storage.from(MEDIA_BUCKET);
  const url = (path: string) => files.getPublicUrl(path).data.publicUrl;
  const profile = (row: ProfileRow): Profile => ({
    displayName: row.display_name, username: row.username ?? null, bio: row.bio,
    avatar: row.avatar_path ? url(row.avatar_path) : null,
  });

  return {
    async getProfile(userId) {
      const { data, error } = await client.from('social_profiles').select('*').eq('id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? profile(data) : emptyProfile;
    },
    async saveProfile(userId, input) {
      const { username, bio } = profileText(input);
      const { data: old, error: lookupError } = await client.from('social_profiles').select('display_name,avatar_path').eq('id', userId).maybeSingle();
      if (lookupError) throw new Error(lookupError.message);
      let uploaded: string | null = null;
      if (input.avatar) {
        const photo = await prepareImage(input.avatar.uri, 320, false);
        const bytes = Platform.OS === 'web' ? await (await fetch(photo.uri)).arrayBuffer() : await new File(photo.uri).arrayBuffer();
        uploaded = `${userId}/avatars/${randomUUID()}.jpg`;
        const { error } = await files.upload(uploaded, bytes, { contentType: 'image/jpeg' });
        if (error) throw new Error(error.message);
      }
      const avatarPath = uploaded ?? (input.avatar === null ? null : old?.avatar_path ?? null);
      const { data, error } = await client.from('social_profiles')
        .upsert({ id: userId, display_name: old?.display_name ?? username, username, bio, avatar_path: avatarPath })
        .select('display_name,username,bio,avatar_path').single();
      if (error) {
        if (uploaded) await files.remove([uploaded]);
        if (error.code === '23505') throw new Error(USERNAME_TAKEN);
        if (error.code === 'PGRST204' || error.code === '42703') {
          throw new Error('Username setup is pending on the server. Please try again later.');
        }
        throw new Error(error.message);
      }
      if (old?.avatar_path && old.avatar_path !== avatarPath) await files.remove([old.avatar_path]);
      return profile(data);
    },
    async listReels(_viewer, author) {
      const { data, error } = await client.rpc('social_reel_feed', { p_author: author ?? null });
      if (error) throw new Error(error.message);
      const posts = (data as FeedRow[]).map((row): Reel => ({
        id: row.id, authorId: row.author_id, caption: row.caption, createdAt: row.created_at,
        author: profile(row), media: { kind: 'remote', value: url(row.video_path) }, liked: row.liked, likes: row.likes,
      }));
      return posts;
    },
    async postReel(authorId, input, selected) {
      const caption = captionText(input);
      const id = randomUUID();
      const path = `${authorId}/reels/${id}.mp4`;
      const { error: uploadError } = await files.upload(path, await readVideoBytes(selected), { contentType: 'video/mp4' });
      if (uploadError) throw new Error(uploadError.message);
      const { error } = await client.from('social_reels').insert({ id, author_id: authorId, caption, video_path: path });
      if (error) {
        await files.remove([path]);
        throw new Error(error.message);
      }
      return id;
    },
    async setLiked(_viewer, reel, liked) {
      const { error } = await client.rpc('social_set_reel_like', { p_reel: reel.id, p_liked: liked });
      if (error) throw new Error(error.message);
    },
  };
}

const local = createLocalSocialRepo();
const connected = supabase && createConnectedSocialRepo(supabase);

export const resetLocalSocial = local.reset;

export const socialRepo: SocialRepo = connected ? {
  ...connected,
  async listReels(viewer, author) {
    const posts = await connected.listReels(viewer, author);
    if (author) return posts;
    const samples = await local.listReels(viewer);
    return [...posts, ...samples.filter((post) => post.media.kind === 'demo')];
  },
  setLiked: (viewer, reel, liked) => (reel.media.kind === 'demo' ? local : connected).setLiked(viewer, reel, liked),
} : local;
