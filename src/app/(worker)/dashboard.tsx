import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { getUserProfile } from '@/services/profileService';

export default function WorkerDashboard() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getUserProfile(user.id)
      .then((profile) => {
        if (active) setDisplayName(profile?.display_name ?? null);
      })
      .catch(() => {
        // Non-critical: greeting just falls back to a generic message.
      });
    return () => {
      active = false;
    };
  }, [user]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      Alert.alert(
        'Sign out failed',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.topBar}>
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>
            {displayName ? `Hi, ${displayName}` : 'Welcome back'}
          </Text>
          <Text style={styles.role}>Worker Dashboard</Text>
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

      {/* Primary worker mechanic: the online switch (DoorDash/Instacart style). */}
      <View style={styles.onlineCard}>
        <View style={styles.onlineStatusRow}>
          <View style={styles.offlineDot} />
          <Text style={styles.onlineStatusText}>You’re offline</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.goOnlineButton}
        >
          <Text style={styles.goOnlineLabel}>Go Online</Text>
        </Pressable>

        <View style={styles.badgeRow}>
          <StatusBadge label="Verification Pending" tone="warning" />
          <StatusBadge label="Worker Tier L1" tone="neutral" />
        </View>
        <Text style={styles.onlineHint}>Live jobs unlock in Sprint 3.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nearby Jobs</Text>
        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderText}>
            Once you’re online, nearby cleaning jobs will appear here to accept.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Earnings</Text>
        <View style={styles.placeholderCard}>
          <Text style={styles.earningsAmount}>$0.00</Text>
          <Text style={styles.placeholderText}>Completed jobs will pay out here.</Text>
        </View>
      </View>
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
  greetingBlock: {
    gap: spacing.xs,
  },
  greeting: {
    ...typography.title,
    color: colors.text,
  },
  role: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  signOut: {
    ...typography.label,
    color: colors.worker,
  },
  onlineCard: {
    backgroundColor: colors.text,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  onlineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  offlineDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.textMuted,
  },
  onlineStatusText: {
    ...typography.label,
    color: colors.textInverse,
  },
  goOnlineButton: {
    width: 168,
    height: 168,
    borderRadius: radius.pill,
    backgroundColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goOnlineLabel: {
    ...typography.heading,
    color: colors.disabledText,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  onlineHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  section: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
  },
  placeholderCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  placeholderText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  earningsAmount: {
    ...typography.display,
    color: colors.text,
  },
});
