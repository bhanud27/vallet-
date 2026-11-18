import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { config } from './config';
import { toDataUri, prepareImage } from './image';
import { createLocalRepo } from './localRepo';
import { supabase } from './supabase';
import { createSupabaseRepo } from './supabaseRepo';
import type { Repo } from './types';

export const repo: Repo =
  config.hasSupabase && supabase
    ? createSupabaseRepo({
        client: supabase,
        uuid: randomUUID,
        prepareUpload: async (photo) => {
          const r = await prepareImage(photo.uri, 1280, false);
          const res = await fetch(r.uri);
          return { bytes: await res.arrayBuffer() };
        },
      })
    : createLocalRepo({ kv: AsyncStorage, prepareImage: toDataUri, uuid: randomUUID });
