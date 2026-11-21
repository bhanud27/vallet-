import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { safetyRpc } from "./safety";
import { repo } from "./repo";
import { socialRepo, isDemoReel, getDemoReels } from "./socialRepo";
import { savedPolls } from "./engagement";
import type { Comment } from "./comments";
export type ActivitySection = "saved" | "stars" | "polls" | "comments";
export type ActivityEntry = {
  entry_id: string;
  kind: "poll" | "reel";
  content_id: string;
  title: string;
  created_at: string;
  comment_id?: string;
  body?: string;
};
export async function saveCheck(
  viewer: string,
  id: string,
  title: string,
  value?: boolean,
) {
  if (supabase && !isDemoReel(id))
    return safetyRpc<boolean>("worthit_save_content", {
      p_kind: "reel",
      p_id: id,
      p_save: value ?? null,
    });
  const key = "worthit:saved-checks:" + viewer;
  let rows: ActivityEntry[] = JSON.parse(
    (await AsyncStorage.getItem(key)) || "[]",
  );
  if (value !== undefined) {
    rows = rows.filter((row) => row.content_id !== id);
    if (value)
      rows.unshift({
        entry_id: "save-reel:" + id,
        kind: "reel",
        content_id: id,
        title,
        created_at: new Date().toISOString(),
      });
    await AsyncStorage.setItem(key, JSON.stringify(rows));
  }
  return rows.some((row) => row.content_id === id);
}
export async function deleteOwnComment(viewer: string, id: string) {
  if (supabase) return safetyRpc("worthit_delete_comment", { p_id: id });
  const key = "worthit:comments:v1";
  const threads: Record<string, Comment[]> = JSON.parse(
    (await AsyncStorage.getItem(key)) || "{}",
  );
  let found = false;
  for (const thread of Object.keys(threads)) {
    const item = threads[thread].find((c) => c.id === id);
    if (item) {
      if (item.authorId !== viewer)
        throw new Error("Only the author can delete a comment.");
      threads[thread] = threads[thread].filter((c) => c.id !== id);
      found = true;
    }
  }
  if (!found) throw new Error("This comment is no longer available.");
  await AsyncStorage.setItem(key, JSON.stringify(threads));
}
export async function activity(
  viewer: string,
  section: ActivitySection,
  before?: ActivityEntry,
): Promise<ActivityEntry[]> {
  if (supabase) {
    const remote = await safetyRpc<ActivityEntry[]>("worthit_activity", {
      p_section: section,
      p_before: before?.created_at ?? null,
      p_before_id: before?.entry_id ?? null,
    });
    const local: ActivityEntry[] =
      section === "saved"
        ? JSON.parse(
            (await AsyncStorage.getItem("worthit:saved-checks:" + viewer)) ||
              "[]",
          )
        : section === "stars"
          ? (await getDemoReels(viewer))
              .filter((r) => r.liked)
              .map((r) => ({
                entry_id: "star-reel:" + r.id,
                kind: "reel" as const,
                content_id: r.id,
                title: r.caption,
                created_at: r.createdAt,
              }))
          : [];
    return [...remote, ...local]
      .sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) ||
          b.entry_id.localeCompare(a.entry_id),
      )
      .filter(
        (row) =>
          !before ||
          row.created_at < before.created_at ||
          (row.created_at === before.created_at &&
            row.entry_id < before.entry_id),
      )
      .slice(0, 30);
  }
  const rows: ActivityEntry[] = [];
  const raw = JSON.parse(
    (await AsyncStorage.getItem("worthit:local:v1")) || "{}",
  ) as {
    polls?: {
      id: string;
      authorId: string;
      itemName: string;
      createdAt: string;
      contentKind?: string;
      archivedAt?: string;
    }[];
    votes?: {
      id: string;
      pollId: string;
      voterId: string;
      createdAt?: string;
    }[];
    stars?: Record<string, string[]>;
  };
  const reels = await socialRepo.listReels(viewer);
  const polls = raw.polls ?? [];
  const addPoll = async (
    id: string,
    key: string,
    created?: string,
    body?: string,
    comment_id?: string,
  ) => {
    const view = await repo.getPollView(id);
    if (view && !view.poll.archivedAt)
      rows.push({
        entry_id: key,
        kind: "poll",
        content_id: id,
        title: view.poll.itemName,
        created_at: created ?? view.poll.createdAt,
        body,
        comment_id,
      });
  };
  if (section === "saved") {
    for (const row of await savedPolls(viewer))
      await addPoll(row.id, "save-poll:" + row.id, row.createdAt);
    const saved: ActivityEntry[] = JSON.parse(
      (await AsyncStorage.getItem("worthit:saved-checks:" + viewer)) || "[]",
    );
    rows.push(
      ...saved.filter((r) => reels.some((reel) => reel.id === r.content_id)),
    );
  } else if (section === "stars") {
    for (const [id, viewers] of Object.entries(raw.stars ?? {}))
      if (viewers.includes(viewer)) await addPoll(id, "star-poll:" + id);
    rows.push(
      ...reels
        .filter((r) => r.liked)
        .map((r) => ({
          entry_id: "star-reel:" + r.id,
          kind: "reel" as const,
          content_id: r.id,
          title: r.caption,
          created_at: r.createdAt,
        })),
    );
  } else if (section === "polls") {
    for (const p of polls.filter(
      (p) => p.authorId === viewer && p.contentKind !== "post",
    ))
      await addPoll(p.id, "created:" + p.id, p.createdAt);
    for (const vote of raw.votes ?? [])
      if (vote.voterId === viewer)
        await addPoll(vote.pollId, "vote:" + vote.id, vote.createdAt);
  } else {
    const threads: Record<string, Comment[]> = JSON.parse(
      (await AsyncStorage.getItem("worthit:comments:v1")) || "{}",
    );
    for (const [thread, comments] of Object.entries(threads)) {
      const [kind, ...parts] = thread.split(":"),
        id = parts.join(":");
      for (const c of comments.filter((c) => c.authorId === viewer)) {
        if (kind === "poll")
          await addPoll(id, "comment:" + c.id, c.created_at, c.body, c.id);
        else {
          const reel = reels.find((r) => r.id === id);
          if (reel)
            rows.push({
              entry_id: "comment:" + c.id,
              kind: "reel",
              content_id: id,
              title: reel.caption,
              created_at: c.created_at,
              body: c.body,
              comment_id: c.id,
            });
        }
      }
    }
  }
  return rows
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) ||
        b.entry_id.localeCompare(a.entry_id),
    )
    .filter(
      (row) =>
        !before ||
        row.created_at < before.created_at ||
        (row.created_at === before.created_at &&
          row.entry_id < before.entry_id),
    )
    .slice(0, 30);
}
