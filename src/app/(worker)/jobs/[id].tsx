import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { formatCents, formatLocalDateTime } from '@/lib/format';
import { getCleaningChecklistTemplate } from '@/services/jobService';
import { getWorkerProfile } from '@/services/workerService';
import {
  acceptJob,
  getWorkerAcceptedJobById,
  getWorkerJobDetail,
} from '@/services/workerJobService';
import type { CleaningChecklistTemplate, CleaningJobTypeSlug } from '@/types/jobs';
import type { WorkerProfile, WorkerTier } from '@/types/profiles';
import type { AcceptedWorkerJob, AvailableWorkerJob } from '@/types/worker-jobs';

const JOB_TYPE_LABELS: Record<CleaningJobTypeSlug, string> = {
  str_turnover: 'STR Turnover Cleaning',
  home_cleaning: 'Home Cleaning',
};

const TIER_RANK: Record<WorkerTier, number> = { L1: 1, L2: 2, L3: 3 };

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function groupByRoom(
  rows: CleaningChecklistTemplate[],
): { room: string; tasks: CleaningChecklistTemplate[] }[] {
  const groups: { room: string; tasks: CleaningChecklistTemplate[] }[] = [];
  for (const row of rows) {
    let group = groups.find((g) => g.room === row.room_name);
    if (!group) {
      group = { room: row.room_name, tasks: [] };
      groups.push(group);
    }
    group.tasks.push(row);
  }
  return groups;
}

export default function WorkerJobDetail() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [acceptedJob, setAcceptedJob] = useState<AcceptedWorkerJob | null>(null);
  const [availableJob, setAvailableJob] = useState<AvailableWorkerJob | null>(null);
  const [checklist, setChecklist] = useState<CleaningChecklistTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [justAccepted, setJustAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !id) return;
    try {
      const [workerProfile, mine] = await Promise.all([
        getWorkerProfile(user.id),
        getWorkerAcceptedJobById(id, user.id),
      ]);
      setWorker(workerProfile);

      if (mine) {
        setAcceptedJob(mine);
        setAvailableJob(null);
        setChecklist(await getCleaningChecklistTemplate(mine.job_type_slug));
      } else {
        const preview = await getWorkerJobDetail(id);
        setAvailableJob(preview);
        setAcceptedJob(null);
        if (preview) {
          setChecklist(await getCleaningChecklistTemplate(preview.job_type_slug));
        }
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this job.');
    } finally {
      setLoaded(true);
    }
  }, [user, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleAccept() {
    if (!availableJob || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      await acceptJob(availableJob.id);
      setJustAccepted(true);
      await load(); // reloads as an accepted job → reveals assignment details
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept this job.');
      // The job may have been taken — refresh so stale previews disappear.
      await load();
    } finally {
      setAccepting(false);
    }
  }

  if (!loaded) {
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.worker} />
        </View>
      </ScreenContainer>
    );
  }

  // ---------- Accepted view (assigned worker only — full assignment details) ----------
  if (acceptedJob) {
    const loc = acceptedJob.service_locations;
    const isHome = acceptedJob.job_type_slug === 'home_cleaning';
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <Text style={styles.title}>{acceptedJob.title}</Text>
          <View style={styles.badgeRow}>
            <StatusBadge label="Accepted" tone="success" />
            <StatusBadge label={JOB_TYPE_LABELS[acceptedJob.job_type_slug]} tone="neutral" />
          </View>
          {justAccepted ? (
            <Text style={styles.acceptedNote}>You accepted this job.</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <SummaryRow
            label={isHome ? 'Needed by' : 'Guest-ready by'}
            value={formatLocalDateTime(acceptedJob.deadline_at)}
          />
          {acceptedJob.requested_start_at ? (
            <SummaryRow
              label="Requested start"
              value={formatLocalDateTime(acceptedJob.requested_start_at)}
            />
          ) : null}
          <SummaryRow label="Payout" value={formatCents(acceptedJob.payout_cents)} />
          {acceptedJob.estimated_hours != null ? (
            <SummaryRow label="Estimated hours" value={`${acceptedJob.estimated_hours} h`} />
          ) : null}
          {isHome && acceptedJob.cleaning_scope ? (
            <SummaryRow label="Cleaning scope" value={acceptedJob.cleaning_scope} />
          ) : null}
          <SummaryRow
            label="Laundry"
            value={acceptedJob.laundry_required ? 'Required' : 'Not required'}
          />
          {!isHome ? (
            <SummaryRow
              label="Restocking"
              value={acceptedJob.restocking_required ? 'Required' : 'Not required'}
            />
          ) : null}
          <SummaryRow
            label="Trash removal"
            value={acceptedJob.trash_removal_required ? 'Required' : 'Not required'}
          />
        </View>

        {loc ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Assignment details</Text>
            <View style={styles.card}>
              <SummaryRow
                label="Address"
                value={[loc.address_line1, loc.address_line2].filter(Boolean).join(', ')}
              />
              <SummaryRow label="City / ZIP" value={`${loc.city}, ${loc.state} ${loc.zip_code}`} />
              {loc.access_notes ? <SummaryRow label="Access" value={loc.access_notes} /> : null}
              {loc.parking_notes ? <SummaryRow label="Parking" value={loc.parking_notes} /> : null}
              {loc.restock_notes ? <SummaryRow label="Restock" value={loc.restock_notes} /> : null}
              <SummaryRow
                label="Supplies provided"
                value={loc.supplies_provided ? 'Yes' : 'No — bring supplies'}
              />
            </View>
          </View>
        ) : null}

        {acceptedJob.special_instructions ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Special Instructions</Text>
            <View style={styles.card}>
              <Text style={styles.bodyText}>{acceptedJob.special_instructions}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checklist</Text>
          <Text style={styles.sectionSubtitle}>
            Proof-based completion unlocks in a later sprint.
          </Text>
          {groupByRoom(checklist).map((group) => (
            <View key={group.room} style={styles.checklistGroup}>
              <Text style={styles.checklistRoom}>{group.room}</Text>
              {group.tasks.map((task) => (
                <View key={task.id} style={styles.checklistItem}>
                  <Text style={styles.checklistTask}>• {task.task_label}</Text>
                  {task.requires_photo ? <StatusBadge label="Photo" tone="neutral" /> : null}
                </View>
              ))}
            </View>
          ))}
        </View>

        <AppButton
          label="Back to Dashboard"
          variant="secondary"
          accentColor={colors.worker}
          onPress={() => router.replace('/(worker)/dashboard')}
        />
      </ScreenContainer>
    );
  }

  // ---------- Unavailable ----------
  if (!availableJob) {
    return (
      <ScreenContainer>
        <Text style={styles.title}>Job unavailable</Text>
        <Text style={styles.bodyText}>
          {error ??
            'This job is no longer available — it may have been accepted by another worker or expired.'}
        </Text>
        <View style={styles.section}>
          <AppButton
            label="Back to Dashboard"
            variant="secondary"
            accentColor={colors.worker}
            onPress={() => router.replace('/(worker)/dashboard')}
          />
        </View>
      </ScreenContainer>
    );
  }

  // ---------- Available (pre-acceptance, safe fields only) ----------
  const isHome = availableJob.job_type_slug === 'home_cleaning';
  const isOnline = worker?.is_online ?? false;
  const isVerified = worker?.verification_status === 'verified';
  const tierOk =
    TIER_RANK[(worker?.worker_tier ?? 'L1') as WorkerTier] >=
    TIER_RANK[availableJob.required_worker_tier];

  const lockReason = !isVerified
    ? 'Accepting jobs unlocks after verification.'
    : !tierOk
      ? `This job requires Worker Tier ${availableJob.required_worker_tier}.`
      : !isOnline
        ? 'Go online to accept jobs.'
        : null;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>{availableJob.title}</Text>
        <View style={styles.badgeRow}>
          <StatusBadge label={JOB_TYPE_LABELS[availableJob.job_type_slug]} tone={isHome ? 'success' : 'info'} />
          <StatusBadge label={`Requires ${availableJob.required_worker_tier}`} tone="neutral" />
        </View>
      </View>

      <View style={styles.card}>
        <SummaryRow
          label={isHome ? 'Needed by' : 'Guest-ready by'}
          value={formatLocalDateTime(availableJob.deadline_at)}
        />
        {availableJob.requested_start_at ? (
          <SummaryRow
            label="Requested start"
            value={formatLocalDateTime(availableJob.requested_start_at)}
          />
        ) : null}
        <SummaryRow label="Payout" value={formatCents(availableJob.payout_cents)} />
        {availableJob.estimated_hours != null ? (
          <SummaryRow label="Estimated hours" value={`${availableJob.estimated_hours} h`} />
        ) : null}
        <SummaryRow
          label="Area"
          value={`${availableJob.city}, ${availableJob.state} ${availableJob.zip_code}`}
        />
        <SummaryRow
          label="Bedrooms / Bathrooms"
          value={`${availableJob.bedrooms ?? '—'} bd · ${availableJob.bathrooms ?? '—'} ba`}
        />
        {isHome && availableJob.cleaning_scope ? (
          <SummaryRow label="Cleaning scope" value={availableJob.cleaning_scope} />
        ) : null}
        <SummaryRow
          label="Laundry"
          value={availableJob.laundry_required ? 'Required' : 'Not required'}
        />
        {!isHome ? (
          <SummaryRow
            label="Restocking"
            value={availableJob.restocking_required ? 'Required' : 'Not required'}
          />
        ) : null}
        <SummaryRow
          label="Trash removal"
          value={availableJob.trash_removal_required ? 'Required' : 'Not required'}
        />
      </View>

      <View style={styles.privacyNote}>
        <Text style={styles.privacyNoteText}>
          The full address and access details unlock after you accept this job.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Checklist preview</Text>
        {groupByRoom(checklist).map((group) => (
          <View key={group.room} style={styles.checklistGroup}>
            <Text style={styles.checklistRoom}>{group.room}</Text>
            {group.tasks.map((task) => (
              <View key={task.id} style={styles.checklistItem}>
                <Text style={styles.checklistTask}>• {task.task_label}</Text>
                {task.requires_photo ? <StatusBadge label="Photo" tone="neutral" /> : null}
              </View>
            ))}
          </View>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {lockReason ? (
        <View style={styles.lockBanner}>
          <Text style={styles.lockText}>{lockReason}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <AppButton
          label="Accept Job"
          loading={accepting}
          disabled={lockReason !== null}
          onPress={handleAccept}
          accentColor={colors.worker}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.text },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  acceptedNote: { ...typography.bodyStrong, color: colors.worker },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  summaryLabel: { ...typography.caption, color: colors.textSecondary, flexShrink: 0 },
  summaryValue: { ...typography.body, color: colors.text, flex: 1, textAlign: 'right' },
  section: { gap: spacing.sm, marginBottom: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  sectionSubtitle: { ...typography.caption, color: colors.textSecondary },
  bodyText: { ...typography.body, color: colors.textSecondary },
  privacyNote: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  privacyNoteText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  lockBanner: {
    backgroundColor: colors.warningMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  lockText: { ...typography.caption, color: colors.warning, textAlign: 'center' },
  checklistGroup: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  checklistRoom: { ...typography.label, color: colors.text },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  checklistTask: { ...typography.body, color: colors.textSecondary, flex: 1 },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.md },
});
