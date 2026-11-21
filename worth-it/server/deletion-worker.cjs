// Server-only: never bundle SUPABASE_SERVICE_ROLE_KEY into Expo.
const { createClient } = require('@supabase/supabase-js');
async function deletePrefix(client, bucket, prefix) {
  const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const entry of data || []) {
    const path = prefix + '/' + entry.name;
    if (entry.id) {
      const result = await client.storage.from(bucket).remove([path]);
      if (result.error) throw result.error;
    } else await deletePrefix(client, bucket, path);
  }
  // Repeat because a folder may hold more than 1000 objects.
  if ((data || []).length === 1000) await deletePrefix(client, bucket, prefix);
}
async function processDeletion(client, userId) {
  for (const bucket of ['poll-photos', 'social-media']) await deletePrefix(client, bucket, userId);
  const votes = await client.from('votes').delete().eq('voter_id', userId);
  if (votes.error) throw votes.error;
  const deleted = await client.auth.admin.deleteUser(userId);
  if (deleted.error) throw deleted.error;
}
async function main() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error('Configure server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from('account_deletion_requests')
    .select('user_id')
    .limit(20);
  if (error) throw error;
  for (const row of data || []) {
    try {
      await processDeletion(client, row.user_id);
      console.log('Account deletion completed.');
    } catch {
      console.error('Account deletion deferred; retry on the next worker run.');
    }
  }
}
module.exports = { deletePrefix, processDeletion };
if (require.main === module)
  main().catch(() => {
    console.error('Deletion worker failed; inspect server configuration.');
    process.exitCode = 1;
  });
