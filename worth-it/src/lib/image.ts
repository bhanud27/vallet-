import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { AppError, PickedPhoto } from './types';

export const MAX_POLL_PHOTO_MB = 15;
export const MAX_POLL_PHOTO_PIXELS = 60_000_000;
const MAX_POLL_PHOTO_BYTES = MAX_POLL_PHOTO_MB * 1024 * 1024;

async function withSource<T>(uri: string, consume: (source: string) => Promise<T>) {
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
