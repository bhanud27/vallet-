import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const db = createRequire(import.meta.url)("../scripts/database.cjs");
const REF = "a".repeat(20);
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "worthit-db-"));
  fs.mkdirSync(path.join(root, "supabase/migrations"), { recursive: true });
  fs.mkdirSync(path.join(root, "server"));
  const files = Array.from({ length: 17 }, (_, i) => {
    const version = String(i + 1).padStart(4, "0"),
      file = version + "_fixture.sql",
      sql = "select " + (i + 1) + ";\n";
    fs.writeFileSync(path.join(root, "supabase/migrations", file), sql);
    return { version, file, sha256: db.hash(sql) };
  });
  fs.writeFileSync(
    path.join(root, "supabase/migration-baseline.json"),
    JSON.stringify({ through: "0017", migrations: files }),
  );
  fs.writeFileSync(
    path.join(root, "supabase/deployment.json"),
    JSON.stringify({ projectRef: REF }),
  );
  fs.writeFileSync(
    path.join(root, "supabase/check_migrations.sql"),
    "-- readiness fixture",
  );
  const env = {
    SUPABASE_URL: "https://" + REF + ".supabase.co",
    EXPO_PUBLIC_SUPABASE_URL: "https://" + REF + ".supabase.co",
    SUPABASE_ACCESS_TOKEN: "test-private-token",
    SUPABASE_DB_PASSWORD: "test-private-password",
  };
  const state = {
    history: [] as string[],
    complete: true,
    checks: 0,
    calls: [] as string[][],
    logs: [] as string[],
  };
  const options = {
    root,
    env,
    log: (text: string) => {
      state.logs.push(text);
    },
    query: async (sql: string) => {
      if (sql.includes("to_regclass('supabase_migrations.schema_migrations')"))
        return [{ present: state.history.length > 0 }];
      if (sql.startsWith("select version::text"))
        return state.history.map((version) => ({ version }));
      if (sql === "-- readiness fixture")
        return Array.from({ length: 8 }, (_, index) => ({
          checkpoint: state.complete || index !== 2 ? "Present" : "Missing",
        }));
      throw Error("Unexpected query");
    },
    cli: async (args: string[]) => {
      state.calls.push(args);
      if (args[0] === "migration") {
        const versions = args.slice(2, args.indexOf("--status"));
        state.history = [...new Set([...state.history, ...versions])];
      }
      if (args[0] === "db" && !args.includes("--dry-run"))
        state.history = db
          .migrations(root)
          .map((m: { version: string }) => m.version);
    },
    check: async () => {
      state.checks++;
    },
  };
  function cleanup() {
    const allowed = path.join(os.tmpdir(), "worthit-db-");
    if (!path.resolve(root).startsWith(allowed))
      throw Error("Unexpected temporary directory");
    fs.rmSync(root, { recursive: true, force: true });
  }
  const newFile = () =>
    fs.writeFileSync(
      path.join(root, "supabase/migrations/20261121010000_new_feature.sql"),
      "select 42;\n",
    );
  return { root, env, state, options, files, cleanup, newFile };
}
test("deployment freezes existing migration contents across Windows line endings", () => {
  const f = fixture();
  try {
    assert.equal(db.validateFiles(f.root).length, 17);
    const file = path.join(f.root, "supabase/migrations", f.files[0].file);
    fs.writeFileSync(file, "select 1;\r\n");
    assert.equal(db.validateFiles(f.root).length, 17);
    fs.writeFileSync(file, "select 2;\n");
    assert.throws(() => db.validateFiles(f.root), /existing migration changed/);
  } finally {
    f.cleanup();
  }
});
test("project mismatch and missing credentials stop before any network or mutation", async () => {
  const f = fixture();
  try {
    f.env.SUPABASE_URL = "https://" + "b".repeat(20) + ".supabase.co";
    await assert.rejects(
      () => db.operate("deploy", f.options),
      /project mismatch/,
    );
    f.env.SUPABASE_URL = "https://" + REF + ".supabase.co";
    f.env.SUPABASE_ACCESS_TOKEN = "";
    await assert.rejects(
      () => db.operate("deploy", f.options),
      /One-time setup/,
    );
    assert.equal(f.state.calls.length, 0);
  } finally {
    f.cleanup();
  }
});
test("ordinary deploy never replays manually applied baseline migrations", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      () => db.operate("deploy", f.options),
      /db:baseline once/,
    );
    assert.equal(f.state.calls.length, 0);
    f.state.complete = false;
    await assert.rejects(
      () => db.operate("baseline", f.options),
      /database is incomplete/,
    );
    assert.equal(f.state.calls.length, 0);
    f.state.complete = true;
    f.newFile();
    await db.operate("baseline", f.options);
    assert.equal(f.state.history.length, 17);
    assert.deepEqual(f.state.calls[0], [
      "migration",
      "repair",
      ...f.files.map((m) => m.version),
      "--status",
      "applied",
      "--yes",
    ]);
    assert.ok(!f.state.history.includes("20261121010000"));
  } finally {
    f.cleanup();
  }
});
test("baseline is repeatable without reapplying data or schema", async () => {
  const f = fixture();
  try {
    await db.operate("baseline", f.options);
    const calls = f.state.calls.length;
    await db.operate("baseline", f.options);
    assert.equal(f.state.calls.length, calls);
  } finally {
    f.cleanup();
  }
});
test("deployment previews first, checks code, applies only pending files, and verifies history", async () => {
  const f = fixture();
  try {
    f.state.history = f.files.map((m) => m.version);
    f.newFile();
    await db.operate("plan", f.options);
    assert.deepEqual(f.state.calls, [
      ["db", "push", "--dry-run", "--skip-vault"],
    ]);
    assert.equal(f.state.checks, 0);
    f.state.calls = [];
    await db.operate("deploy", f.options);
    assert.equal(f.state.checks, 1);
    assert.deepEqual(f.state.calls, [
      ["db", "push", "--dry-run", "--skip-vault"],
      ["db", "push", "--skip-vault", "--yes"],
    ]);
    assert.ok(f.state.history.includes("20261121010000"));
    const calls = f.state.calls.length;
    await db.operate("deploy", f.options);
    assert.equal(f.state.calls.length, calls);
  } finally {
    f.cleanup();
  }
});
test("failed checks block deployment and unknown remote versions block history repair", async () => {
  const f = fixture();
  try {
    f.state.history = f.files.map((m) => m.version);
    f.newFile();
    await assert.rejects(
      () =>
        db.operate("deploy", {
          ...f.options,
          check: async () => {
            throw Error("check failed");
          },
        }),
      /check failed/,
    );
    assert.equal(f.state.calls.length, 0);
    f.state.history.push("20270101000000");
    await assert.rejects(
      () => db.operate("baseline", f.options),
      /missing from this checkout/,
    );
    assert.equal(f.state.calls.length, 0);
  } finally {
    f.cleanup();
  }
});
test("admin introspection is read-only and does not follow redirects with the token", async () => {
  const calls: any[] = [];
  const env = { SUPABASE_ACCESS_TOKEN: "private-test-token" };
  const result = await db.managementQuery(
    REF,
    env,
    "select 1",
    async (url: string, options: any) => {
      calls.push({ url, options });
      return { ok: true, json: async () => [{ one: 1 }] };
    },
  );
  assert.deepEqual(result, [{ one: 1 }]);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(JSON.parse(calls[0].options.body).read_only, true);
  assert.equal(
    calls[0].url,
    "https://api.supabase.com/v1/projects/" + REF + "/database/query",
  );
  await assert.rejects(
    () =>
      db.managementQuery(REF, env, "select 1", async () => ({
        ok: false,
        status: 403,
      })),
    /rejected or lacks/,
  );
});
test("private admin values are redacted and are stripped from verification subprocesses", () => {
  const env = {
    SUPABASE_ACCESS_TOKEN: "PAT-secret",
    SUPABASE_DB_PASSWORD: "space secret",
    SUPABASE_SERVICE_ROLE_KEY: "server-secret",
    PATH: "tool-path",
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  };
  const value = db.redact(
    "PAT-secret space%20secret server-secret postgres://user:password@host/db",
    env,
  );
  assert.ok(!value.includes("PAT-secret"));
  assert.ok(!value.includes("space%20secret"));
  assert.ok(!value.includes("server-secret"));
  assert.ok(!value.includes("password@host"));
  const safe = db.verificationEnvironment(env);
  assert.equal(safe.SUPABASE_ACCESS_TOKEN, undefined);
  assert.equal(safe.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(safe.PATH, "tool-path");
});
test("deployment locking prevents overlapping local operations and releases on failure", async () => {
  const f = fixture();
  try {
    let release!: () => void;
    const busy = db.localLock(
      f.root,
      REF,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await assert.rejects(
      () => db.localLock(f.root, REF, async () => {}),
      /Another database operation/,
    );
    release();
    await busy;
    await assert.rejects(
      () =>
        db.localLock(f.root, REF, async () => {
          throw Error("failure");
        }),
      /failure/,
    );
    await db.localLock(f.root, REF, async () => {});
  } finally {
    f.cleanup();
  }
});
test("new migrations use unique UTC names and reject path traversal", () => {
  const f = fixture();
  try {
    const file = db.createMigration(
      f.root,
      "add_product_tags",
      new Date("2026-11-21T05:06:07Z"),
    );
    assert.equal(file, "20261121050607_add_product_tags.sql");
    assert.throws(
      () => db.createMigration(f.root, "../../escape"),
      /migration name/,
    );
    assert.throws(
      () =>
        db.createMigration(
          f.root,
          "another_change",
          new Date("2026-11-21T05:06:07Z"),
        ),
      /already uses/,
    );
  } finally {
    f.cleanup();
  }
});
test("checked-in migration baseline matches the real canonical files", () => {
  assert.equal(
    db
      .validateFiles(path.resolve(import.meta.dirname, ".."))
      .filter((m: { version: string }) => m.version <= "0017").length,
    17,
  );
});

test("new files cannot be silently marked as part of the historical baseline", async () => {
  const f = fixture();
  try {
    fs.writeFileSync(
      path.join(f.root, "supabase/migrations/0000_unapplied.sql"),
      "select 99;",
    );
    await assert.rejects(
      () => db.operate("baseline", f.options),
      /cannot be added to the historical baseline/,
    );
    assert.equal(f.state.calls.length, 0);
    assert.equal(f.state.history.length, 0);
  } finally {
    f.cleanup();
  }
});
