import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { config } from './config';

// supabase-js expects a full URL implementation on React Native; browsers already have one.
if (Platform.OS !== 'web') require('react-native-url-polyfill/auto');

export const supabase = config.hasSupabase
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;
