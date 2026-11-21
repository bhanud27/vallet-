import { optionalRpc, type RpcClient } from './backendRpc';
export async function accountSafetyStatus(client: RpcClient) {
  const [blocks, moderator] = await Promise.all([
    optionalRpc<{ id: string; username: string }[]>(client, 'list_account_blocks'),
    optionalRpc<boolean>(client, 'is_worthit_moderator'),
  ]);
  return {
    available: blocks.available && moderator.available,
    blocks: blocks.available ? blocks.data || [] : [],
    moderator: moderator.available && !!moderator.data,
  };
}
