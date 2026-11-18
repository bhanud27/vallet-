import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Re-encodes the photo as a resized JPEG. Re-encoding drops EXIF metadata (including GPS location),
 * which matters because anyone with the link can see the photo.
 */
export async function prepareImage(uri: string, maxWidth: number, withBase64: boolean) {
  const ctx = ImageManipulator.manipulate(uri);
  const first = await ctx.renderAsync();
  const ref = first.width > maxWidth ? await ImageManipulator.manipulate(uri).resize({ width: maxWidth }).renderAsync() : first;
  return ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: withBase64 });
}

export async function toDataUri(photo: { uri: string }): Promise<string> {
  const r = await prepareImage(photo.uri, 900, true);
  if (!r.base64) throw new Error('No image data');
  return `data:image/jpeg;base64,${r.base64}`;
}
