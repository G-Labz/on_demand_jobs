// URL/encoding polyfills required by @supabase/supabase-js in the React Native runtime.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import type { SupportedStorage } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
    !supabaseAnonKey && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ]
    .filter(Boolean)
    .join(', ');

  // Fail loudly and helpfully instead of crashing later with a confusing error.
  throw new Error(
    `[Supabase setup] Missing environment variable(s): ${missing}.\n\n` +
      'This app needs Supabase credentials to run.\n' +
      '  1. Copy the example env file:   cp .env.example .env\n' +
      '  2. Edit .env and set:\n' +
      '       EXPO_PUBLIC_SUPABASE_URL=<your project URL>\n' +
      '       EXPO_PUBLIC_SUPABASE_ANON_KEY=<your anon public key>\n' +
      '  3. Restart the dev server:      npx expo start --clear\n\n' +
      'Both values live in the Supabase dashboard under Project Settings → API.',
  );
}

const isWeb = Platform.OS === 'web';
// `window` is undefined during Expo Router static web / Node evaluation.
const hasWindow = typeof window !== 'undefined';

/**
 * In-memory, no-op storage for server/Node evaluation (e.g. Expo Router static
 * web rendering) where `window`/`localStorage` do not exist. Lets this module be
 * imported without touching browser-only APIs. Nothing is persisted there.
 */
function createMemoryStorage(): SupportedStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

/**
 * Pick a storage + persistence strategy that is safe on every platform:
 *  - native (iOS/Android): AsyncStorage, persisted
 *  - web in a real browser (window present): localStorage, persisted
 *  - server/Node render (no window): in-memory no-op, not persisted
 */
function resolveAuthStorage(): { storage: SupportedStorage; persistSession: boolean } {
  if (!isWeb) {
    return { storage: AsyncStorage, persistSession: true };
  }
  if (hasWindow) {
    return { storage: window.localStorage, persistSession: true };
  }
  return { storage: createMemoryStorage(), persistSession: false };
}

const { storage, persistSession } = resolveAuthStorage();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Pass storage explicitly so Supabase never reaches for `window`/`localStorage`
    // on its own during server evaluation.
    storage,
    autoRefreshToken: true,
    persistSession,
    // No URL-based session detection; deep links are handled by Expo Router.
    detectSessionInUrl: false,
    // processLock works without `navigator.locks`, so it is safe on native and
    // during Node evaluation (avoids the browser-only navigator lock).
    lock: processLock,
  },
});

// Pause/resume token auto-refresh with app focus — native only (no AppState
// behavior needed on web, and this avoids running during server evaluation).
if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
