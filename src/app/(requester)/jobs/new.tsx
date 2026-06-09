import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { DateTimeField } from '@/components/DateTimeField';
import { OptionGroup } from '@/components/OptionGroup';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ToggleRow } from '@/components/ToggleRow';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { centsToDollarsString, dollarsToCents } from '@/lib/format';
import { createCleaningJob } from '@/services/jobService';
import { getRequesterLocations } from '@/services/locationService';
import type { ServiceLocation } from '@/types/locations';
import type { CleaningJobTypeSlug } from '@/types/jobs';

const JOB_TYPES: { value: CleaningJobTypeSlug; label: string }[] = [
  { value: 'str_turnover', label: 'STR Turnover Cleaning' },
  { value: 'home_cleaning', label: 'Home Cleaning' },
];

function parseFloatOrNull(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

export default function NewJob() {
  const router = useRouter();
  const { user } = useAuth();
  const { locationId } = useLocalSearchParams<{ locationId?: string }>();

  const [locations, setLocations] = useState<ServiceLocation[] | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    locationId ?? null,
  );
  const [jobType, setJobType] = useState<CleaningJobTypeSlug | null>(null);
  const [requestedStart, setRequestedStart] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [payoutDollars, setPayoutDollars] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [laundryRequired, setLaundryRequired] = useState(true);
  const [restockingRequired, setRestockingRequired] = useState(false);
  const [trashRemovalRequired, setTrashRemovalRequired] = useState(true);
  const [cleaningScope, setCleaningScope] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const prefillDone = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await getRequesterLocations(user.id);
      setLocations(rows);
      setError(null);
      if (!prefillDone.current) {
        const initialId = selectedLocationId ?? (rows.length === 1 ? rows[0].id : null);
        if (initialId) {
          setSelectedLocationId(initialId);
          const loc = rows.find((r) => r.id === initialId);
          if (loc?.default_cleaning_payout_cents != null) {
            setPayoutDollars(centsToDollarsString(loc.default_cleaning_payout_cents));
          }
        }
        prefillDone.current = true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your locations.');
    }
  }, [user, selectedLocationId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function handleSelectLocation(id: string) {
    setSelectedLocationId(id);
    const loc = locations?.find((r) => r.id === id);
    if (loc?.default_cleaning_payout_cents != null) {
      setPayoutDollars(centsToDollarsString(loc.default_cleaning_payout_cents));
    }
  }

  const selectedLocation = locations?.find((r) => r.id === selectedLocationId) ?? null;
  const isStr = jobType === 'str_turnover';
  const isHome = jobType === 'home_cleaning';

  const deadlineLabel = isStr
    ? 'Guest-ready by'
    : isHome
      ? 'Needed by / Preferred completion by'
      : 'Deadline';
  const startLabel = isStr
    ? 'Checkout / requested start (optional)'
    : 'Requested start (optional)';

  async function handleContinue() {
    setError(null);

    if (!selectedLocationId) {
      setError('Choose a location.');
      return;
    }
    if (!jobType) {
      setError('Choose a cleaning job type.');
      return;
    }
    if (!deadline) {
      setError('Enter a valid required deadline (date and time).');
      return;
    }
    const payoutCents = dollarsToCents(payoutDollars);
    if (payoutCents === null || payoutCents <= 0) {
      setError('Enter a payout greater than $0.');
      return;
    }
    if (new Date(deadline).getTime() <= Date.now()) {
      setError('The deadline must be in the future.');
      return;
    }
    if (
      requestedStart &&
      new Date(deadline).getTime() <= new Date(requestedStart).getTime()
    ) {
      setError('The deadline must be after the requested start.');
      return;
    }
    if (!user) {
      setError('Your session expired. Please log in again.');
      return;
    }

    setLoading(true);
    try {
      const job = await createCleaningJob(user.id, {
        service_location_id: selectedLocationId,
        job_type_slug: jobType,
        requested_start_at: requestedStart,
        deadline_at: deadline,
        payout_cents: payoutCents,
        estimated_hours: parseFloatOrNull(estimatedHours),
        laundry_required: laundryRequired,
        restocking_required: isStr ? restockingRequired : false,
        trash_removal_required: trashRemovalRequired,
        cleaning_scope: isHome ? cleaningScope.trim() || null : null,
        special_instructions: specialInstructions.trim() || null,
      });
      router.push({ pathname: '/(requester)/jobs/review', params: { jobId: job.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this job.');
    } finally {
      setLoading(false);
    }
  }

  const locationOptions =
    locations?.map((loc) => ({ value: loc.id, label: loc.nickname })) ?? [];

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Post a cleaning job</Text>
        <Text style={styles.subtitle}>
          {isHome
            ? 'A regular residential cleaning for your home or property.'
            : isStr
              ? 'A guest-ready turnover for your short-term rental.'
              : 'Choose a location and the type of cleaning you need.'}
        </Text>
      </View>

      <View style={styles.form}>
        {locations !== null && locations.length === 0 ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>
              You need a saved location first. Add one, then post a job.
            </Text>
            <AppButton
              label="Add Location"
              variant="secondary"
              accentColor={colors.requester}
              onPress={() => router.replace('/(requester)/locations/new')}
            />
          </View>
        ) : (
          <OptionGroup
            label="Location"
            options={locationOptions}
            value={selectedLocationId}
            onChange={handleSelectLocation}
            accentColor={colors.requester}
          />
        )}

        {selectedLocation ? (
          <Text style={styles.locationMeta}>
            {selectedLocation.bedrooms ?? '—'} bd · {selectedLocation.bathrooms ?? '—'} ba ·{' '}
            {selectedLocation.supplies_provided ? 'Supplies provided' : 'Bring supplies'}
          </Text>
        ) : null}

        <OptionGroup
          label="Cleaning job type"
          options={JOB_TYPES}
          value={jobType}
          onChange={setJobType}
          accentColor={colors.requester}
        />

        <DateTimeField
          label={startLabel}
          value={requestedStart}
          onChange={setRequestedStart}
          accentColor={colors.requester}
        />

        <DateTimeField
          label={deadlineLabel}
          value={deadline}
          onChange={setDeadline}
          showPresets
          accentColor={colors.requester}
          helper={
            isHome
              ? 'When the cleaning should be finished by.'
              : 'When the space must be guest-ready.'
          }
        />

        <AppInput
          label="Payout (USD)"
          value={payoutDollars}
          onChangeText={setPayoutDollars}
          placeholder="120"
          keyboardType="decimal-pad"
        />

        <AppInput
          label={isHome ? 'Estimated hours' : 'Estimated hours (optional)'}
          value={estimatedHours}
          onChangeText={setEstimatedHours}
          placeholder="3"
          keyboardType="decimal-pad"
          maxLength={4}
        />

        {/* Home Cleaning: scope of rooms/areas (lean free text, not a builder). */}
        {isHome ? (
          <AppInput
            label="Cleaning scope / rooms or areas"
            value={cleaningScope}
            onChangeText={setCleaningScope}
            placeholder="e.g. kitchen, 2 bathrooms, living room — whole-house standard clean"
            multiline
          />
        ) : null}

        {/* Job-type-aware toggles. */}
        <ToggleRow
          label="Laundry Required"
          value={laundryRequired}
          onValueChange={setLaundryRequired}
          accentColor={colors.requester}
        />
        {isStr ? (
          <ToggleRow
            label="Restocking Required"
            helper="Replace consumables (paper, toiletries, coffee)."
            value={restockingRequired}
            onValueChange={setRestockingRequired}
            accentColor={colors.requester}
          />
        ) : null}
        <ToggleRow
          label="Trash Removal"
          value={trashRemovalRequired}
          onValueChange={setTrashRemovalRequired}
          accentColor={colors.requester}
        />

        <AppInput
          label="Special Instructions (optional)"
          value={specialInstructions}
          onChangeText={setSpecialInstructions}
          placeholder="Anything the worker should know"
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <AppButton
          label="Review Job"
          loading={loading}
          onPress={handleContinue}
          accentColor={colors.requester}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
  form: { gap: spacing.lg },
  locationMeta: { ...typography.caption, color: colors.textSecondary, marginTop: -spacing.sm },
  note: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  noteText: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
});
