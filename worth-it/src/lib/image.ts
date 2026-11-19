import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Re-encodes the photo as a resized JPEG. Re-encoding drops EXIF metadata (including GPS location),
 * which matters because anyone with the link can see the photo.
 */
export async function prepareImage(uri: string, maxWidth: number, withBase64: boolean) {
  const inline = Platform.OS !== 'web' ? /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(uri) : null;
  const temporary = inline ? new File(Paths.cache, `product-${randomUUID()}.${inline[1]}`) : null;
  try {
    if (inline && temporary) {
      temporary.create();
      await temporary.write(inline[2], { encoding: 'base64' });
    }
    const source = temporary?.uri ?? uri;
    const first = await ImageManipulator.manipulate(source).renderAsync();
    const ref = first.width > maxWidth ? await ImageManipulator.manipulate(source).resize({ width: maxWidth }).renderAsync() : first;
    return await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: withBase64 });
  } finally {
    if (temporary?.exists) temporary.delete();
  }
}

export async function toDataUri(photo: { uri: string }): Promise<string> {
  const r = await prepareImage(photo.uri, 900, true);
  if (!r.base64) throw new Error('No image data');
  return `data:image/jpeg;base64,${r.base64}`;
}
