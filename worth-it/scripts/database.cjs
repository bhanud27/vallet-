// Server-side developer tool. This module is never imported by the app.
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const { parseEnv } = require("node:util"),
  { spawn } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");
const LEGACY_THROUGH = "0017";
const normalize = (text) => text.replace(/\r\n/g, "\n");
const hash = (text) =>
  createHash("sha256").update(normalize(text)).digest("hex");
function readEnv(file) {
  return fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
}
function loadEnvironment(root = ROOT, processEnv = process.env) {
  const app = readEnv(path.join(root, ".env")),
    server = readEnv(path.join(root, "server/.env"));
  return { ...app, ...server, ...processEnv };
}
function target(root, env) {
  const pinned = JSON.parse(
    fs.readFileSync(path.join(root, "supabase/deployment.json"), "utf8"),
  ).projectRef;
  if (!/^[a-z0-9]{20}$/.test(pinned))
    throw new Error(
      "Set the Worth It project reference in supabase/deployment.json.",
    );
  for (const value of [
    env.SUPABASE_PROJECT_REF,
    env.SUPABASE_URL,
    env.EXPO_PUBLIC_SUPABASE_URL,
  ].filter(Boolean)) {
    let ref = value;
    if (value.includes("://")) {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
      )
        throw new Error(
          "Database deployment requires the standard HTTPS Supabase project URL.",
        );
      ref = url.hostname.split(".")[0];
    }
    if (ref !== pinned)
      throw new Error(
        "Database project mismatch. Deployment stopped before connecting.",
      );
  }
  return pinned;
}
function migrations(root = ROOT) {
  const dir = path.join(root, "supabase/migrations"),
    seen = new Set();
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((file) => {
      const match = /^(\d+)_([a-z][a-z0-9_]*)\.sql$/.exec(file);
      if (!match || seen.has(match[1]))
        throw new Error("Invalid or duplicate migration version: " + file);
      seen.add(match[1]);
      const source = path.join(dir, file);
      if (fs.lstatSync(source).isSymbolicLink())
        throw new Error("Migration files must not be symlinks.");
      const sql = fs.readFileSync(source, "utf8");
      return { version: match[1], file, sql, sha256: hash(sql) };
    });
}
function validateFiles(root = ROOT) {
  const files = migrations(root),
    manifest = JSON.parse(
      fs.readFileSync(
        path.join(root, "supabase/migration-baseline.json"),
        "utf8",
      ),
    );
  if (manifest.through !== LEGACY_THROUGH || manifest.migrations.length !== 17)
    throw new Error("Unexpected baseline manifest.");
  for (const row of manifest.migrations) {
    const file = files.find((m) => m.version === row.version);
    if (!file || file.file !== row.file || file.sha256 !== row.sha256)
      throw new Error(
        "An existing migration changed: " +
          row.file +
          ". Create a new migration instead.",
      );
  }
  const baselineVersions = new Set(
    manifest.migrations.map((row) => row.version),
  );
  for (const file of files) {
    if (file.version <= LEGACY_THROUGH && !baselineVersions.has(file.version)) {
      throw new Error(
        "New files cannot be added to the historical baseline: " +
          file.file +
          ". Use db:new.",
      );
    }
  }
  for (const file of files.filter((m) => m.version > LEGACY_THROUGH)) {
    if (!/^20\d{12}$/.test(file.version))
      throw new Error(
        "New migrations need a UTC timestamp version: " + file.file,
      );
  }
  return files;
}
function reconcile(files, history) {
  if (
    !Array.isArray(history) ||
    history.some((row) => typeof row.version !== "string")
  )
    throw new Error("Invalid remote migration history response.");
  const known = new Set(files.map((m) => m.version)),
    applied = new Set(history.map((row) => row.version));
  const unknown = [...applied].filter((version) => !known.has(version));
  if (unknown.length)
    throw new Error(
      "Remote migrations are missing from this checkout: " +
        unknown.join(", ") +
        ". Pull the correct code before deploying.",
    );
  return {
    applied,
    pending: files.filter((m) => !applied.has(m.version)),
    missingBaseline: files.filter(
      (m) => m.version <= LEGACY_THROUGH && !applied.has(m.version),
    ),
  };
}
function redact(text, env) {
  let result = String(text);
  for (const key of [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_SERVICE_ROLE_KEY",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  ]) {
    const value = env[key];
    if (value)
      for (const form of [value, encodeURIComponent(value)])
        result = result.split(form).join("[REDACTED]");
  }
  return result.replace(
    /postgres(?:ql)?:\/\/[^\s"'<>]+/gi,
    "[REDACTED_DATABASE_URL]",
  );
}
async function managementQuery(ref, env, query, fetchImpl = fetch) {
  if (!env.SUPABASE_ACCESS_TOKEN?.trim())
    throw new Error(
      "Add SUPABASE_ACCESS_TOKEN to server/.env once; keep its value out of chat.",
    );
  const response = await fetchImpl(
    "https://api.supabase.com/v1/projects/" + ref + "/database/query",
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(45000),
      headers: {
        Authorization: "Bearer " + env.SUPABASE_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, read_only: true }),
    },
  );
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "Supabase admin token was rejected or lacks database permissions.",
      );
    throw new Error(
      "Supabase database inspection failed (HTTP " +
        response.status +
        "). No deployment was started.",
    );
  }
  const result = await response.json();
  if (!Array.isArray(result))
    throw new Error(
      "Unexpected database inspection response. No deployment was started.",
    );
  return result;
}
async function history(query) {
  const [exists] = await query(
    "select to_regclass('supabase_migrations.schema_migrations') is not null as present",
  );
  return exists?.present
    ? query(
        "select version::text as version from supabase_migrations.schema_migrations order by version",
      )
    : [];
}
function verificationEnvironment(env) {
  const safe = { ...env };
  for (const key of Object.keys(safe))
    if (/^SUPABASE_|^(DATABASE_URL|PGPASSWORD)$/i.test(key)) delete safe[key];
  return safe;
}
async function runChild(exe, args, root, env, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd: root,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let output = "",
      size = 0,
      timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 300000);
    const capture = (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        child.kill();
        return;
      }
      output += chunk.toString();
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", () => {
      clearTimeout(timer);
      reject(
        new Error(
          "Could not launch the database command. Run npm install and retry.",
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const safe = redact(output, env).slice(-12000);
      if (safe) log(safe);
      if (timedOut)
        return reject(
          new Error(
            "Database command timed out. Check migration status before retrying.",
          ),
        );
      if (code !== 0 || size > 2 * 1024 * 1024)
        return reject(
          new Error(
            "Database command failed. Review the output above; no reset or automatic history repair was attempted.",
          ),
        );
      resolve();
    });
  });
}
async function localLock(root, ref, work) {
  const dir = path.join(root, "supabase/.temp");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "deployment-" + ref + ".lock");
  let handle;
  try {
    handle = fs.openSync(file, "wx");
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(
        "Another database operation is running, or a previous operation left a lock. Inspect supabase/.temp before retrying.",
      );
    throw error;
  }
  try {
    fs.writeFileSync(
      handle,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
    return await work();
  } finally {
    fs.closeSync(handle);
    fs.unlinkSync(file);
  }
}
function createMigration(root, name, now = new Date()) {
  if (!/^[a-z][a-z0-9_]{2,64}$/.test(name || ""))
    throw new Error("Use a migration name such as add_product_tags.");
  const version = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const dir = path.join(root, "supabase/migrations");
  if (fs.readdirSync(dir).some((file) => file.startsWith(version + "_")))
    throw new Error(
      "A migration already uses this timestamp; try again in a moment.",
    );
  const file = version + "_" + name + ".sql";
  fs.writeFileSync(
    path.join(dir, file),
    "begin;\n\n-- Add the reviewed schema change here.\n\nnotify pgrst, 'reload schema';\ncommit;\n",
    { flag: "wx" },
  );
  return file;
}
async function operate(
  mode,
  {
    root = ROOT,
    env = loadEnvironment(root),
    query: customQuery,
    cli: customCli,
    check: customCheck,
    log = console.log,
    lock = localLock,
  } = {},
) {
  if (!["status", "baseline", "plan", "deploy"].includes(mode))
    throw new Error("Use db:status, db:baseline, db:plan or db:deploy.");
  const files = validateFiles(root),
    ref = target(root, env);
  if (!env.SUPABASE_ACCESS_TOKEN?.trim())
    throw new Error(
      "One-time setup needed: add SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD to server/.env. Never paste them into chat.",
    );
  log("Database target: " + ref);
  const query = customQuery || ((sql) => managementQuery(ref, env, sql));
  const cli =
    customCli ||
    ((args) =>
      runChild(
        process.execPath,
        [
          path.join(root, "node_modules/supabase/dist/supabase.js"),
          ...args,
          "--remote=" + ref,
          "--agent=no",
        ],
        root,
        env,
        log,
      ));
  const npmCli =
    env.npm_execpath ||
    path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.js",
    );
  const check =
    customCheck ||
    (() =>
      runChild(
        process.execPath,
        [npmCli, "run", "check"],
        root,
        verificationEnvironment(env),
        log,
      ));
  const work = async () => {
    const state = reconcile(files, await history(query));
    if (mode === "status") {
      log(
        "Recorded: " +
          state.applied.size +
          "; pending: " +
          state.pending.length,
      );
      if (state.missingBaseline.length)
        log("One-time history sync needed: npm run db:baseline");
      state.pending.forEach((m) => log("Pending: " + m.file));
      return state;
    }
    if (mode === "baseline") {
      const checkpoints = await query(
        fs.readFileSync(
          path.join(root, "supabase/check_migrations.sql"),
          "utf8",
        ),
      );
      if (
        checkpoints.length !== 8 ||
        checkpoints.some((row) => row.checkpoint !== "Present")
      )
        throw new Error(
          "The existing database is incomplete. Baseline was not recorded; inspect db:status and check_migrations.sql.",
        );
      if (state.missingBaseline.length) {
        if (!env.SUPABASE_DB_PASSWORD?.trim())
          throw new Error(
            "Add SUPABASE_DB_PASSWORD to server/.env for the one-time history sync.",
          );
        await cli([
          "migration",
          "repair",
          ...state.missingBaseline.map((m) => m.version),
          "--status",
          "applied",
          "--yes",
        ]);
      }
      const updated = reconcile(files, await history(query));
      if (updated.missingBaseline.length)
        throw new Error(
          "History sync is incomplete. No schema changes were replayed.",
        );
      log(
        "Existing migrations through 0017 are recorded. No existing schema or user data was replayed.",
      );
      return updated;
    }
    if (state.missingBaseline.length)
      throw new Error(
        "Run npm run db:baseline once before deploying. Old dashboard migrations will not be replayed.",
      );
    if (!state.pending.length) {
      log("Database is up to date.");
      return state;
    }
    if (!env.SUPABASE_DB_PASSWORD?.trim())
      throw new Error(
        "Add SUPABASE_DB_PASSWORD to server/.env for database deployments.",
      );
    state.pending.forEach((m) => log("Pending: " + m.file));
    if (mode === "deploy") await check();
    await cli(["db", "push", "--dry-run", "--skip-vault"]);
    if (mode === "plan") return state;
    await cli(["db", "push", "--skip-vault", "--yes"]);
    const updated = reconcile(files, await history(query));
    if (updated.pending.length)
      throw new Error(
        "Some migrations are still pending. Check db:status before retrying.",
      );
    log("Database migrations applied and history verified.");
    return updated;
  };
  return mode === "status" ? work() : lock(root, ref, work);
}
async function main() {
  const [mode, ...args] = process.argv.slice(2),
    env = loadEnvironment();
  try {
    if (mode === "new") {
      if (args.length !== 1)
        throw new Error("Usage: npm run db:new -- change_name");
      validateFiles();
      console.log("Created " + createMigration(ROOT, args[0]));
      return;
    }
    if (args.length) throw new Error("Unexpected arguments.");
    await operate(mode, { env });
  } catch (error) {
    console.error(redact(error.message || "Database command failed.", env));
    process.exitCode = 1;
  }
}
module.exports = {
  verificationEnvironment,
  loadEnvironment,
  target,
  migrations,
  validateFiles,
  reconcile,
  redact,
  managementQuery,
  history,
  runChild,
  localLock,
  createMigration,
  operate,
  hash,
};
if (require.main === module) main();
