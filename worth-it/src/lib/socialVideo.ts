import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export const MAX_REEL_BYTES = 20 * 1024 * 1024;

export interface SelectedVideo {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number;
  file?: Blob;
}

export interface VideoHandle {
  uri: string;
  release?: () => void;
}

export function validateSelectedVideo(video: SelectedVideo) {
  const name = video.fileName || video.uri.split(/[?#]/)[0];
  if (video.mimeType !== 'video/mp4' && !/\.mp4$/i.test(name)) {
    throw new Error('Choose an MP4 video.');
  }
  if (video.fileSize !== undefined && (video.fileSize <= 0 || video.fileSize > MAX_REEL_BYTES)) {
    throw new Error('Choose a video under 20 MB.');
  }
}

function checkSize(size: number) {
  if (size <= 0 || size > MAX_REEL_BYTES) throw new Error('Choose a video under 20 MB.');
}

async function selectedBlob(video: SelectedVideo) {
  if (video.file) return video.file;
  const response = await fetch(video.uri);
  if (!response.ok) throw new Error('Could not read the selected video.');
  return response.blob();
}

export async function readVideoBytes(video: SelectedVideo) {
  validateSelectedVideo(video);
  if (Platform.OS === 'web') {
    const blob = await selectedBlob(video);
    checkSize(blob.size);
    return blob.arrayBuffer();
  }
  const file = new File(video.uri);
  checkSize(file.size);
  return file.arrayBuffer();
}

async function withMediaStore<T>(name: 'reel-videos' | 'poll-images', mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('worthit-media', 2);
    open.onupgradeneeded = () => {
      for (const key of ['reel-videos', 'poll-images']) {
        if (!open.result.objectStoreNames.contains(key)) open.result.createObjectStore(key);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(name, mode);
      const request = action(transaction.objectStore(name));
      transaction.oncomplete = () => { database.close(); resolve(request.result); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  });
}

const deviceVideo = (id: string) => new File(Paths.document, 'worth-it-reels', `${id}.mp4`);

export async function saveDeviceVideo(id: string, video: SelectedVideo) {
  validateSelectedVideo(video);
  if (Platform.OS === 'web') {
    const blob = await selectedBlob(video);
    checkSize(blob.size);
    await withMediaStore('reel-videos', 'readwrite', (store) => store.put(blob, id));
    return;
  }
  const selected = new File(video.uri);
  checkSize(selected.size);
  new Directory(Paths.document, 'worth-it-reels').create({ idempotent: true, intermediates: true });
  await selected.copy(deviceVideo(id));
}

async function openDeviceMedia(id: string, kind: 'image' | 'video'): Promise<VideoHandle> {
  if (Platform.OS === 'web') {
    const blob = await withMediaStore<Blob | undefined>(kind === 'video' ? 'reel-videos' : 'poll-images', 'readonly', (store) => store.get(id));
    if (!blob) throw new Error('This media item is missing from this browser.');
    const uri = URL.createObjectURL(blob);
    return { uri, release: () => URL.revokeObjectURL(uri) };
  }
  const stored = kind === 'video' ? deviceVideo(id) : devicePhoto(id);
  if (!stored.exists) throw new Error('This media item is missing from this device.');
  return { uri: stored.uri };
}

async function removeDeviceMedia(id: string, kind: 'image' | 'video') {
  if (Platform.OS === 'web') {
    await withMediaStore(kind === 'video' ? 'reel-videos' : 'poll-images', 'readwrite', (store) => store.delete(id));
    return;
  }
  const stored = kind === 'video' ? deviceVideo(id) : devicePhoto(id);
  if (stored.exists) stored.delete();
}

const devicePhoto = (id: string) => new File(Paths.document, 'worth-it-poll-images', `${id}.jpg`);

export async function saveDevicePhoto(id: string, preparedUri: string) {
  if (Platform.OS === 'web') {
    const blob = await selectedBlob({ uri: preparedUri });
    await withMediaStore('poll-images', 'readwrite', (store) => store.put(blob, id));
    return;
  }
  new Directory(Paths.document, 'worth-it-poll-images').create({ idempotent: true, intermediates: true });
  await new File(preparedUri).copy(devicePhoto(id));
}

export const openDeviceVideo = (id: string) => openDeviceMedia(id, 'video');
export const openDevicePhoto = (id: string) => openDeviceMedia(id, 'image');
export const removeDeviceVideo = (id: string) => removeDeviceMedia(id, 'video');
export const removeDevicePhoto = (id: string) => removeDeviceMedia(id, 'image');
