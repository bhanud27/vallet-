import type { SupabaseClient } from '@supabase/supabase-js';
export type StorageBucket = 'poll-photos' | 'social-media';
const cache = new Map<string, { url: string; expires: number }>();
export const clearMediaUrlCache = () => cache.clear();
export async function signMediaPaths(
  client: SupabaseClient,
  bucket: StorageBucket,
  paths: (string | null)[],
) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))],
    urls = new Map<string, string>();
  if (!unique.length) return urls;
  const { data: session } = await client.auth.getSession(),
    scope = session.session?.user.id || 'public';
  const key = (path: string) => scope + ':' + bucket + ':' + path,
    missing: string[] = [];
  for (const path of unique) {
    const stored = cache.get(key(path));
    if (stored && stored.expires > Date.now()) urls.set(path, stored.url);
    else missing.push(path);
  }
  for (let start = 0; start < missing.length; start += 100) {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrls(missing.slice(start, start + 100), 600);
    if (error) throw new Error('Could not load media links. Check your connection and refresh.');
    for (const item of data || [])
      if (item.path && item.signedUrl && !item.error) {
        urls.set(item.path, item.signedUrl);
        cache.set(key(item.path), { url: item.signedUrl, expires: Date.now() + 8 * 60000 });
      }
  }
  while (cache.size > 4096) cache.delete(cache.keys().next().value!);
  return urls;
}
