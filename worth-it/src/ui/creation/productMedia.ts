import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import type { CreationMedia, ProductDraft } from "../../lib/creationDraft";
import { MAX_POLL_PHOTO_MB, MAX_POLL_PHOTO_PIXELS } from "../../lib/image";
import { validateSelectedVideo } from "../../lib/socialVideo";
import type { ProductPhotoSource } from "../../lib/productImportFailure";
import type { PickedPhoto } from "../../lib/types";

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

function photoMedia(file: PickedPhoto, bytes: number): CreationMedia {
  if (
    bytes > MAX_POLL_PHOTO_MB * 1024 * 1024 ||
    (file.width ?? 0) * (file.height ?? 0) > MAX_POLL_PHOTO_PIXELS
  )
    throw new Error("Choose photos up to 15 MB and 60 megapixels.");
  return { id: randomUUID(), kind: "image", file };
}

function pickedPhoto(asset: ImagePicker.ImagePickerAsset) {
  return photoMedia(
    {
      uri: asset.uri,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    },
    asset.fileSize ?? 0,
  );
}

export async function pickProductPhoto(
  source: ProductPhotoSource,
): Promise<CreationMedia | undefined> {
  if (source === "gallery") return (await pickMedia(1))[0];
  if (source === "clipboard") {
    const image = await Clipboard.getImageAsync({ format: "png" });
    if (!image)
      throw new Error(
        "Copy an image to the clipboard, then try pasting it again.",
      );
    const base64 = image.data.slice(image.data.indexOf(",") + 1);
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return photoMedia(
      { uri: image.data, mimeType: "image/png", ...image.size },
      (base64.length * 3) / 4 - padding,
    );
  }
  if (Platform.OS !== "web") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error("Allow camera access to take a product photo.");
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  return result.canceled ? undefined : pickedPhoto(result.assets[0]);
}

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
    if (asset.type === "video") {
      validateSelectedVideo(asset);
      return { id: randomUUID(), kind: "video", file: asset };
    }
    return pickedPhoto(asset);
  });
}
