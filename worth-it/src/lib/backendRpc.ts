import type { SupabaseClient } from '@supabase/supabase-js';

export type RpcClient = Pick<SupabaseClient, 'rpc'>;
export type OptionalRpc<T> = { available: true; data: T } | { available: false };

// Only PostgREST's missing-function response permits compatibility fallback.
// Authentication, permission, connection, and SQL errors must remain failures.
export function isMissingRpc(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'PGRST202';
}

export class FeatureUnavailableError extends Error {
  constructor(message = 'This feature is temporarily unavailable. Please try again later.') {
    super(message);
    this.name = 'FeatureUnavailableError';
  }
}

export async function optionalRpc<T>(
  client: RpcClient,
  name: string,
  args?: Record<string, unknown>,
): Promise<OptionalRpc<T>> {
  const { data, error } = await client.rpc(name, args);
  if (isMissingRpc(error)) return { available: false };
  if (error) throw error;
  return { available: true, data: data as T };
}

export function readableRpcError(error: unknown, fallback: string): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === '42501') return 'You do not have permission to use this feature.';
  if (code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303')
    return 'Your session needs to be refreshed. Please sign in again.';
  return fallback;
}
