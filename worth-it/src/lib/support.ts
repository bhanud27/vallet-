import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { supabase } from "./supabase";
import { withFullSizePhoto } from "./image";
import { uploadMedia } from "./uploads";
import { safetyRpc } from "./safety";
import type { PickedPhoto } from "./types";
export async function reportProblem(
  viewer: string,
  message: string,
  screenshot?: PickedPhoto,
  id = randomUUID(),
) {
  const text = message.trim();
  if (text.length < 5 || text.length > 900)
    throw new Error("Describe the issue in 5 to 900 characters.");
  if (!supabase) {
    await AsyncStorage.setItem(
      "worthit:problem:" + viewer + ":" + id,
      JSON.stringify({
        message: text,
        createdAt: new Date().toISOString(),
        screenshotIncluded: !!screenshot,
      }),
    );
    return { local: true };
  }
  const path = screenshot ? viewer + "/support/" + id + ".jpg" : null;
  if (screenshot && path) {
    await withFullSizePhoto(screenshot, async (uri, blob) => {
      const bytes = blob
        ? await blob.arrayBuffer()
        : await new File(uri).arrayBuffer();
      const result = await uploadMedia(
        supabase!,
        "poll-photos",
        path,
        bytes,
        "image/jpeg",
      );
      if (
        result.error &&
        result.error.message !== "The resource already exists"
      )
        throw new Error("Could not upload screenshot. Try again or remove it.");
    });
  }
  await safetyRpc("worthit_report_problem", {
    p_id: id,
    p_message: text,
    p_screenshot: path,
  });
  return { local: false };
}
export function approvedUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
