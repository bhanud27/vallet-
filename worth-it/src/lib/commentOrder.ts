import type { Comment } from "./comments";
export type CommentSort = "newest" | "oldest";
export function orderedComments(
  comments: Comment[],
  sort: CommentSort,
): Comment[] {
  const stamp = (comment: Comment) => Date.parse(comment.created_at) || 0;
  return [...comments].sort(
    (a, b) =>
      (sort === "newest" ? stamp(b) - stamp(a) : stamp(a) - stamp(b)) ||
      a.id.localeCompare(b.id),
  );
}
