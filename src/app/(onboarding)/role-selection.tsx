import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { RoleCard } from '@/components/RoleCard';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { isUniqueViolation } from '@/services/errors';
import { createUserProfile } from '@/services/profileService';
import type { UserRole } from '@/types/profiles';

export default function RoleSelection() {
  const router = useRouter();
  const { user, refresh } = useAuth();

  const [selected, setSelected] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (!selected) {
      setError('Choose how you’ll use the app to continue.');
      return;
    }
    if (!user) {
      setError('Your session expired. Please log in again.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      try {
        await createUserProfile(user.id, selected);
      } catch (err) {
        // A row may already exist (e.g. retry) — that's fine, keep going.
        if (!isUniqueViolation(err)) {
          throw err;
        }
      }
      await refresh();
      router.replace(
        selected === 'requester' ? '/requester-profile-setup' : '/worker-profile-setup',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your role.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>How will you use the app?</Text>
        <Text style={styles.subtitle}>
          Pick the side that fits you now. You can add the other later.
        </Text>
      </View>

      <View style={styles.cards}>
        <RoleCard
          icon="🙋"
          title="I Need Help"
          description="Post paid jobs and manage your locations as a Requester."
          selected={selected === 'requester'}
          onPress={() => setSelected('requester')}
          accentColor={colors.requester}
        />
        <RoleCard
          icon="🧰"
          title="I Want Gigs"
          description="Go online, pick up nearby jobs, and get paid as a Worker."
          selected={selected === 'worker'}
          onPress={() => setSelected('worker')}
          accentColor={colors.worker}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <AppButton
          label="Continue"
          loading={loading}
          disabled={!selected}
          onPress={handleContinue}
          accentColor={selected === 'worker' ? colors.worker : colors.requester}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  cards: {
    gap: spacing.md,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.lg,
  },
  actions: {
    marginTop: spacing.xl,
  },
});
