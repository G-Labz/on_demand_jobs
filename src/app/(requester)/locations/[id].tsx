import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { formatCents } from '@/lib/format';
import { getLocationById } from '@/services/locationService';
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export default function LocationDetail() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [location, setLocation] = useState<ServiceLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user || !id) return;
    try {
      const row = await getLocationById(id, user.id);
      setLocation(row);
      setError(row ? null : 'This location was not found.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this location.');
    } finally {
      setLoaded(true);
    }
  }, [user, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!loaded) {
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.requester} />
        </View>
      </ScreenContainer>
    );
  }

  if (!location) {
    return (
      <ScreenContainer>
        <Text style={styles.title}>Location</Text>
        <Text style={styles.error}>{error ?? 'This location was not found.'}</Text>
        <View style={styles.actions}>
          <AppButton
            label="Back to Saved Locations"
            variant="secondary"
            accentColor={colors.requester}
            onPress={() => router.replace('/(requester)/locations')}
          />
        </View>
      </ScreenContainer>
    );
  }

  const addr = [location.address_line1, location.address_line2].filter(Boolean).join(', ');

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>{location.nickname}</Text>
        <Text style={styles.subtitle}>{LOCATION_TYPE_LABELS[location.location_type]}</Text>
      </View>

      <View style={styles.card}>
        <SummaryRow label="Address" value={addr} />
        <SummaryRow
          label="City / ZIP"
          value={`${location.city}, ${location.state} ${location.zip_code}`}
        />
        <SummaryRow
          label="Bedrooms / Bathrooms"
          value={`${location.bedrooms ?? '—'} bd · ${location.bathrooms ?? '—'} ba`}
        />
        {location.sleeps != null ? (
          <SummaryRow label="Sleeps" value={String(location.sleeps)} />
        ) : null}
        <SummaryRow
          label="Laundry on site"
          value={location.laundry_on_site ? `Yes (${location.typical_laundry_loads ?? 1} loads)` : 'No'}
        />
        <SummaryRow label="Supplies provided" value={location.supplies_provided ? 'Yes' : 'No'} />
        {location.parking_notes ? (
          <SummaryRow label="Parking" value={location.parking_notes} />
        ) : null}
        {location.access_notes ? (
          <SummaryRow label="Access" value={location.access_notes} />
        ) : null}
        {location.restock_notes ? (
          <SummaryRow label="Restock" value={location.restock_notes} />
        ) : null}
        {location.default_cleaning_payout_cents != null ? (
          <SummaryRow
            label="Default payout"
            value={formatCents(location.default_cleaning_payout_cents)}
          />
        ) : null}
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Post Cleaning Job"
          accentColor={colors.requester}
          onPress={() =>
            router.push({ pathname: '/(requester)/jobs/new', params: { locationId: location.id } })
          }
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: spacing.xs, marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  summaryLabel: { ...typography.caption, color: colors.textSecondary, flexShrink: 0 },
  summaryValue: { ...typography.body, color: colors.text, flex: 1, textAlign: 'right' },
  error: { ...typography.body, color: colors.danger, marginTop: spacing.md },
  actions: { marginTop: spacing.xl },
});
