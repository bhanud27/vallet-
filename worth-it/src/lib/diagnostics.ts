// Bounded, device-local counters. No URLs, text, user IDs, or access tokens.
export type Metric = 'feed_load' | 'publish' | 'vote' | 'crash';
type Sample = { name: Metric; ok: boolean; ms: number; at: string };
const samples: Sample[] = [];
export function recordMetric(name: Metric, ok: boolean, ms: number) {
  samples.push({ name, ok, ms: Math.max(0, Math.round(ms)), at: new Date().toISOString() });
  if (samples.length > 100) samples.shift();
}
export function diagnosticSummary() {
  return (['feed_load', 'publish', 'vote', 'crash'] as Metric[]).map((name) => {
    const rows = samples.filter((s) => s.name === name);
    return {
      name,
      count: rows.length,
      failed: rows.filter((s) => !s.ok).length,
      averageMs: rows.length ? Math.round(rows.reduce((n, s) => n + s.ms, 0) / rows.length) : 0,
    };
  });
}
export async function measured<T>(name: Metric, task: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const value = await task();
    recordMetric(name, true, Date.now() - start);
    return value;
  } catch (e) {
    recordMetric(name, false, Date.now() - start);
    throw e;
  }
}
