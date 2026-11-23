// Public metadata requests honor explicit robots exclusions. No private APIs,
// credentials, browser impersonation, challenge solving or proxy evasion.
function robotsAllowed(text, path, agent = "worthitproductpreview") {
  const groups = [];
  let current = { agents: [], rules: [], started: false };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim(),
      match = /^(user-agent|allow|disallow)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase(),
      value = match[2].trim();
    if (key === "user-agent") {
      if (current.started) {
        groups.push(current);
        current = { agents: [], rules: [], started: false };
      }
      current.agents.push(value.toLowerCase());
    } else if (current.agents.length) {
      current.started = true;
      if (value) current.rules.push({ allow: key === "allow", path: value });
    }
  }
  groups.push(current);
  const score = (g) =>
      Math.max(
        -1,
        ...g.agents.map((a) =>
          a === "*" ? 0 : agent.includes(a) ? a.length : -1,
        ),
      ),
    best = Math.max(-1, ...groups.map(score));
  let winner = { length: -1, allow: true };
  if (best < 0) return true;
  for (const group of groups.filter((g) => score(g) === best))
    for (const rule of group.rules) {
      const escaped = rule.path
        .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      let regex;
      try {
        regex = new RegExp("^" + escaped);
      } catch {
        continue;
      }
      const length = rule.path.replace(/[\*$]/g, "").length;
      if (
        regex.test(path) &&
        (length > winner.length || (length === winner.length && rule.allow))
      )
        winner = { length, allow: rule.allow };
    }
  return winner.allow;
}
function policyError(code, reason, remoteStatus) {
  return Object.assign(
    new Error(
      code === "ACCESS_RESTRICTED"
        ? "This store does not allow automatic previews for that page. Add details and photos manually."
        : "The store access policy could not be checked. Try again or add product details manually.",
    ),
    { code, stage: "policy", reason, remoteStatus },
  );
}

function createRetailerPolicy(fetchFile, config = {}) {
  const cache = new Map();
  const timeout = Math.min(
    8000,
    Math.max(
      1,
      Number(config.timeout ?? process.env.PRODUCT_POLICY_TIMEOUT_MS) || 5000,
    ),
  );
  return async function check(url, signal) {
    signal.throwIfAborted();
    const page = new URL(url),
      key = page.origin;
    let entry = cache.get(key);
    if (!entry || entry.until <= Date.now()) {
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      const deadline = AbortSignal.timeout(timeout);
      entry = { until: Infinity, pending: null };
      entry.pending = fetchFile(key + "/robots.txt", deadline, false, {
        text: true,
      })
        .then((result) => {
          const body = result.body.toString("utf8");
          const rules = body
            .split(/\r?\n/)
            .map((line) => line.split("#")[0].trim())
            .filter(Boolean);
          if (
            rules.length &&
            !rules.some((line) => /^(user-agent|sitemap|host)\s*:/i.test(line))
          )
            throw policyError("POLICY_UNAVAILABLE", "INVALID_ROBOTS_RESPONSE");
          return body;
        })
        .catch((error) => {
          const status = error.remoteStatus;
          if ([404, 410].includes(status)) return "";
          entry.until = Date.now() + 30000;
          if ([401, 403].includes(status))
            throw policyError(
              "ACCESS_RESTRICTED",
              "ROBOTS_HTTP_DENIED",
              status,
            );
          if (status === 429)
            throw policyError("RATE_LIMITED", "ROBOTS_RATE_LIMITED", status);
          if (error.code === "ECONNRESET")
            throw policyError("CONNECTION_RESET", "ROBOTS_CONNECTION_RESET");
          if (
            deadline.aborted ||
            ["AbortError", "TimeoutError"].includes(error.name) ||
            error.code === "ETIMEDOUT"
          )
            throw policyError("POLICY_TIMEOUT", "ROBOTS_TIMEOUT");
          throw policyError(
            "POLICY_UNAVAILABLE",
            error.reason || "ROBOTS_UNAVAILABLE",
            status,
          );
        })
        .finally(() => {
          if (entry.until === Infinity) entry.until = Date.now() + 3600000;
        });
      cache.set(key, entry);
    }
    let cancel;
    const cancelled = new Promise((_, reject) => {
      cancel = () => reject(signal.reason);
      signal.addEventListener("abort", cancel, { once: true });
    });
    const text = await Promise.race([entry.pending, cancelled]).finally(() =>
      signal.removeEventListener("abort", cancel),
    );
    if (!robotsAllowed(text, page.pathname + page.search))
      throw policyError("ACCESS_RESTRICTED", "ROBOTS_DISALLOW");
  };
}
module.exports = { robotsAllowed, createRetailerPolicy };
