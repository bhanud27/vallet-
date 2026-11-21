import { optionalRpc, readableRpcError } from './backendRpc';
import type { SupabaseClient } from '@supabase/supabase-js';
export type Derivative = {
  poll_id: string | null;
  reel_id: string | null;
  source_path: string;
  preview_path: string | null;
  playback_path: string | null;
  state: 'pending' | 'processing' | 'ready' | 'failed';
};
export async function mediaDerivatives(
  client: SupabaseClient,
  ids: string[],
): Promise<Derivative[]> {
  if (!ids.length) return [];
  try {
    const result = await optionalRpc<Derivative[]>(client, 'worthit_media_derivatives', {
      p_ids: ids,
    });
    // Original media still requires authorized signed URLs. No Storage policy is bypassed.
    return result.available ? result.data || [] : [];
  } catch (error) {
    throw new Error(
      readableRpcError(
        error,
        'Could not load photos and videos. Check your connection and try again.',
      ),
    );
  }
}
