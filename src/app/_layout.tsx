import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import type { Href } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { AuthProvider } from '@/context/AuthProvider';
import { useAuth } from '@/hooks/useAuth';
import type { ProfileCompletionState } from '@/types/profiles';

type RouteTarget = { group: string; href: string };

/**
 * Single source of truth for "where should this user be?" given their session
 * and profile-completion snapshot.
 */
function resolveRoute(
  session: Session | null,
  profileState: ProfileCompletionState | null,
): RouteTarget {
  if (!session) {
    return { group: '(auth)', href: '/welcome' };
  }
  if (!profileState || profileState.role === null) {
    return { group: '(onboarding)', href: '/role-selection' };
  }

  const needsSetup = !profileState.profileCompleted || !profileState.hasRoleProfile;

  if (profileState.role === 'requester') {
    return needsSetup
      ? { group: '(onboarding)', href: '/requester-profile-setup' }
      : { group: '(requester)', href: '/(requester)/dashboard' };
  }

  // worker
  return needsSetup
    ? { group: '(onboarding)', href: '/worker-profile-setup' }
    : { group: '(worker)', href: '/(worker)/dashboard' };
}

/**
 * Centralized route guard. Redirects whenever the active route group no longer
 * matches where the user should be. Screens handle steps *within* a group.
 */
function useRouteGuard() {
  const { initializing, loadingProfile, session, profileState, error } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Wait until we actually know the auth + profile state.
    if (initializing || loadingProfile) return;

    // Surface profile-load failures on the boot screen (index), which has retry.
    if (error) {
      if (segments.length > 0) router.replace('/');
      return;
    }

    const target = resolveRoute(session, profileState);
    const currentGroup = segments[0];
    if (currentGroup !== target.group) {
      router.replace(target.href as Href);
    }
  }, [initializing, loadingProfile, session, profileState, error, segments, router]);
}

function RootNavigator() {
  useRouteGuard();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(requester)" />
      <Stack.Screen name="(worker)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
