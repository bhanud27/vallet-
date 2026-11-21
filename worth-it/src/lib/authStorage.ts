import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
let writes = Promise.resolve();
const safe = (key: string) => key.replace(/[^a-zA-Z0-9_.-]/g, '_');
async function nativeRead(key: string) {
  const manifest = await SecureStore.getItemAsync(safe(key));
  if (!manifest) return null;
  const { version, count } = JSON.parse(manifest) as { version: string; count: number };
  if (!Number.isInteger(count) || count < 1 || count > 256)
    throw new Error('Invalid secure session.');
  const chunks = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      SecureStore.getItemAsync(safe(key) + '.' + version + '.' + i),
    ),
  );
  return chunks.every((v) => v !== null) ? chunks.join('') : null;
}
async function nativeWrite(key: string, value: string | null) {
  const base = safe(key),
    old = await SecureStore.getItemAsync(base);
  if (value === null) {
    await SecureStore.deleteItemAsync(base);
  } else {
    const chars = Array.from(value);
    if (chars.length > 128000) throw new Error('Session exceeds protected storage limit.');
    const version = Date.now().toString(36) + Math.random().toString(36).slice(2),
      count = Math.max(1, Math.ceil(chars.length / 500));
    for (let i = 0; i < count; i++)
      await SecureStore.setItemAsync(
        base + '.' + version + '.' + i,
        chars.slice(i * 500, (i + 1) * 500).join(''),
      );
    await SecureStore.setItemAsync(base, JSON.stringify({ version, count }));
  }
  if (old) {
    const previous = JSON.parse(old);
    await Promise.allSettled(
      Array.from({ length: Math.min(previous.count, 256) }, (_, i) =>
        SecureStore.deleteItemAsync(base + '.' + previous.version + '.' + i),
      ),
    );
  }
  await AsyncStorage.removeItem(key);
}
function write(key: string, value: string | null) {
  const job = writes.then(() => nativeWrite(key, value));
  writes = job.catch(() => {});
  return job;
}
export const authStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    await writes;
    const value = await nativeRead(key);
    if (value !== null) return value;
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) await write(key, legacy);
    return legacy;
  },
  setItem: (key: string, value: string) =>
    Platform.OS === 'web' ? AsyncStorage.setItem(key, value) : write(key, value),
  removeItem: (key: string) =>
    Platform.OS === 'web' ? AsyncStorage.removeItem(key) : write(key, null),
};
