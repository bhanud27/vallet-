import { isMissingRpc, FeatureUnavailableError, readableRpcError } from './backendRpc';
import { feedCache } from './feed';
import { clearMediaUrlCache } from './storageUrls';
import { supabase } from './supabase';
export async function safetyRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('This feature requires a connected account.');
  const { data, error } = await supabase.rpc(name, args);
  if (isMissingRpc(error)) throw new FeatureUnavailableError();
  if (error)
    throw new Error(readableRpcError(error, 'Could not complete this action. Please try again.'));
  return data as T;
}
export async function blockAccount(id: string, blocked: boolean) {
  await safetyRpc('set_account_block', { p_id: id, p_blocked: blocked });
  feedCache.clear();
  clearMediaUrlCache();
}
export const reportContent = (kind: string, target: string, reason: string) =>
  safetyRpc('report_content', { p_kind: kind, p_target: target, p_reason: reason });
