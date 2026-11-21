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
function createRetailerPolicy(fetchFile) {
  const cache = new Map();
  return async function check(url, signal) {
    const page = new URL(url),
      key = page.origin;
    let entry = cache.get(key);
    if (!entry || entry.until < Date.now()) {
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      const pending = fetchFile(
        key + "/robots.txt",
        AbortSignal.any([signal, AbortSignal.timeout(3000)]),
        false,
        { text: true },
      )
        .then((result) => {
          const body = result.body.toString("utf8");
          if (
            result.type === "text/html" &&
            body.trim() &&
            !/^\s*(#|User-agent\s*:)/i.test(body)
          )
            throw new Error("Not a robots policy");
          return body;
        })
        .catch((error) => {
          if ([404, 410].includes(error.remoteStatus)) return "";
          const failure = new Error(
            "The store access policy could not be checked. Add details and photos manually.",
          );
          failure.code = "RETAILER_POLICY";
          failure.remoteStatus = error.remoteStatus;
          failure.policyReason = "POLICY_UNAVAILABLE";
          throw failure;
        });
      entry = { until: Date.now() + 3600000, pending };
      cache.set(key, entry);
      pending.catch(() => {
        if (cache.get(key) === entry) cache.delete(key);
      });
    }
    const text = await entry.pending;
    if (!robotsAllowed(text, page.pathname + page.search)) {
      const failure = new Error(
        "This store does not allow automatic previews for that page. Add details and photos manually.",
      );
      failure.code = "RETAILER_POLICY";
      throw failure;
    }
  };
}
module.exports = { robotsAllowed, createRetailerPolicy };
