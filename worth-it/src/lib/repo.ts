import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { config } from './config';
import { toDataUri, prepareImage } from './image';
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
        prepareUpload: async (photo) => {
          const r = await prepareImage(photo.uri, 1280, false);
          const bytes = Platform.OS === 'web' ? await (await fetch(r.uri)).arrayBuffer() : await new File(r.uri).arrayBuffer();
          return { bytes };
        },
      })
    : createLocalRepo({
        kv: AsyncStorage, prepareImage: toDataUri, uuid: randomUUID,
        storeMedia: async (id, item) => {
          if (item.kind === 'video') return saveDeviceVideo(id, item.file);
          const photo = await prepareImage(item.file.uri, 1280, false);
          await saveDevicePhoto(id, photo.uri);
        },
        removeMedia: (id, kind) => kind === 'video' ? removeDeviceVideo(id) : removeDevicePhoto(id),
      });
