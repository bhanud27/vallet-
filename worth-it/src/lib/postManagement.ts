import { removeLocalSavedPost } from "./engagement";
import { repo } from "./repo";
import { socialRepo } from "./socialRepo";
import { feedCache } from "./feed";
import { clearMediaUrlCache } from "./storageUrls";
import { removeLocalThread, type ThreadKind } from "./comments";
import type { PostAction, PollEdit, ReelEdit } from "./postEdits";
export async function managePost(
  kind: ThreadKind,
  id: string,
  action: PostAction,
  values?: PollEdit | ReelEdit,
) {
  const { userId } = await repo.getSession();
  if (kind === "poll")
    await repo.managePoll(id, action, values as PollEdit | undefined);
  else
    await socialRepo.manageReel(
      userId,
      id,
      action,
      values as ReelEdit | undefined,
    );
  feedCache.clear();
  clearMediaUrlCache();
  if (action === "delete" && repo.mode === "local") {
    await removeLocalThread(kind, id).catch(() => undefined);
    if (kind === "poll") await removeLocalSavedPost(id).catch(() => undefined);
  }
}
