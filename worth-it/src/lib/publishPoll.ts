import { normalizeProductDetails } from "./productDetails";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NewPollInput,
  NewPollMedia,
  PollMedia,
  PublishProgress,
} from "./types";

const fields =
  "id, item_name, price_inr, question, image_path, demo_image, is_demo, created_at";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function publishPoll(
  client: SupabaseClient,
  input: NewPollInput,
  owner: string,
  requestId: string,
  prepare: (item: NewPollMedia) => Promise<ArrayBuffer>,
  onProgress?: (value: PublishProgress) => void,
  thumbnail?: (item: NewPollMedia) => Promise<ArrayBuffer>,
  upload?: (
    bucket: string,
    path: string,
    bytes: ArrayBuffer,
    type: string,
    onBytes: (sent: number, total: number) => void,
  ) => Promise<{ error: unknown }>,
) {
  if (!uuidPattern.test(requestId))
    throw new Error("Invalid publishing identifier.");
  const attachments: NewPollMedia[] = input.media?.length
    ? input.media
    : input.photo
      ? [{ kind: "image", file: input.photo }]
      : [];
  const progress = (stage: PublishProgress["stage"], completed: number) =>
    onProgress?.({ stage, completed, total: attachments.length });
  async function findSaved() {
    const result = await client
      .from("polls")
      .select(fields)
      .eq("id", requestId)
      .eq("author_id", owner)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }
  // A previous request may have committed even when the device saw a timeout.
  const saved = await findSaved();
  if (saved) {
    progress("completed", attachments.length);
    return saved;
  }
  const gallery: PollMedia[] = [];
  for (const [index, item] of attachments.entries()) {
    if (input.signal?.aborted)
      throw new Error("Upload paused. Your draft is kept.");
    const id =
      item.id ||
      requestId.slice(0, 24) +
        (BigInt("0x" + requestId.slice(24)) ^ BigInt(index))
          .toString(16)
          .padStart(12, "0");
    if (!uuidPattern.test(id)) throw new Error("Invalid media identifier.");
    const file = id + (item.kind === "video" ? ".mp4" : ".jpg");
    const value = owner + "/" + file;
    const bucket = client.storage.from(
      item.kind === "video" ? "social-media" : "poll-photos",
    );
    const existing = await bucket.list(owner, { search: file, limit: 100 });
    if (existing.error) throw existing.error;
    if (!existing.data?.some((entry) => entry.name === file)) {
      progress("preparing", index);
      const bytes = await prepare(item);
      progress("uploading", index);
      const contentType = item.kind === "video" ? "video/mp4" : "image/jpeg";
      const result = upload
        ? await upload(
            item.kind === "video" ? "social-media" : "poll-photos",
            value,
            bytes,
            contentType,
            (bytesSent, bytesTotal) =>
              onProgress?.({
                stage: "uploading",
                completed: index,
                total: attachments.length,
                bytesSent,
                bytesTotal,
              }),
          )
        : await bucket.upload(value, bytes, { contentType, upsert: false });
      if (result.error) {
        // A concurrent retry or a lost upload acknowledgement can produce a conflict.
        const check = await bucket.list(owner, { search: file, limit: 100 });
        if (check.error || !check.data?.some((entry) => entry.name === file))
          throw result.error;
      }
    }
    let thumbnailPath: string | undefined;
    if (item.kind === "image" && thumbnail) {
      thumbnailPath = owner + "/thumbnails/" + file;
      const thumbs = await bucket.list(owner + "/thumbnails", {
        search: file,
        limit: 100,
      });
      if (thumbs.error) throw thumbs.error;
      if (!thumbs.data?.some((entry) => entry.name === file)) {
        const thumb = await bucket.upload(
          thumbnailPath,
          await thumbnail(item),
          {
            contentType: "image/jpeg",
            upsert: false,
          },
        );
        if (thumb.error) {
          const check = await bucket.list(owner + "/thumbnails", {
            search: file,
            limit: 100,
          });
          if (check.error || !check.data?.some((entry) => entry.name === file))
            throw thumb.error;
        }
      }
    }
    gallery.push({
      ...(thumbnailPath ? { thumbnail: thumbnailPath } : {}),
      kind: item.kind,
      value,
      ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
    });
    progress("uploading", index + 1);
  }
  if (input.signal?.aborted)
    throw new Error("Upload paused. Your draft is kept.");
  progress("publishing", attachments.length);
  const result = await client
    .from("polls")
    .insert({
      id: requestId,
      author_id: owner,
      item_name: input.itemName.trim(),
      price_inr:
        input.contentKind === "post" || (input.creationSpec && !input.priceInr)
          ? null
          : input.priceInr,
      ...(input.creationSpec ? { creation_spec: input.creationSpec } : {}),
      ...(input.contentKind === "post" ? { content_type: "post" } : {}),
      question: input.question.trim(),
      ...(input.productDetails
        ? { product_details: normalizeProductDetails(input.productDetails) }
        : {}),
      image_path: gallery.find((item) => item.kind === "image")?.value ?? null,
      media_gallery: gallery,
      ...(input.productUrl ? { product_url: input.productUrl } : {}),
      ...(input.importSource ? { import_source: input.importSource } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.useCase?.trim() ? { use_case: input.useCase.trim() } : {}),
      ...(input.priority?.trim() ? { priority: input.priority.trim() } : {}),
      ...(input.budgetInr ? { budget_inr: input.budgetInr } : {}),
    })
    .select(fields)
    .single();
  if (result.error) {
    const recovered = await findSaved();
    if (recovered) {
      progress("completed", attachments.length);
      return recovered;
    }
    throw result.error;
  }
  progress("completed", attachments.length);
  return result.data;
}
// Deliberately never delete media on an uncertain error. Stable paths are reused
// on retry. The server cleanup command inspects old, unreferenced uploads separately.
