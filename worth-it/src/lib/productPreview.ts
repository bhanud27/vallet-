import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { MAX_POLL_MEDIA } from './types';

export interface ProductImage {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
}

export interface ProductPreview {
  name: string;
  price: number | null;
  images: ProductImage[];
  limited?: boolean;
}

function previewOrigin() {
  const configured = process.env.EXPO_PUBLIC_PRODUCT_IMPORT_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (!__DEV__) return null;
  if (Platform.OS === 'web') return typeof window === 'undefined' ? null : window.location.origin;
  const host = Constants.expoConfig?.hostUri;
  if (!host) return null;
  return new URL(host.includes('://') ? host : `http://${host}`).origin;
}

export function productPhoto(image: ProductImage) {
  return { uri: `data:${image.mimeType};base64,${image.base64}`, mimeType: image.mimeType };
}

export async function getProductPreview(url: string, signal: AbortSignal): Promise<ProductPreview> {
  const origin = previewOrigin();
  if (!origin) throw new Error('Automatic previews are unavailable here.');
  const response = await fetch(`${origin}/api/product-preview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal,
  });
  const body: Partial<ProductPreview> & { error?: string } = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.images) || !body.images.length) {
    throw new Error(body.error || 'The store did not provide an image preview.');
  }
  const images = body.images.filter((image) => image && ['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType) &&
    typeof image.base64 === 'string' && image.base64.length > 0 && image.base64.length <= 2_800_000).slice(0, MAX_POLL_MEDIA);
  if (!images.length) throw new Error('The store did not provide an image preview.');
  return { images, name: typeof body.name === 'string' ? body.name : '', price: typeof body.price === 'number' ? body.price : null, limited: !!body.limited };
}
