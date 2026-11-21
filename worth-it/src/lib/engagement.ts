import { repo } from "./repo";
import { optionalRpc, FeatureUnavailableError } from "./backendRpc";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
export type SavedPoll = { id: string; itemName: string; createdAt: string };
const savedReads = new Map<
  string,
  { until: number; promise: Promise<SavedPoll[]> }
>();
export const clearSavedReads = () => savedReads.clear();
export function cachedSavedPolls(viewer: string) {
  const old = savedReads.get(viewer);
  if (old && old.until > Date.now()) return old.promise;
  const promise = savedPolls(viewer);
  savedReads.set(viewer, { until: Date.now() + 15000, promise });
  while (savedReads.size > 8)
    savedReads.delete(savedReads.keys().next().value!);
  void promise.catch(() => savedReads.delete(viewer));
  return promise;
}
export async function savedPolls(
  viewer: string,
  save?: { id: string; itemName: string; value: boolean },
): Promise<SavedPoll[]> {
  if (save) savedReads.delete(viewer);
  if (supabase) {
    const result = await optionalRpc<SavedPoll[]>(supabase, "worthit_saved", {
      p_id: save?.id ?? null,
      p_save: save?.value ?? null,
    });
    if (!result.available)
      throw new FeatureUnavailableError(
        "Saved polls are temporarily unavailable. Please try again later.",
      );
    return result.data || [];
  }
  const key = "worthit:saved:" + viewer;
  let items: SavedPoll[] = JSON.parse(
    (await AsyncStorage.getItem(key)) || "[]",
  );
  if (save) {
    items = items.filter((v) => v.id !== save.id);
    if (save.value)
      items.unshift({
        id: save.id,
        itemName: save.itemName,
        createdAt: new Date().toISOString(),
      });
    await AsyncStorage.setItem(key, JSON.stringify(items));
  }
  const views = await Promise.all(
    items.map((item) => repo.getPollView(item.id)),
  );
  return items.flatMap((item, index) => {
    const poll = views[index]?.poll;
    return poll && !poll.archivedAt
      ? [{ ...item, itemName: poll.itemName }]
      : [];
  });
}
export async function sendFeedback(
  viewer: string,
  rating: number,
  message: string,
) {
  if (!message.trim() || message.trim().length > 1000)
    throw new Error("Write 1 to 1000 characters.");
  if (supabase) {
    const result = await optionalRpc<void>(supabase, "worthit_feedback", {
      p_rating: rating,
      p_message: message.trim(),
    });
    if (!result.available)
      throw new FeatureUnavailableError(
        "Feedback is temporarily unavailable. Please try again later.",
      );
  } else
    await AsyncStorage.setItem(
      "worthit:feedback:" + viewer,
      JSON.stringify({
        rating,
        message: message.trim(),
        createdAt: new Date().toISOString(),
      }),
    );
}

export async function removeLocalSavedPost(id: string) {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith("worthit:saved:"),
  );
  for (const key of keys) {
    const items: SavedPoll[] = JSON.parse(
      (await AsyncStorage.getItem(key)) || "[]",
    );
    await AsyncStorage.setItem(
      key,
      JSON.stringify(items.filter((item) => item.id !== id)),
    );
  }
}
