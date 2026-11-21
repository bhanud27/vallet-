// Defaults to dry run. References are checked immediately before every deletion.
const { createClient } = require('@supabase/supabase-js');
async function cleanFolder(client, bucket, folder = '', execute = false, now = Date.now()) {
  let offset = 0,
    removed = 0;
  for (;;) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(folder, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    if (!data?.length) break;
    let deleted = 0;
    for (const item of data) {
      const path = folder ? folder + '/' + item.name : item.name;
      if (!item.id) {
        removed += await cleanFolder(client, bucket, path, execute, now);
        continue;
      }
      const age = Date.parse(item.updated_at || item.created_at);
      if (!Number.isFinite(age) || now - age < 48 * 3600000) continue;
      const { data: used, error: check } = await client.rpc('worthit_object_referenced', {
        p_bucket: bucket,
        p_path: path,
      });
      if (check) throw check;
      if (!used) {
        removed++;
        if (execute) {
          const result = await client.storage.from(bucket).remove([path]);
          if (result.error) throw result.error;
          deleted++;
        }
      }
    }
    offset += data.length - deleted;
    if (data.length < 100) break;
  }
  return removed;
}
async function main() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server credentials required');
  const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    execute = process.argv.includes('--execute');
  if (execute && process.env.MEDIA_CLEANUP_MAINTENANCE !== 'true')
    throw new Error(
      'Pause publishing and confirm MEDIA_CLEANUP_MAINTENANCE=true before executing cleanup.',
    );
  for (const bucket of ['poll-photos', 'social-media'])
    console.log(
      bucket +
        ': ' +
        (await cleanFolder(client, bucket, '', execute)) +
        ' unreferenced objects ' +
        (execute ? 'removed' : 'eligible (dry run)'),
    );
}
module.exports = { cleanFolder };
if (require.main === module)
  main().catch(() => {
    console.error('Cleanup stopped; no further files were removed.');
    process.exitCode = 1;
  });
