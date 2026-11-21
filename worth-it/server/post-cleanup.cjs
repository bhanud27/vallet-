// Server-only. Deletion jobs survive app disconnects; retries use an expiring lease.
const { createClient } = require("@supabase/supabase-js");
async function cleanPostMedia(client, job) {
  if (
    !["poll-photos", "social-media"].includes(job.bucket) ||
    !job.path.startsWith(job.owner_id + "/") ||
    job.path.includes("..")
  )
    throw new Error("Invalid cleanup target");
  const check = await client.rpc("worthit_object_referenced", {
    p_bucket: job.bucket,
    p_path: job.path,
  });
  if (check.error) throw check.error;
  if (!check.data) {
    const result = await client.storage.from(job.bucket).remove([job.path]);
    if (result.error) throw result.error;
  }
  const done = await client.rpc("worthit_finish_post_cleanup", {
    p_bucket: job.bucket,
    p_path: job.path,
    p_lease: job.lease,
    p_success: true,
  });
  if (done.error) throw done.error;
}
async function run(client, limit = 100) {
  for (let i = 0; i < limit; i++) {
    const { data, error } = await client.rpc("worthit_claim_post_cleanup");
    if (error) throw error;
    if (!data?.length) break;
    try {
      await cleanPostMedia(client, data[0]);
    } catch {
      console.error(
        "Post media cleanup deferred; retry after the lease expires.",
      );
    }
  }
}
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Server credentials required.");
  await run(
    createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ),
  );
}
module.exports = { cleanPostMedia, run };
if (require.main === module)
  main().catch(() => {
    console.error("Post cleanup stopped; inspect server configuration.");
    process.exitCode = 1;
  });
