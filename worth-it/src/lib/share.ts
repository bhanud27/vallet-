import { Platform } from 'react-native';
import { config } from './config';

/** The unlisted link for a poll. On web it is the page's own origin; on native it needs EXPO_PUBLIC_WEB_URL. */
export function pollLink(id: string): { url: string; reachable: boolean } {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const origin = config.webUrl || window.location.origin;
    const isLocalhost = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])/.test(origin);
    return { url: `${origin}/p/${id}`, reachable: !isLocalhost };
  }
  if (config.webUrl) return { url: `${config.webUrl}/p/${id}`, reachable: true };
  return { url: `worthit://p/${id}`, reachable: false };
}
