import AsyncStorage from "@react-native-async-storage/async-storage";
import { createDraftStore } from "./draftStore";
import { withFullSizePhoto } from "./image";
import {
  openDevicePhoto,
  openDeviceVideo,
  saveDevicePhoto,
  saveDeviceVideo,
  removeDevicePhoto,
  removeDeviceVideo,
} from "./socialVideo";

export function pollDraftStore(
  owner: string,
  kind: "poll" | "post" | "shared-product" = "poll",
) {
  const key = "worthit:" + kind + "-draft:v1:" + owner;
  const id = (media: { id: string }) =>
    "draft-" + kind + "-" + owner + "-" + media.id;
  return createDraftStore({
    read: () => AsyncStorage.getItem(key),
    write: (value) => AsyncStorage.setItem(key, value),
    remove: () => AsyncStorage.removeItem(key),
    persist: (item) =>
      item.kind === "video"
        ? saveDeviceVideo(id(item), item.file)
        : withFullSizePhoto(item.file, (uri, blob) =>
            saveDevicePhoto(id(item), uri, blob),
          ),
    open: (item) =>
      item.kind === "video"
        ? openDeviceVideo(id(item))
        : openDevicePhoto(id(item)),
    erase: (item) =>
      item.kind === "video"
        ? removeDeviceVideo(id(item))
        : removeDevicePhoto(id(item)),
  });
}
