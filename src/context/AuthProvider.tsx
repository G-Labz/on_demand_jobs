/**
 * Centralized auth + profile state.
 *
 * Holds the Supabase session and the user's profile-completion snapshot so the
 * route guard (and any screen) can read auth state from one place instead of
 * each screen running its own queries.
 */
import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import { getProfileCompletionState } from '@/services/profileService';
import type { ProfileCompletionState } from '@/types/profiles';

export interface AuthContextValue {
  /** First session check in progress (before we know if anyone is logged in). */
  initializing: boolean;
  /** Profile completion state is being (re)loaded. */
  loadingProfile: boolean;
  session: Session | null;
  user: User | null;
  profileState: ProfileCompletionState | null;
  /** Set when the profile lookup fails — the guard shows a retry screen. */
  error: string | null;
  /** Re-read the session and profile state (used after auth actions / retry). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profileState, setProfileState] = useState<ProfileCompletionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user?.id ?? null;

  // Derived: we're loading the profile when a user is signed in but their loaded
  // snapshot isn't for that user yet (and no error). Deriving this instead of
  // tracking a separate state avoids an extra synchronous setState in the effect.
  const loadingProfile =
    userId !== null && profileState?.userId !== userId && error === null;

  // All setState happens after the first await, so nothing runs synchronously
  // when this is kicked off from the effect below.
  const loadProfile = useCallback(async (id: string) => {
    try {
      const state = await getProfileCompletionState(id);
      setProfileState(state);
      setError(null);
    } catch (e) {
      setProfileState(null);
      setError(e instanceof Error ? e.message : 'Could not load your profile.');
    }
  }, []);

  // Single source of session changes. onAuthStateChange emits INITIAL_SESSION on
  // mount (with the persisted session, or null), so it also covers startup — no
  // separate getSession() effect needed. State is set inside the subscription
  // callback, which (unlike an effect body) is the intended place to call setState.
  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);

      if (newSession?.user) {
        // Defer Supabase calls out of the auth callback to avoid potential deadlocks.
        const id = newSession.user.id;
        setTimeout(() => {
          if (mounted) void loadProfile(id);
        }, 0);
      } else {
        setProfileState(null);
        setError(null);
      }

      setInitializing(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session?.user) {
      await loadProfile(data.session.user.id);
    } else {
      setProfileState(null);
      setError(null);
    }
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      throw new Error(signOutError.message || 'Could not sign out. Please try again.');
    }
    // onAuthStateChange will also fire, but clear eagerly for a snappy transition.
    setSession(null);
    setProfileState(null);
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      loadingProfile,
      session,
      user: session?.user ?? null,
      profileState,
      error,
      refresh,
      signOut,
    }),
    [initializing, loadingProfile, session, profileState, error, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
