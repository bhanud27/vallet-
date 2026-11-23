import { Platform } from "react-native";
import {
  isAndroidSharePath,
  productShareInbox,
} from "../lib/incomingProductShare";
import { readAndroidProductShare } from "../lib/readAndroidProductShare";

export async function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  if (Platform.OS !== "android" || !isAndroidSharePath(path)) return path;
  try {
    await readAndroidProductShare();
  } catch {
    if (!productShareInbox.getSnapshot())
      productShareInbox.receive([{ shareType: "text" }]);
  }
  // The inbox waits for the existing auth guard and navigator before opening Create.
  return initial ? "/" : null;
}
