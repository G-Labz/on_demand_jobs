import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { getActiveRequesterJobs } from '@/services/jobService';
import { getRequesterLocations } from '@/services/locationService';
import { getUserProfile } from '@/services/profileService';

export default function RequesterDashboard() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [locationCount, setLocationCount] = useState<number | null>(null);
  const [activeJobCount, setActiveJobCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [profile, locations, activeJobs] = await Promise.all([
        getUserProfile(user.id),
        getRequesterLocations(user.id),
        getActiveRequesterJobs(user.id),
      ]);
      setDisplayName(profile?.display_name ?? null);
      setLocationCount(locations.length);
      setActiveJobCount(activeJobs.length);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your dashboard.');
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      Alert.alert('Sign out failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSigningOut(false);
    }
  }

  const hasLocations = (locationCount ?? 0) > 0;

  return (
    <ScreenContainer>
      <View style={styles.topBar}>
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>
            {displayName ? `Hi, ${displayName}` : 'Welcome back'}
          </Text>
          <Text style={styles.role}>Requester Dashboard</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={handleSignOut}
          disabled={signingOut}
          hitSlop={8}
        >
          <Text style={styles.signOut}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} hitSlop={8}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Primary requester action: posting a cleaning job. */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>CLEANING · NORTHEAST OHIO</Text>
        <Text style={styles.heroTitle}>Post a cleaning job</Text>
        <Text style={styles.heroSubtitle}>
          STR turnover or home cleaning — post it and get a verified worker dispatched.
        </Text>

        {hasLocations ? (
          <AppButton
            label="Post Job"
            accentColor={colors.requester}
            onPress={() => router.push('/(requester)/locations')}
          />
        ) : (
          <>
            <AppButton
              label="Add Location"
              accentColor={colors.requester}
              onPress={() => router.push('/(requester)/locations/new')}
            />
            <Text style={styles.heroHint}>
              Add your first location to start posting cleaning jobs.
            </Text>
          </>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{locationCount ?? '—'}</Text>
          <Text style={styles.statLabel}>Saved Locations</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{activeJobCount ?? '—'}</Text>
          <Text style={styles.statLabel}>Active Jobs</Text>
        </View>
      </View>

      {hasLocations ? (
        <Pressable
          accessibilityRole="button"
          style={styles.linkRow}
          onPress={() => router.push('/(requester)/locations')}
        >
          <Text style={styles.linkText}>View Saved Locations</Text>
          <Text style={styles.linkChevron}>›</Text>
        </Pressable>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  greetingBlock: { gap: spacing.xs },
  greeting: { ...typography.title, color: colors.text },
  role: { ...typography.caption, color: colors.textSecondary },
  signOut: { ...typography.label, color: colors.requester },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  errorText: { ...typography.caption, color: colors.danger, flex: 1 },
  retry: { ...typography.label, color: colors.danger },
  hero: {
    backgroundColor: colors.requesterMuted,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  heroLabel: { ...typography.caption, color: colors.primaryDark, letterSpacing: 0.5 },
  heroTitle: { ...typography.display, color: colors.text },
  heroSubtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  heroHint: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  statValue: { ...typography.display, color: colors.text },
  statLabel: { ...typography.caption, color: colors.textSecondary },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  linkText: { ...typography.bodyStrong, color: colors.text },
  linkChevron: { ...typography.title, color: colors.textMuted },
});
