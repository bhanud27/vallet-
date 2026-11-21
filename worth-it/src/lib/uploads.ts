import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Upload, type DetailedError } from 'tus-js-client';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
type Previous = Awaited<ReturnType<Upload['findPreviousUploads']>>[number];
const prefix = 'worthit:tus:';
const storage = {
  async findAllUploads(): Promise<Previous[]> {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix));
    return (await AsyncStorage.multiGet(keys)).flatMap(([key, value]) => {
      try {
        return value ? [{ ...JSON.parse(value), urlStorageKey: key }] : [];
      } catch {
        return [];
      }
    });
  },
  async findUploadsByFingerprint(key: string) {
    return (await this.findAllUploads()).filter((v) => v.urlStorageKey === prefix + key);
  },
  async addUpload(key: string, value: Previous) {
    await AsyncStorage.setItem(prefix + key, JSON.stringify(value));
    return prefix + key;
  },
  async removeUpload(key: string) {
    await AsyncStorage.removeItem(key);
  },
};
export async function uploadMedia(
  client: SupabaseClient,
  bucket: string,
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
  signal?: AbortSignal,
  onProgress?: (sent: number, total: number) => void,
) {
  const cancelled = () => {
    if (signal?.aborted) throw new Error('Upload paused. Your draft is kept; retry to resume.');
  };
  cancelled();

  const owner = path.split('/')[0];
  const {
    data: { session },
  } = await client.auth.getSession();
  if (session?.user.id !== owner)
    throw new Error('Account changed. Sign in again before uploading.');
  if (bytes.byteLength <= 6 * 1024 * 1024) {
    const result = await client.storage
      .from(bucket)
      .upload(path, bytes, { contentType, upsert: false });
    cancelled();
    return result;
  }
  const project = new URL(client.storage.from(bucket).getPublicUrl(path).data.publicUrl);
  if (project.hostname.endsWith('.supabase.co'))
    project.hostname = project.hostname.replace('.supabase.co', '.storage.supabase.co');
  const projectUrl = project.origin;
  let temporary: File | undefined;
  const input =
    Platform.OS === 'web'
      ? new Blob([bytes], { type: contentType })
      : (() => {
          temporary = new File(Paths.cache, 'upload-' + path.split('/').pop());
          temporary.write(new Uint8Array(bytes));
          return { uri: temporary.uri, name: path.split('/').pop(), type: contentType };
        })();
  try {
    await new Promise<void>((resolve, reject) => {
      let ended = false;
      let resumed: Previous | undefined;
      let restarted = false;
      const finish = (error?: Error) => {
        if (ended) return;
        ended = true;
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve();
      };
      const upload = new Upload(input as Blob, {
        endpoint: projectUrl + '/storage/v1/upload/resumable',
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000],
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        urlStorage: storage,
        fingerprint: async () => owner + ':' + bucket + ':' + path + ':' + bytes.byteLength,
        metadata: { bucketName: bucket, objectName: path, contentType, cacheControl: '3600' },
        onBeforeRequest: async (request) => {
          if (new URL(request.getURL()).origin !== projectUrl)
            throw new Error('Unexpected upload host.');
          cancelled();
          const {
            data: { session: current },
          } = await client.auth.getSession();
          if (current?.user.id !== owner) throw new Error('Account changed.');
          request.setHeader('Authorization', 'Bearer ' + current.access_token);
          request.setHeader('x-upsert', 'false');
        },
        onProgress,
        onError: (error) => {
          const status = (error as DetailedError).originalResponse?.getStatus();
          if (resumed && !restarted && (status === 404 || status === 410)) {
            restarted = true;
            void storage
              .removeUpload(resumed.urlStorageKey)
              .then(() => {
                if (ended) return;
                upload.url = null;
                cancelled();
                upload.start();
              })
              .catch(finish);
          } else finish(error);
        },
        onSuccess: () => finish(),
      });
      const abort = () => {
        void upload
          .abort(false)
          .then(
            () => finish(new Error('Upload paused. Your draft is kept; retry to resume.')),
            finish,
          );
      };
      signal?.addEventListener('abort', abort, { once: true });
      void upload
        .findPreviousUploads()
        .then((previous) => {
          if (ended) return;
          resumed = previous.find((value) => {
            try {
              return (
                !!value.uploadUrl &&
                new URL(value.uploadUrl).origin === projectUrl &&
                Date.parse(value.creationTime) > Date.now() - 23 * 3600000
              );
            } catch {
              return false;
            }
          });
          if (resumed) upload.resumeFromPreviousUpload(resumed);
          cancelled();
          upload.start();
        })
        .catch(finish);
    });
    return { data: { path }, error: null };
  } finally {
    if (temporary?.exists) temporary.delete();
  }
}
