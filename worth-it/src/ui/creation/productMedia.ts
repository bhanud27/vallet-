import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import type { CreationMedia, ProductDraft } from "../../lib/creationDraft";
import { MAX_POLL_PHOTO_MB, MAX_POLL_PHOTO_PIXELS } from "../../lib/image";
import { validateSelectedVideo } from "../../lib/socialVideo";

export type UpdateProduct = (
  change: (
    product: ProductDraft,
    media: CreationMedia[],
  ) => [ProductDraft, CreationMedia[]],
) => void;

export const mediaFor = (product: ProductDraft, media: CreationMedia[]) =>
  product.mediaIds.flatMap((id) => {
    const item = media.find((m) => m.id === id);
    return item ? [item] : [];
  });

export async function pickMedia(
  limit: number,
  video = false,
): Promise<CreationMedia[]> {
  const selected = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: video ? ["images", "videos"] : ["images"],
    allowsMultipleSelection: limit > 1,
    orderedSelection: true,
    selectionLimit: limit,
    quality: 1,
  });
  if (selected.canceled) return [];
  return selected.assets.slice(0, limit).map((asset) => {
    const id = randomUUID();
    if (asset.type === "video") {
      validateSelectedVideo(asset);
      return { id, kind: "video", file: asset };
    }
    if (
      (asset.fileSize ?? 0) > MAX_POLL_PHOTO_MB * 1024 * 1024 ||
      asset.width * asset.height > MAX_POLL_PHOTO_PIXELS
    )
      throw new Error("Choose photos up to 15 MB and 60 megapixels.");
    return {
      id,
      kind: "image",
      file: {
        uri: asset.uri,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      },
    };
  });
}
