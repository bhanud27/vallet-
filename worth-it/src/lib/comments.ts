import {isDemoPoll} from './demoViews';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { repo } from './repo';
import { isDemoReel, socialRepo } from './socialRepo';
import { supabase } from './supabase';

export const COMMENT_MAX = 500;
export type ThreadKind = 'poll' | 'reel';
export const isThreadKind = (value: unknown): value is ThreadKind => value === 'poll' || value === 'reel';

export interface Comment {
  id: string;
  authorId?: string;
  username: string;
  body: string;
  created_at: string;
}

const STORAGE_KEY = 'worthit:comments:v1';
let pending = Promise.resolve();
type CommentsByThread = Record<string, Comment[]>;

async function readLocal(): Promise<CommentsByThread> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

function updateLocal(change: () => Promise<void>) {
  const saved = pending.then(change);
  pending = saved.then(() => undefined, () => undefined);
  return saved;
}

async function requireLocalThread(kind: ThreadKind, id: string) {
  if (kind === 'reel' && isDemoReel(id)) return;
  const exists = kind === 'poll' ? !!await repo.getPollView(id)
    : (await socialRepo.listReels((await repo.getSession()).userId)).some((reel) => reel.id === id);
  if (!exists) throw new Error('This comment thread is unavailable.');
}

function checkError(error: { code: string; message: string } | null) {
  if (!error) return;
  if (error.code === 'PGRST202') throw new Error('Comments are still being set up on the server.');
  throw new Error(error.message);
}

export async function listComments(kind: ThreadKind, id: string): Promise<Comment[]> {
  if (supabase && !((kind === 'reel' && isDemoReel(id)) || (kind==='poll' && isDemoPoll(id)))) {
    const { data, error } = await supabase.rpc('list_social_comments', { p_kind: kind, p_id: id });
    checkError(error);
    return data ?? [];
  }
  await requireLocalThread(kind, id);
  await pending;
  return (await readLocal())[`${kind}:${id}`] ?? [];
}

export async function addComment(kind: ThreadKind, id: string, input: string, commentId = randomUUID()) {
  const body = input.trim();
  if (!body || body.length > COMMENT_MAX) throw new Error(`Write a comment between 1 and ${COMMENT_MAX} characters.`);
  if (supabase && !((kind === 'reel' && isDemoReel(id)) || (kind==='poll' && isDemoPoll(id)))) {
    const { error } = await supabase.rpc('add_social_comment', {
      p_kind: kind, p_id: id, p_comment_id: commentId, p_body: body,
    });
    checkError(error);
    return;
  }
  await requireLocalThread(kind, id);
  const { userId } = await repo.getSession();
  const profile = await socialRepo.getProfile(userId);
  await updateLocal(async () => {
    const threads = await readLocal();
    const key = `${kind}:${id}`;
    const items = threads[key] ?? [];
    if (items.some((item) => item.id === commentId)) return;
    threads[key] = [{
      id: commentId, body, authorId:userId, username: profile.username || profile.displayName || 'Guest shopper',
      created_at: new Date().toISOString(),
    }, ...items].slice(0, 50);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  });
}

export const resetLocalComments = () => updateLocal(() => AsyncStorage.removeItem(STORAGE_KEY));

export const removeLocalThread=(kind:ThreadKind,id:string)=>updateLocal(async()=>{
 const threads=await readLocal();delete threads[kind+':'+id];
 await AsyncStorage.setItem(STORAGE_KEY,JSON.stringify(threads));
});
