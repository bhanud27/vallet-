import { DEMO_POLLS, DEMO_REFERENCE_TIME } from "./demoData";
import type { PollSummary, PollView } from "./types";
export const isDemoPoll = (id: string) =>
  DEMO_POLLS.some((item) => item.id === id);
export function demoPollView(
  id: string,
  now = DEMO_REFERENCE_TIME,
): PollView | null {
  const item = DEMO_POLLS.find((item) => item.id === id);
  if (!item) return null;
  const poll = {
    id: item.id,
    itemName: item.itemName,
    priceInr: item.priceInr,
    question: item.question,
    imageUrl: null,
    demoImage: item.demoImage,
    isDemo: true,
    createdAt: new Date(now - item.hoursAgo * 3600000).toISOString(),
    category: item.category,
  };
  return {
    poll,
    votes: item.votes.map((vote, i) => ({
      id: "sample-" + item.id + "-" + i,
      choice: vote.choice,
      reason: vote.reason,
      ownsItem: vote.owns,
      createdAt: new Date(now - vote.minsAgo * 60000).toISOString(),
    })),
    update: item.update
      ? { ...item.update, updatedAt: new Date(now - 7200000).toISOString() }
      : null,
    isAuthor: false,
    myChoice: null,
  };
}
export function demoPollSummaries(): PollSummary[] {
  return DEMO_POLLS.map((item) => ({
    ...demoPollView(item.id)!.poll,
    voteCount: item.votes.length,
    updateStatus: item.update?.status ?? null,
  }));
}
