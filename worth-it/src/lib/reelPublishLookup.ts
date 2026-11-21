import type { RpcClient } from './backendRpc';
// Use the existing authorized feed RPC; old deployments do not grant direct reel SELECT.
export async function ownReelPublished(client: RpcClient, owner: string, id: string) {
  const { data, error } = await client.rpc('social_reel_feed', { p_author: owner });
  if (error) throw error;
  return ((data || []) as { id: string; author_id: string }[]).some(
    (row) => row.id === id && row.author_id === owner,
  );
}
