import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { config } from './config';
import { toDataUri, withFullSizePhoto } from './image';
import { createLocalRepo } from './localRepo';
import { supabase } from './supabase';
import { createSupabaseRepo } from './supabaseRepo';
import { readVideoBytes, removeDevicePhoto, removeDeviceVideo, saveDevicePhoto, saveDeviceVideo } from './socialVideo';
import type { Repo } from './types';

export const repo: Repo =
  config.hasSupabase && supabase
    ? createSupabaseRepo({
        client: supabase,
        uuid: randomUUID,
        prepareVideo: readVideoBytes,
        prepareUpload: (photo) => withFullSizePhoto(photo, async (uri, blob) => (
          { bytes: await (blob ?? new File(uri)).arrayBuffer() }
        )),
      })
    : createLocalRepo({
        kv: AsyncStorage, prepareImage: toDataUri, uuid: randomUUID,
        storeMedia: async (id, item) => {
          if (item.kind === 'video') return saveDeviceVideo(id, item.file);
          await withFullSizePhoto(item.file, (uri, blob) => saveDevicePhoto(id, uri, blob));
        },
        removeMedia: (id, kind) => kind === 'video' ? removeDeviceVideo(id) : removeDevicePhoto(id),
      });
