interface Identifiable { id: string }

function shuffled<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/** Take one followed reel per nine discovery reels, using available clips when a pool runs out. */
export function mixReels<T extends Identifiable>(visible: T[], following: T[], seed: number, limit = 60): T[] {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const uniqueFollowing = [...new Map(following.map((item) => [item.id, item])).values()];
  const followedIds = new Set(uniqueFollowing.map((item) => item.id));
  const discovery = shuffled([...new Map(visible.filter((item) => !followedIds.has(item.id))
    .map((item) => [item.id, item])).values()], random);
  const followed = shuffled(uniqueFollowing, random);
  const result: T[] = [];
  let discoveryIndex = 0;
  let followingIndex = 0;
  while (result.length < limit && (discoveryIndex < discovery.length || followingIndex < followed.length)) {
    const followSlot = (result.length + 1) % 10 === 0;
    result.push((followSlot && followingIndex < followed.length) || discoveryIndex === discovery.length
      ? followed[followingIndex++] : discovery[discoveryIndex++]);
  }
  return result;
}
