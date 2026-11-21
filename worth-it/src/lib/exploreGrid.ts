import type { PollSummary } from './types';
import type { Reel } from './socialRepo';
export type ExploreItem = { kind: 'poll'; poll: PollSummary } | { kind: 'reel'; reel: Reel };
export const exploreId = (item: ExploreItem) =>
  item.kind + ':' + (item.kind === 'poll' ? item.poll.id : item.reel.id);
export function mixExplore(polls: PollSummary[], reels: Reel[]): ExploreItem[] {
  const result: ExploreItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.max(polls.length, reels.length); i++) {
    for (const item of [
      polls[i] ? ({ kind: 'poll', poll: polls[i] } as const) : undefined,
      reels[i] ? ({ kind: 'reel', reel: reels[i] } as const) : undefined,
    ]) {
      if (item && !seen.has(exploreId(item))) {
        seen.add(exploreId(item));
        result.push(item);
      }
    }
  }
  return result;
}
