import { productShareInbox } from "./incomingProductShare";

/** Only used by Android callers. Reading raw data leaves URL resolution to the importer. */
export async function readAndroidProductShare() {
  const { clearSharedPayloads, getSharedPayloads } =
    await import("expo-sharing");
  const payloads = getSharedPayloads();
  if (!payloads.length) return;
  try {
    clearSharedPayloads();
  } catch {
    // The text was already read even if clearing the native cache failed.
  }
  productShareInbox.receive(payloads);
}
