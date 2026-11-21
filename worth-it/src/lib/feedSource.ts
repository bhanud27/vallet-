import { optionalRpc, type RpcClient } from './backendRpc';

export type FeedPosition = { time: string; id: string };
export async function feedSource<Row, Item>(
  client: RpcClient,
  before: FeedPosition | undefined,
  legacy: () => Promise<Item[]>,
  position: (item: Item) => FeedPosition,
  identity: (item: Item) => string,
): Promise<{ kind: 'current'; rows: Row[] } | { kind: 'legacy'; items: Item[] }> {
  const result = await optionalRpc<Row[]>(client, 'worthit_feed', {
    p_before: before?.time ?? null,
    p_before_id: before?.id ?? null,
    p_limit: 12,
  });
  if (result.available) return { kind: 'current', rows: result.data || [] };
  // These legacy loaders still enforce access through their server RPCs and Storage RLS.
  const unique = new Map((await legacy()).map((item) => [identity(item), item]));
  const items = [...unique.values()]
    .filter((item) => {
      if (!before) return true;
      const next = position(item);
      return (
        Date.parse(next.time) < Date.parse(before.time) ||
        (Date.parse(next.time) === Date.parse(before.time) && next.id < before.id)
      );
    })
    .sort((a, b) => {
      const x = position(a),
        y = position(b);
      return Date.parse(y.time) - Date.parse(x.time) || y.id.localeCompare(x.id);
    })
    .slice(0, 12);
  return { kind: 'legacy', items };
}
