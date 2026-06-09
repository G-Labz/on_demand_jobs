import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { getRequesterLocations } from '@/services/locationService';
import type { LocationType, ServiceLocation } from '@/types/locations';

const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  home: 'Home',
  str_property: 'STR Property',
  apartment: 'Apartment',
  condo: 'Condo',
  townhouse: 'Townhouse',
  small_business: 'Small Business',
  other: 'Other',
};

export default function LocationsList() {
  const router = useRouter();
  const { user } = useAuth();

  const [locations, setLocations] = useState<ServiceLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await getRequesterLocations(user.id);
      setLocations(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your locations.');
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Saved Locations</Text>
        <Text style={styles.subtitle}>Pick a location to post a cleaning job.</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} hitSlop={8}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {locations === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.requester} />
        </View>
      ) : null}

      {locations !== null && locations.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Add your first location to start posting cleaning jobs.
          </Text>
        </View>
      ) : null}

      {locations?.map((loc) => (
        <Pressable
          key={loc.id}
          accessibilityRole="button"
          style={styles.card}
          onPress={() =>
            router.push({ pathname: '/(requester)/locations/[id]', params: { id: loc.id } })
          }
        >
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{loc.nickname}</Text>
            <Text style={styles.cardMeta}>
              {LOCATION_TYPE_LABELS[loc.location_type]} · {loc.city}, {loc.state} {loc.zip_code}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}

      <View style={styles.actions}>
        <AppButton
          label="Add Location"
          accentColor={colors.requester}
          onPress={() => router.push('/(requester)/locations/new')}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  empty: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardBody: { flex: 1, gap: spacing.xs },
  cardTitle: { ...typography.bodyStrong, color: colors.text },
  cardMeta: { ...typography.caption, color: colors.textSecondary },
  chevron: { ...typography.title, color: colors.textMuted },
  actions: { marginTop: spacing.md },
});
