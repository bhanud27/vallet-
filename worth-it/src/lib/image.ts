import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { AppError, PickedPhoto } from './types';

export const MAX_POLL_PHOTO_MB = 15;
export const MAX_POLL_PHOTO_PIXELS = 60_000_000;
const MAX_POLL_PHOTO_BYTES = MAX_POLL_PHOTO_MB * 1024 * 1024;

async function withDownloadedProductPhoto<T>(url: string, consume: (source: string) => Promise<T>) {
  const cancel = new AbortController();
  const timeout = setTimeout(() => cancel.abort(), 8000);
  let localUrl: string | undefined;
  let file: File | undefined;
  try {
    const response = await expoFetch(url, { credentials: 'omit', redirect: 'error', signal: cancel.signal });
    const type = response.headers.get('content-type')?.split(';')[0].toLowerCase();
    if (!response.ok || !response.body || !type || !/^image\/(?:jpeg|png|webp|avif|gif)$/.test(type) ||
      Number(response.headers.get('content-length')) > MAX_POLL_PHOTO_BYTES) throw new Error('Invalid photo');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_POLL_PHOTO_BYTES) throw new Error('Photo too large');
      chunks.push(value);
    }
    if (!size) throw new Error('Empty photo');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (Platform.OS === 'web') localUrl = URL.createObjectURL(new Blob([bytes], { type }));
    else {
      file = new File(Paths.cache, `product-${randomUUID()}.${type.split('/')[1]}`);
      file.create();
      await file.write(bytes);
      localUrl = file.uri;
    }
  } catch {
    throw new AppError('upload_failed', 'This product photo could not be downloaded. Replace it or remove it and try again.');
  } finally {
    clearTimeout(timeout);
    cancel.abort();
    if (!localUrl && file?.exists) file.delete();
  }
  try { return await consume(localUrl); }
  finally {
    if (file?.exists) file.delete();
    else if (Platform.OS === 'web') URL.revokeObjectURL(localUrl);
  }
}

async function withSource<T>(uri: string, consume: (source: string) => Promise<T>) {
  if (/^https:\/\//i.test(uri)) return withDownloadedProductPhoto(uri, consume);
  const inline = Platform.OS !== 'web' ? /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(uri) : null;
  const temporary = inline ? new File(Paths.cache, `product-${randomUUID()}.${inline[1]}`) : null;
  try {
    if (inline && temporary) {
      temporary.create();
      await temporary.write(inline[2], { encoding: 'base64' });
    }
    return await consume(temporary?.uri ?? uri);
  } finally {
    if (temporary?.exists) temporary.delete();
  }
}

/** Small JPEGs for avatars and the legacy storage adapter. */
export function prepareImage(uri: string, maxWidth: number, withBase64: boolean) {
  return withSource(uri, async (source) => {
    const context = ImageManipulator.manipulate(source, { maxWidth });
    try {
      const image = await context.renderAsync();
      try { return await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: withBase64 }); }
      finally { image.release(); }
    } finally { context.release(); }
  });
}

function checkPhotoDimensions(width?: number, height?: number) {
  if (width && height && width * height > MAX_POLL_PHOTO_PIXELS) {
    throw new AppError('upload_failed', 'Choose a photo up to 60 megapixels.');
  }
}

/** Re-encode without resizing to keep the image dimensions and remove camera metadata. */
export function withFullSizePhoto<T>(photo: PickedPhoto, consume: (uri: string, blob?: Blob) => Promise<T>) {
  checkPhotoDimensions(photo.width, photo.height);
  return withSource(photo.uri, async (source) => {
    const context = ImageManipulator.manipulate(source);
    try {
      const image = await context.renderAsync();
      try {
        checkPhotoDimensions(image.width, image.height);
        for (const quality of [0.94, 0.88, 0.80, 0.72]) {
          const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
          const onWeb = Platform.OS === 'web';
          const file = onWeb ? null : new File(saved.uri);
          try {
            const blob = onWeb ? await (await fetch(saved.uri)).blob() : undefined;
            const size = blob?.size ?? file?.size ?? 0;
            if (size > 0 && size <= MAX_POLL_PHOTO_BYTES) return await consume(saved.uri, blob);
          } finally {
            if (onWeb && saved.uri.startsWith('blob:')) URL.revokeObjectURL(saved.uri);
            else if (file?.exists) file.delete();
          }
        }
      } finally { image.release(); }
    } finally { context.release(); }
    throw new AppError('upload_failed', `This photo could not fit within ${MAX_POLL_PHOTO_MB} MB at its original size. Choose a smaller file.`);
  });
}

export async function toDataUri(photo: { uri: string }): Promise<string> {
  const r = await prepareImage(photo.uri, 900, true);
  if (!r.base64) throw new Error('No image data');
  return `data:image/jpeg;base64,${r.base64}`;
}
