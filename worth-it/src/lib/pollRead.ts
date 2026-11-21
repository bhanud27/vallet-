import { optionalRpc, type RpcClient } from './backendRpc';
export async function pollRead(client: RpcClient, id: string) {
  const page = await optionalRpc<Record<string, any> | null>(client, 'worthit_poll_page', {
    p_id: id,
  });
  if (page.available) return page.data;
  const { data, error } = await client.rpc('get_poll_view', { p_id: id });
  if (error) throw error;
  return data as Record<string, any> | null;
}
