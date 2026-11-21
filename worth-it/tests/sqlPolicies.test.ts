import { createRequire } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
function psql(source: string) {
  const vars = new Map<string, string>();
  const sql = source
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^\\set\s+(\w+)\s+(.+)$/);
      if (match && match[2].startsWith("'".repeat(3)))
        vars.set(match[1], match[2].slice(2, -2));
      return !line.trimStart().startsWith("\\");
    })
    .join("\n");
  return sql.replace(
    /(?<!:):([A-Z][A-Z0-9_]*)\b/g,
    (all, key) => vars.get(key) ?? all,
  );
}
for (const bundled of [false, true]) {
  test(
    bundled
      ? "manual upgrade from 0010 is atomic and passes SQL permission regressions"
      : "all migrations and SQL permission regressions run in isolated PostgreSQL",
    { timeout: 90000 },
    async () => {
      const db = new PGlite();
      try {
        await db.exec(
          await readFile(
            new URL("../supabase/tests/00_supabase_stubs.sql", import.meta.url),
            "utf8",
          ),
        );
        // Catalog health checks run against an isolated database, never the live project.
        const healthSql = await readFile(
          new URL("../supabase/check_database_health.sql", import.meta.url),
          "utf8",
        );
        const healthRows = async () => {
          const results = await db.exec(healthSql);
          return results.flatMap((result) => result.rows) as {
            check_name: string;
            status: string;
            details: string;
          }[];
        };
        const incomplete = await healthRows();
        assert.ok(
          incomplete.some((row) => row.check_name === "Required tables" && row.status === "FAIL"),
          "missing objects should produce diagnostic rows instead of SQL errors",
        );
        const dir = new URL("../supabase/migrations/", import.meta.url);
        const applyBundle = async () => {
          const { buildUpgrade, sources } = createRequire(import.meta.url)(
            "../scripts/build-manual-upgrade.cjs",
          );
          const upgrade = await readFile(
            new URL("../supabase/upgrade_0011_to_0017.sql", import.meta.url),
            "utf8",
          );
          assert.equal(
            upgrade,
            buildUpgrade(sources()),
            "manual bundle must match canonical migration sources",
          );
          const before = await db.query(
            await readFile(
              new URL("../supabase/check_migrations.sql", import.meta.url),
              "utf8",
            ),
          );
          await assert.rejects(
            db.exec(
              upgrade.replace(/\ncommit;\s*$/i, "\nselect 1/0;\ncommit;"),
            ),
            /division by zero/,
          );
          await db.exec("rollback");
          const after = await db.query(
            await readFile(
              new URL("../supabase/check_migrations.sql", import.meta.url),
              "utf8",
            ),
          );
          assert.deepEqual(
            after.rows,
            before.rows,
            "a failed combined upgrade must roll back all checkpoints",
          );
          await db.exec(upgrade);
          await assert.rejects(db.exec(upgrade), /already installed/);
          await db.exec("rollback");
        };
        for (const name of (await readdir(dir))
          .filter((n) => n.endsWith(".sql"))
          .sort()) {
          if (bundled && name === "0011_full_size_photos.sql")
            await applyBundle();
          if (
            bundled &&
            name >= "0011_full_size_photos.sql" &&
            name <= "0017_post_management.sql"
          )
            continue;
          if (name === "0012_safety_and_accounts.sql") {
            await assert.rejects(
              db.exec(
                await readFile(new URL("0016_operations.sql", dir), "utf8"),
              ),
              /Missing prerequisites: 0012_safety_and_accounts.sql, 0014_results_and_engagement.sql, 0015_media_jobs.sql/,
            );
            await db.exec("rollback");
            const checkpoints = await db.query<{
              migration: string;
              checkpoint: string;
            }>(
              await readFile(
                new URL("../supabase/check_migrations.sql", import.meta.url),
                "utf8",
              ),
            );
            assert.equal(
              checkpoints.rows.find(
                (row) => row.migration === "0012_safety_and_accounts.sql",
              )?.checkpoint,
              "Missing",
            );
            assert.equal(
              checkpoints.rows.find(
                (row) => row.migration === "0010_shopping_decisions.sql",
              )?.checkpoint,
              "Present",
            );
          }
          if (name === "0016_operations.sql") {
            await assert.rejects(
              db.exec(
                await readFile(
                  new URL("0017_post_management.sql", dir),
                  "utf8",
                ),
              ),
              /Missing prerequisites: 0016_operations.sql/,
            );
            await db.exec("rollback");
            const check = await db.query<{ count: number }>(
              "select count(*)::integer as count from information_schema.columns where table_schema='public' and table_name='polls' and column_name='archived_at'",
            );
            assert.equal(
              check.rows[0].count,
              0,
              "failed prerequisite check must not partially alter posts",
            );
          }
          try {
            await db.exec(await readFile(new URL(name, dir), "utf8"));
          } catch (e) {
            throw new Error("Migration " + name + " failed: " + String(e));
          }
        }
        const healthy = await healthRows();
        assert.ok(healthy.length >= 20);
        assert.deepEqual(
          healthy.filter((row) => row.status === "FAIL"),
          [],
          "a fully migrated database should pass the catalog health checks",
        );
        await db.exec("alter table public.polls disable row level security");
        try {
          const broken = await healthRows();
          assert.ok(
            broken.some((row) => row.check_name === "Row level security" && row.status === "FAIL" && row.details.includes("public.polls")),
            "health check must detect accidentally disabled RLS",
          );
        } finally {
          await db.exec("alter table public.polls enable row level security");
        }
        const readiness = await db.query<{
          migration: string;
          checkpoint: string;
        }>(
          await readFile(
            new URL("../supabase/check_migrations.sql", import.meta.url),
            "utf8",
          ),
        );
        assert.equal(readiness.rows.length, 8);
        assert.ok(
          readiness.rows.every((row) => row.checkpoint === "Present"),
          "all schema checkpoints should pass after a complete migration run",
        );
        await db.exec(
          "begin; update storage.buckets set file_size_limit=null where id='poll-photos'",
        );
        try {
          const unlimited = await db.query<{
            migration: string;
            checkpoint: string;
          }>(
            await readFile(
              new URL("../supabase/check_migrations.sql", import.meta.url),
              "utf8",
            ),
          );
          assert.equal(
            unlimited.rows.find(
              (row) => row.migration === "0011_full_size_photos.sql",
            )?.checkpoint,
            "Present",
            "an unlimited photo bucket should not be reported as undersized",
          );
        } finally {
          await db.exec("rollback");
        }
        const tests = new URL("../supabase/tests/", import.meta.url);
        for (const name of (await readdir(tests))
          .filter((n) => /^[1-9].*_test.sql$/.test(n))
          .sort()) {
          try {
            await db.exec(psql(await readFile(new URL(name, tests), "utf8")));
          } catch (e) {
            throw new Error("Policy test " + name + " failed: " + String(e));
          }
        }
      } finally {
        await db.close();
      }
    },
  );
}
